// Admin changes over the repo JSON: merge, validation, storage and the admin API behind ADMIN_API_KEY.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from './helpers.mjs';
import { readBase, merge, resolveBatch, tripData, changeStore } from '../server/tripdata.mjs';

// the trip data is behind the trip code (server/relay.mjs): these servers run with a test code
const CODE_CHECK = crypto.createHash('sha256').update(`travell-code:${JSON.parse(fs.readFileSync(path.join(ROOT, 'data/trip.json'), 'utf8')).id}:T3ST5`).digest('hex');
const OPEN = { headers: { cookie: 'travell_code=T3ST5' } };

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
  const proc = spawn(process.execPath, ['server/relay.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), RELAY_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'relay-')), SERVE_STATIC: ROOT, WEATHER: '0', REDIS_URL: '', ADMIN_API_KEY: 'k-test', TRIP_CODE_CHECK: CODE_CHECK }, stdio: 'ignore' });
  try {
    for (let i = 0; i < 50; i++) { try { if ((await fetch(`${b}/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 100)); }
    const body = JSON.stringify({ changes: [{ op: 'patch', col: 'lodging', id: base['lodging.json'][0].id, data: { name: 'Desde admin' } }] });
    assert.equal((await fetch(`${b}/v1/admin/changes`, { method: 'POST', body })).status, 401);
    assert.equal((await fetch(`${b}/v1/admin/changes`, { method: 'POST', body, headers: { authorization: 'Bearer nope' } })).status, 401);
    const ok = await fetch(`${b}/v1/admin/changes`, { method: 'POST', body, headers: { authorization: 'Bearer k-test', 'content-type': 'application/json' } });
    assert.equal(ok.status, 200);
    assert.equal((await (await fetch(`${b}/data/lodging.json`, OPEN)).json())[0].name, 'Desde admin');
    assert.equal((await (await fetch(`${b}/v1/trip/rev`, OPEN)).json()).rev, 1);
    assert.equal((await fetch(`${b}/v1/ai/extract`, { method: 'POST', body: '{}', headers: { authorization: 'Bearer k-test' } })).status, 404, 'no AI in the app');
  } finally { proc.kill(); }
});

test('MCP server: same key, reads the trip, previews and applies changes', async () => {
  const PORT = 20000 + Math.floor(Math.random() * 1000), b = `http://127.0.0.1:${PORT}`;
  const proc = spawn(process.execPath, ['server/relay.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), RELAY_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'relay-')), SERVE_STATIC: ROOT, WEATHER: '0', REDIS_URL: '', ADMIN_API_KEY: 'k-test', TRIP_CODE_CHECK: CODE_CHECK }, stdio: 'ignore' });
  let n = 0;
  const rpc = (method, params, key = 'k-test') => fetch(`${b}/mcp`, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method, params }) });
  const tool = async (name, args) => (await (await rpc('tools/call', { name, arguments: args })).json()).result;
  const lodging = base['lodging.json'][0];
  try {
    for (let i = 0; i < 50; i++) { try { if ((await fetch(`${b}/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 100)); }
    assert.equal((await rpc('tools/list', {}, 'nope')).status, 401);
    const init = (await (await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } })).json()).result;
    assert.equal(init.protocolVersion, '2025-06-18');
    assert.ok(init.capabilities.tools && init.instructions.includes('patch'));
    const note = await fetch(`${b}/mcp`, { method: 'POST', headers: { authorization: 'Bearer k-test' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
    assert.equal(note.status, 202);
    const names = (await (await rpc('tools/list', {})).json()).result.tools.map((t) => t.name);
    assert.deepEqual(names, ['trip_overview', 'get_day', 'get_records', 'preview_changes', 'apply_changes', 'list_changes', 'revert_record']);
    assert.ok(JSON.parse((await tool('trip_overview', {})).content[0].text).days.length > 10);
    const day = JSON.parse((await tool('get_day', { day: '4' })).content[0].text);
    assert.equal(day.id, 'd04');
    assert.ok(Array.isArray(day.activities) && Array.isArray(day.notes) && day.lodging.length);
    const ch = [{ op: 'patch', col: 'lodging', id: lodging.id, data: { name: 'Desde MCP' }, label: 'Renombrar' }];
    const prev = JSON.parse((await tool('preview_changes', { changes: ch })).content[0].text);
    assert.deepEqual(prev.changes[0].fields.name, { before: lodging.name, after: 'Desde MCP' });
    assert.equal((await (await fetch(`${b}/v1/trip/rev`, OPEN)).json()).rev, 0, 'preview writes nothing');
    assert.ok((await tool('apply_changes', { changes: [{ op: 'patch', col: 'days', id: 'd04', data: { n: 9 } }] })).isError);
    assert.ok(!(await tool('apply_changes', { changes: ch, note: 'test' })).isError);
    assert.equal((await (await fetch(`${b}/data/lodging.json`, OPEN)).json())[0].name, 'Desde MCP');
    assert.equal(JSON.parse((await tool('list_changes', {})).content[0].text).log[0].by, 'claude (mcp)');
    assert.ok(!(await tool('revert_record', { collection: 'lodging', id: lodging.id })).isError);
    assert.equal((await (await fetch(`${b}/data/lodging.json`, OPEN)).json())[0].name, lodging.name);
    // the key in the URL, for the custom connector of the Claude app
    const viaPath = (key) => fetch(`${b}/mcp/${key}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'tools/list' }) });
    assert.equal((await viaPath('nope')).status, 401);
    assert.equal((await (await viaPath('k-test')).json()).result.tools.length, names.length);
    // a booking: the flight's code goes to tickets, the expense to expenses
    const t = base['travelers.json'][0].id;
    const booking = [
      { op: 'put', col: 'tickets', id: 'transport:t01', data: { code: 'QX7P2L', qrs: [{ id: 'qr-1', text: 'M1ROMANI/PEHUEN', format: 'qr_code' }] } },
      { op: 'put', col: 'expenses', id: 'ex-vuelo', data: { desc: 'Vuelo', amount: 900, currency: 'USD', paidBy: t, split: { mode: 'equal', among: [t] } } },
      { op: 'put', col: 'passports', id: t, data: { number: 'AAA123456', expires: '2031-05-01' } },
    ];
    assert.ok(!(await tool('apply_changes', { changes: booking })).isError);
    assert.equal((await (await fetch(`${b}/data/tickets.json`, OPEN)).json()).find((x) => x.id === 'transport:t01').code, 'QX7P2L');
    assert.equal((await (await fetch(`${b}/data/expenses.json`, OPEN)).json())[0].amount, 900);
    for (const bad of [{ op: 'put', col: 'tickets', id: 'transport:nope', data: { code: 'X' } }, { op: 'put', col: 'tickets', id: 'hotel:l01', data: { code: 'X' } },
      { op: 'put', col: 'expenses', id: 'ex-2', data: { desc: 'x', amount: 1, currency: 'USD', paidBy: 'nadie', split: { mode: 'equal', among: [t] } } },
      { op: 'put', col: 'passports', id: 'nadie', data: { number: 'X' } }]) assert.ok((await tool('preview_changes', { changes: [bad] })).isError, JSON.stringify(bad));
  } finally { proc.kill(); }
});
