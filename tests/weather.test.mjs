// Weather: forecast vs typical weather, keeping earlier forecasts, the RESP parser and the Redis store.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeather, normalFor, weatherStore } from '../server/weather.mjs';
import { parseReply } from '../server/redis.mjs';

const trip = { id: 't', cities: [{ id: 'a', center: [1, 2] }, { id: 'b', center: [3, 4] }] };
const days = [{ date: '2026-11-12', cityId: 'a' }, { date: '2026-11-13', cityId: null }, { date: '2026-12-01', cityId: 'b' }];

// Fake Open-Meteo: a forecast for every city starting "today", and a constant past for the archive.
function fakeFetch(calls) {
  return async (url) => {
    calls.push(url);
    const u = new URL(url), n = u.searchParams.get('latitude').split(',').length;
    const block = (time, tmax, code, precip) => ({ daily: { time, weather_code: time.map(() => code), temperature_2m_max: time.map(() => tmax), temperature_2m_min: time.map(() => tmax - 8), precipitation_sum: time.map(() => precip), precipitation_probability_max: time.map(() => 10) } });
    if (u.hostname.startsWith('api.')) return Array.from({ length: n }, () => block(['2026-11-10', '2026-11-11', '2026-11-12'], 20, 2, 0));
    const time = []; for (let d = new Date(u.searchParams.get('start_date')); d <= new Date(u.searchParams.get('end_date')); d.setUTCDate(d.getUTCDate() + 1)) time.push(d.toISOString().slice(0, 10));
    return Array.from({ length: n }, () => block(time, 10, 51, 0.2));
  };
}

test('uses the forecast inside the 16-day window and typical weather after it', async () => {
  const calls = [];
  const doc = await buildWeather({ trip, days, today: '2026-11-10', fetchJson: fakeFetch(calls) });
  assert.equal(doc.days['a|2026-11-12'].source, 'forecast');
  assert.equal(doc.days['a|2026-11-12'].tmax, 20);
  const n = doc.days['b|2026-12-01'];
  assert.equal(n.source, 'normal');
  assert.equal(n.tmax, 10);
  assert.equal(n.code, 3, 'drizzle with < 1 mm counts as a cloudy day');
  assert.equal(n.pop, 0);
  assert.deepEqual(n.years, [2021, 2025]);
  assert.equal(Object.keys(doc.days).length, 2, 'days without a city (flights) are skipped');
  assert.equal(calls.filter((u) => u.includes('archive')).length, 5, 'one archive request per past year, all cities at once');
});

test('skips the forecast request when the trip is far away', async () => {
  const calls = [];
  const doc = await buildWeather({ trip, days, today: '2026-10-01', fetchJson: fakeFetch(calls) });
  assert.ok(!calls.some((u) => u.includes('//api.open-meteo.com')));
  assert.equal(doc.days['a|2026-11-12'].source, 'normal');
});

test('keeps an earlier forecast when today the forecast fails', async () => {
  const prev = { days: { 'a|2026-11-12': { source: 'forecast', tmax: 25, tmin: 15, code: 0 } } };
  const fetchJson = async (url) => { if (url.includes('//api.open-meteo.com')) throw new Error('down'); return fakeFetch([])(url); };
  const doc = await buildWeather({ trip, days, today: '2026-11-11', fetchJson, prev });
  assert.equal(doc.days['a|2026-11-12'].source, 'forecast');
  assert.equal(doc.days['a|2026-11-12'].tmax, 25);
});

test('typical weather averages the same dates ±1 day across years', () => {
  const past = { '2024-11-11': { tmax: 10, tmin: 0, precip: 5, code: 61 }, '2024-11-12': { tmax: 14, tmin: 4, precip: 0, code: 0 }, '2025-11-12': { tmax: 12, tmin: 2, precip: 0, code: 0 } };
  const n = normalFor('2026-11-12', past, [2024, 2025]);
  assert.equal(n.tmax, 12); assert.equal(n.tmin, 2); assert.equal(n.pop, 33); assert.equal(n.code, 1); assert.equal(n.samples, 3);
});

test('parses RESP replies, including partial buffers', () => {
  assert.deepEqual(parseReply(Buffer.from('+OK\r\n')), ['OK', 5]);
  assert.deepEqual(parseReply(Buffer.from('$5\r\nhola!\r\n')), ['hola!', 11]);
  assert.deepEqual(parseReply(Buffer.from('$-1\r\n')), [null, 5]);
  assert.equal(parseReply(Buffer.from('$5\r\nho')), null);
  assert.ok(parseReply(Buffer.from('-ERR nope\r\n'))[0] instanceof Error);
  assert.deepEqual(parseReply(Buffer.from('*2\r\n:1\r\n$1\r\nx\r\n'))[0], [1, 'x']);
});

test('stores the document in Redis', { skip: !process.env.REDIS_URL && 'set REDIS_URL to run' }, async () => {
  const store = weatherStore({ tripId: `test-${process.pid}`, redisUrl: process.env.REDIS_URL });
  await store.save({ days: { x: 1 }, day: '2026-01-01' });
  assert.deepEqual(await store.load(), { days: { x: 1 }, day: '2026-01-01' });
});
