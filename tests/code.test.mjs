// The trip code: the server only serves the trip's data to a browser that sent the right code (cookie), and slows
// down guessing. The real code is not in the repo: the server is started with the hash of a test code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from './helpers.mjs';
import { normCode } from '../js/gate.js';

const PORT = 19000 + Math.floor(Math.random() * 1000);
const base = `http://127.0.0.1:${PORT}`;
const tripId = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/trip.json'), 'utf8')).id;
const check = crypto.createHash('sha256').update(`travell-code:${tripId}:T3ST5`).digest('hex');
let proc;

test.before(async () => {
  const env = { ...process.env, PORT: String(PORT), RELAY_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'relay-')), SERVE_STATIC: ROOT, WEATHER: '0', REDIS_URL: '', TRIP_CHANGES: 'file', TRIP_CODE_CHECK: check };
  proc = spawn(process.execPath, ['server/relay.mjs'], { cwd: ROOT, env, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`${base}/health`)).ok) return; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('relay did not start');
});
test.after(() => proc?.kill());

const send = (code) => fetch(`${base}/v1/code`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });

test('the code is normalised to upper-case letters and numbers', () => {
  assert.equal(normCode(' ab-1 2c '), 'AB12C');
  assert.equal(normCode(null), '');
});

test('trip.json carries only the hash of the code', () => {
  assert.match(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/trip.json'), 'utf8')).sync.codeCheck, /^[0-9a-f]{64}$/);
});

test('without the code the trip data is closed; the app shell is not', async () => {
  for (const p of ['/data/trip.json', '/data/itinerary.json', '/data/phrases.json', '/v1/trip/rev', '/v1/weather']) assert.equal((await fetch(base + p)).status, 401, p);
  assert.equal((await fetch(`${base}/data/trip.json`, { headers: { cookie: 'travell_code=XXXXX' } })).status, 401);
  for (const p of ['/', '/js/main.js', '/js/gate.js', '/css/app.css']) assert.equal((await fetch(base + p)).status, 200, p);
});

test('the right code sets the cookie that opens the data', async () => {
  assert.equal((await send('nope1')).status, 401);
  const r = await send('t3st5');
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie');
  assert.match(cookie, /^travell_code=T3ST5;.*HttpOnly/);
  const res = await fetch(`${base}/data/trip.json`, { headers: { cookie: cookie.split(';')[0] } });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).id, tripId);
});

test('a browser with the cookie can get the code back (it is the sync key); without it, no', async () => {
  assert.equal((await fetch(`${base}/v1/code`)).status, 401);
  assert.equal((await fetch(`${base}/v1/code`, { headers: { cookie: 'travell_code=XXXXX' } })).status, 401);
  const r = await fetch(`${base}/v1/code`, { headers: { cookie: 'travell_code=T3ST5' } });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).code, 'T3ST5');
});

test('too many wrong codes from one place are refused for a while', async () => {
  const codes = [];
  for (let i = 0; i < 11; i++) codes.push((await send(`BAD${i}`)).status);
  assert.equal(codes.at(-1), 429);
  assert.equal((await send('T3ST5')).status, 429, 'even the right one, until it cools down');
});
