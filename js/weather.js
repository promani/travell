// Weather per trip day. The relay downloads it from Open-Meteo once a day (server/weather.mjs); the app fetches
// it at most once a day and keeps a copy in localStorage, so it is there offline too.
import { D, kv, bus } from './store.js';
import { relayBase } from './sync.js';
import { esc, ic } from './util.js';

const KEY = 'weather';
const today = () => new Date().toISOString().slice(0, 10);

export const weatherDoc = () => kv.get(KEY, null);

export function weatherOf(day) {
  if (!day?.cityId) return null;
  return weatherDoc()?.days?.[`${day.cityId}|${day.date}`] || null;
}

export async function refreshWeather({ force = false } = {}) {
  if (!force && weatherDoc()?.fetchedOn === today()) return false;
  const base = relayBase();
  if (!base || !navigator.onLine) return false;
  try {
    const res = await fetch(`${base}/v1/weather`, { cache: 'no-store' });
    if (!res.ok) return false;
    const doc = await res.json();
    if (doc?.tripId !== D.trip.id || !doc.days) return false;
    kv.set(KEY, { ...doc, fetchedOn: today() });
    bus.emit('weather');
    return true;
  } catch { return false; }
}

// WMO weather codes (https://open-meteo.com/en/docs) → Font Awesome icon + label.
const WMO = [
  [[0], 'sun', 'Despejado'], [[1], 'cloud-sun', 'Mayormente despejado'], [[2], 'cloud-sun', 'Parcialmente nublado'], [[3], 'cloud', 'Nublado'],
  [[45, 48], 'smog', 'Niebla'], [[51, 53, 55, 56, 57], 'cloud-rain', 'Llovizna'], [[61, 63, 65, 66, 67], 'cloud-showers-heavy', 'Lluvia'],
  [[71, 73, 75, 77, 85, 86], 'snowflake', 'Nieve'], [[80, 81, 82], 'cloud-sun-rain', 'Chaparrones'], [[95, 96, 99], 'cloud-bolt', 'Tormenta'],
];
export function wmo(code) {
  const w = WMO.find(([cs]) => cs.includes(code));
  return w ? { icon: w[1], label: w[2] } : { icon: 'temperature-half', label: '' };
}

/** One line for a hero: "[icon] 18° / 10° · Parcialmente nublado · [drop] 27%". `prefix` labels whose weather it is. */
export function weatherLine(day, { prefix = '' } = {}) {
  const w = weatherOf(day);
  if (!w) return '';
  const { icon, label } = wmo(w.code);
  const typical = w.source === 'normal';
  const title = typical ? `Clima típico para esta fecha (promedio ${w.years?.join('–') || 'de años anteriores'}, Open-Meteo)` : 'Pronóstico de Open-Meteo';
  return `<p class="wx" title="${esc(title)}">${prefix ? `<span class="wx-pre">${esc(prefix)}</span>` : ''}<span class="wx-ic">${ic(icon)}</span>
    <b>${Math.round(w.tmax)}°</b><span class="wx-min">/ ${Math.round(w.tmin)}°</span>
    <span class="wx-txt">${esc(label)}${w.pop != null ? ` · ${ic('droplet')} ${w.pop}%` : ''}${typical ? ' · <i>típico</i>' : ''}</span></p>`;
}
