// Weather for every day of the trip, from Open-Meteo (free, no API key).
//  - days inside the 16-day forecast window: the forecast for that city and date;
//  - days further away: the typical weather for those dates (average of the same dates ±1 day over the last 5 years).
// The relay refreshes it once a day and keeps it in Redis (REDIS_URL) or, without Redis, in a file in RELAY_DATA.
// Clients read GET /v1/weather and keep their own copy for offline use.
import fs from 'node:fs';
import path from 'node:path';
import { redis } from './redis.mjs';

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const YEARS = 5, FORECAST_DAYS = 16, RAIN_MM = 1;

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const round1 = (x) => Math.round(x * 10) / 10;
const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
// Typical weather: the most frequent kind of day, not the most frequent raw WMO code (too noisy).
const GROUPS = [[[0, 1], 1], [[2], 2], [[3], 3], [[45, 48], 45], [[51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82], 61], [[71, 73, 75, 77, 85, 86], 71], [[95, 96, 99], 95]];
const codeGroup = (c) => GROUPS.find(([cs]) => cs.includes(c))?.[1] ?? c;
// Reanalysis data flags drizzle on many dry days: a day only counts as rainy/snowy with ≥ 1 mm, otherwise it was cloudy.
const sampleKind = (s) => { const g = codeGroup(s.code); return (g === 61 || g === 71 || g === 95) && (s.precip ?? 0) < RAIN_MM ? 3 : g; };
function mode(a) {
  const n = new Map(); a.forEach((x) => n.set(x, (n.get(x) || 0) + 1));
  return [...n].sort((x, y) => y[1] - x[1] || x[0] - y[0])[0]?.[0] ?? null;
}

/** Cities (with coordinates) that appear in the itinerary. */
export function tripCities(trip, days) {
  const ids = [...new Set(days.map((d) => d.cityId).filter(Boolean))];
  return ids.map((id) => trip.cities.find((c) => c.id === id)).filter((c) => c?.center);
}

function locParams(cities) {
  return `latitude=${cities.map((c) => c.center[0]).join(',')}&longitude=${cities.map((c) => c.center[1]).join(',')}&timezone=auto`;
}
const asList = (r) => (Array.isArray(r) ? r : [r]);

/** { date: {code, tmax, tmin, precip, pop} } from one Open-Meteo daily block. */
function dailyMap(daily) {
  const out = {};
  (daily?.time || []).forEach((t, i) => {
    const tmax = daily.temperature_2m_max?.[i], tmin = daily.temperature_2m_min?.[i];
    if (tmax == null || tmin == null) return;
    out[t] = { code: daily.weather_code?.[i] ?? null, tmax, tmin, precip: daily.precipitation_sum?.[i] ?? null, pop: daily.precipitation_probability_max?.[i] ?? null };
  });
  return out;
}

/** Typical weather for `date` from past years' daily data (same date ±1 day). */
export function normalFor(date, pastByDate, years) {
  const samples = [];
  for (const y of years) {
    const base = `${y}${date.slice(4)}`;
    if (Number.isNaN(Date.parse(base))) continue;               // 29 Feb on a non-leap year
    for (const off of [-1, 0, 1]) { const s = pastByDate[addDays(base, off)]; if (s) samples.push(s); }
  }
  if (!samples.length) return null;
  const precip = samples.map((s) => s.precip ?? 0);
  return {
    code: mode(samples.filter((s) => s.code != null).map(sampleKind)),
    tmax: round1(avg(samples.map((s) => s.tmax))), tmin: round1(avg(samples.map((s) => s.tmin))),
    precip: round1(avg(precip)), pop: Math.round((precip.filter((p) => p >= RAIN_MM).length / samples.length) * 100),
    samples: samples.length,
  };
}

/**
 * Builds the weather document. `fetchJson(url)` is injected so it can be tested offline.
 * Entries are keyed "cityId|YYYY-MM-DD" so a day keeps its weather even if the itinerary moves it to another city.
 */
