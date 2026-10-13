// Admin changes over the repo JSON: merge, validation, storage and the admin API behind ADMIN_API_KEY.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from './helpers.mjs';
import { readBase, merge, resolveBatch, tripData, changeStore } from '../server/tripdata.mjs';

const base = readBase(path.join(ROOT, 'data'));
const apply = (changes) => { const r = resolveBatch(base, changes); assert.ok(!r.error, r.error); return merge(base, Object.fromEntries(r.records.map((x) => [`${x.col}/${x.id}`, x]))); };

test('patch merges fields into an existing record and keeps the rest', () => {
  const l = base['lodging.json'][0];
  const files = apply([{ op: 'patch', col: 'lodging', id: l.id, data: { name: 'Hotel Real', status: 'reservado' } }]);
  const got = files['lodging.json'].find((x) => x.id === l.id);
  assert.equal(got.name, 'Hotel Real'); assert.equal(got.checkIn, l.checkIn);
  assert.notEqual(base['lodging.json'][0].name, 'Hotel Real', 'the base is not modified');
});

test('activities move between days and are created inside their day', () => {
  const d4 = base['itinerary.json'].days[3], a = d4.activities[0];
  const files = apply([
    { op: 'patch', col: 'activities', id: a.id, data: { dayId: 'd05' } },
    { op: 'put', col: 'activities', id: 'a-nueva', data: { dayId: 'd04', title: 'Nueva', start: '21:00' } },
  ]);
  const days = Object.fromEntries(files['itinerary.json'].days.map((d) => [d.id, d]));
  assert.ok(!days.d04.activities.some((x) => x.id === a.id) && days.d05.activities.some((x) => x.id === a.id));
  assert.ok(days.d04.activities.some((x) => x.id === 'a-nueva' && !('dayId' in x)));
});

test('places: new ones go to the last place file, deletes reach any file', () => {
  const p = base['places.json'][0];
  const files = apply([{ op: 'del', col: 'places', id: p.id }, { op: 'put', col: 'places', id: 'p-nuevo', data: { name: 'Nuevo', cityId: 'shanghai', lat: 31.2, lon: 121.4 } }]);
  assert.ok(!files['places.json'].some((x) => x.id === p.id));
  assert.ok(files['places-extra.json'].some((x) => x.id === 'p-nuevo'));
});

test('validation rejects bad batches as a whole', () => {
  assert.match(resolveBatch(base, [{ op: 'put', col: 'activities', id: 'x', data: { title: 'X', dayId: 'd99' } }]).error, /no existe/);
  assert.match(resolveBatch(base, [{ op: 'put', col: 'lodging', id: 'l-x', data: { name: 'X', checkIn: '2026-11-20', checkOut: '2026-11-19' } }]).error, /check-out/);
  assert.match(resolveBatch(base, [{ op: 'patch', col: 'days', id: 'd04', data: { date: '2026-01-01' } }]).error, /no se puede cambiar date/);
  assert.match(resolveBatch(base, [{ op: 'put', col: 'secrets', id: 'x', data: {} }]).error, /desconocida/);
  assert.match(resolveBatch(base, [{ op: 'put', col: 'transport', id: 't-x', data: { kind: 'tren' } }]).error, /falta route/);
  const r = resolveBatch(base, [{ op: 'patch', col: 'lodging', id: base['lodging.json'][0].id, data: { name: 'ok' } }, { op: 'del', col: 'tasks', id: 'nope' }]);
  assert.equal(r.index, 1);
});

test('tripData stores changes, bumps the revision and reverts to the repo', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trip-'));
  const t = tripData({ dataDir: path.join(ROOT, 'data'), store: changeStore({ tripId: 'x', dir }), log: () => {} });
  const id = base['lodging.json'][0].id;
  const out = await t.apply([{ op: 'patch', col: 'lodging', id, data: { name: 'Otro' }, label: 'Renombrar' }], { by: 'test' });
  assert.equal(out.rev, 1);
  assert.equal((await t.files())['lodging.json'][0].name, 'Otro');
  assert.equal((await t.changes()).log[0].changes[0].label, 'Renombrar');
  await t.revert('lodging', id);
  assert.equal((await t.files())['lodging.json'][0].name, base['lodging.json'][0].name);
  assert.equal(await t.rev(), 2);
});

test('admin API needs the key and the app reads the merged files', async () => {
  const PORT = 19000 + Math.floor(Math.random() * 1000), b = `http://127.0.0.1:${PORT}`;
  const proc = spawn(process.execPath, ['server/relay.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), RELAY_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'relay-')), SERVE_STATIC: ROOT, WEATHER: '0', REDIS_URL: '', ADMIN_API_KEY: 'k-test', KIMI_API_KEY: '' }, stdio: 'ignore' });
  try {
    for (let i = 0; i < 50; i++) { try { if ((await fetch(`${b}/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 100)); }
    const body = JSON.stringify({ changes: [{ op: 'patch', col: 'lodging', id: base['lodging.json'][0].id, data: { name: 'Desde admin' } }] });
    assert.equal((await fetch(`${b}/v1/admin/changes`, { method: 'POST', body })).status, 401);
    assert.equal((await fetch(`${b}/v1/admin/changes`, { method: 'POST', body, headers: { authorization: 'Bearer nope' } })).status, 401);
    const ok = await fetch(`${b}/v1/admin/changes`, { method: 'POST', body, headers: { authorization: 'Bearer k-test', 'content-type': 'application/json' } });
    assert.equal(ok.status, 200);
    assert.equal((await (await fetch(`${b}/data/lodging.json`)).json())[0].name, 'Desde admin');
    assert.equal((await (await fetch(`${b}/v1/trip/rev`)).json()).rev, 1);
    assert.equal((await fetch(`${b}/v1/ai/extract`, { method: 'POST', body: '{}', headers: { authorization: 'Bearer k-test' } })).status, 503, 'no AI without KIMI_API_KEY');
  } finally { proc.kill(); }
});