export async function buildWeather({ trip, days, today = iso(new Date()), fetchJson, prev = null, log = () => {} }) {
  const cities = tripCities(trip, days);
  const wanted = days.filter((d) => d.cityId && d.date);
  const out = { ...(prev?.days || {}) };
  if (!cities.length || !wanted.length) return { tripId: trip.id, provider: 'Open-Meteo', updatedAt: new Date().toISOString(), day: today, days: out };

  const forecast = {};
  const lastForecast = addDays(today, FORECAST_DAYS - 1);
  if (wanted.some((d) => d.date >= today && d.date <= lastForecast)) {
    try {
      const r = asList(await fetchJson(`${FORECAST}?${locParams(cities)}&forecast_days=${FORECAST_DAYS}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max`));
      cities.forEach((c, i) => { forecast[c.id] = dailyMap(r[i]?.daily); });
    } catch (e) { log(`weather: forecast failed: ${e.message}`); }
  }

  // Past years for the climate normals. The archive lags a few days, so only use years that are fully past.
  const dates = wanted.map((d) => d.date).sort();
  const first = dates[0], last = dates[dates.length - 1];
  const past = Object.fromEntries(cities.map((c) => [c.id, {}]));
  const years = [];
  const tripYear = +first.slice(0, 4), span = +last.slice(0, 4) - tripYear;   // span = 1 if the trip crosses New Year
  for (let yy = tripYear - 1; years.length < YEARS && yy >= tripYear - YEARS - 2; yy--) {
    const start = addDays(`${yy}${first.slice(4)}`, -1), end = addDays(`${yy + span}${last.slice(4)}`, 1);
    if (end >= addDays(today, -7)) continue;
    try {
      const r = asList(await fetchJson(`${ARCHIVE}?${locParams(cities)}&start_date=${start}&end_date=${end}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum`));
      cities.forEach((c, i) => Object.assign(past[c.id], dailyMap(r[i]?.daily)));
      years.push(yy);
    } catch (e) { log(`weather: archive ${yy} failed: ${e.message}`); }
  }

  for (const d of wanted) {
    const key = `${d.cityId}|${d.date}`;
    const f = forecast[d.cityId]?.[d.date];
    if (f) { out[key] = { ...f, tmax: round1(f.tmax), tmin: round1(f.tmin), source: 'forecast' }; continue; }
    const n = years.length ? normalFor(d.date, past[d.cityId], years.map((y) => y + (+d.date.slice(0, 4) - tripYear))) : null;
    // A forecast fetched on a previous day is better than a normal: keep it until the day has passed.
    if (n && !(out[key]?.source === 'forecast' && d.date >= today)) out[key] = { ...n, source: 'normal', years: [Math.min(...years), Math.max(...years)] };
  }
  return { tripId: trip.id, provider: 'Open-Meteo', updatedAt: new Date().toISOString(), day: today, days: out };
}

// ------------------------------------------------------------------ storage + daily refresh

export function weatherStore({ tripId, redisUrl, dir }) {
  const key = `travell:weather:${tripId}`;
  if (redisUrl) {
    const r = redis(redisUrl);
    return { kind: 'redis', load: async () => JSON.parse((await r.get(key)) || 'null'), save: (doc) => r.set(key, JSON.stringify(doc)) };
  }
  const file = path.join(dir, `weather-${tripId}.json`);
  return {
    kind: 'file',
    load: async () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } },
    save: async (doc) => { fs.writeFileSync(file + '.tmp', JSON.stringify(doc)); fs.renameSync(file + '.tmp', file); },
  };
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Loads the cached document, refreshes it if it is not from today, and re-checks every hour. */
export function startWeather({ dataDir, store, log = console.log, auto = true }) {
  const readJson = (f) => JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
  const state = { doc: null, refreshing: null };
  const refresh = async () => {
    const trip = readJson('trip.json'), it = readJson('itinerary.json');
    const doc = await buildWeather({ trip, days: it.days || it, fetchJson, prev: state.doc, log });
    if (Object.keys(doc.days).length) { state.doc = doc; await store.save(doc).catch((e) => log(`weather: save failed: ${e.message}`)); }
    log(`weather: ${Object.keys(doc.days).length} days updated (${store.kind})`);
    return doc;
  };
  const check = () => {
    if (state.refreshing || state.doc?.day === iso(new Date())) return state.refreshing;
    state.refreshing = refresh().catch((e) => log(`weather: ${e.message}`)).finally(() => { state.refreshing = null; });
    return state.refreshing;
  };
  const ready = store.load().then((d) => { state.doc = d; }).catch((e) => log(`weather: load failed: ${e.message}`))
    .then(() => (auto ? check() : null));
  if (auto) setInterval(check, 60 * 60 * 1000).unref();
  return { get: () => state.doc, ready, refresh: check };
}
