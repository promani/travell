// The sync relay: last write wins, cursors, validation, and the static whitelist.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

const PORT = 18000 + Math.floor(Math.random() * 1000);
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-'));
const base = `http://127.0.0.1:${PORT}`;
const gid = 'a'.repeat(32);
let proc;

test.before(async () => {
  proc = spawn(process.execPath, ['server/relay.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), RELAY_DATA: DATA, SERVE_STATIC: ROOT, WEATHER: '0', REDIS_URL: '' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`${base}/health`)).ok) return; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('relay did not start');
});
test.after(() => proc?.kill());

const post = (records) => fetch(`${base}/v1/${gid}/records`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ records }) });

test('stores records and pages them by cursor', async () => {
  await post([{ c: 'tasks', id: 'a', u: 1, d: 'x1' }, { c: 'tasks', id: 'b', u: 1, d: 'y1' }]);
  const all = await (await fetch(`${base}/v1/${gid}/records?since=0`)).json();
  assert.equal(all.records.length, 2);
  const none = await (await fetch(`${base}/v1/${gid}/records?since=${all.seq}`)).json();
  assert.equal(none.records.length, 0);
});

test('last write wins and older writes are ignored', async () => {
  await post([{ c: 'tasks', id: 'a', u: 5, d: 'x5' }]);
  await post([{ c: 'tasks', id: 'a', u: 3, d: 'x3' }]);
  const all = await (await fetch(`${base}/v1/${gid}/records?since=0`)).json();
  assert.equal(all.records.find((r) => r.id === 'a').d, 'x5');
});

test('a cursor ahead of the relay (it lost its data) gets everything and a reset, so the phone pushes all again', async () => {
  const all = await (await fetch(`${base}/v1/${gid}/records?since=0`)).json();
  assert.equal(all.reset, undefined);
  const ahead = await (await fetch(`${base}/v1/${gid}/records?since=${all.seq + 100}`)).json();
  assert.equal(ahead.reset, true);
  assert.equal(ahead.records.length, all.records.length);
});

test('rejects bad group ids and invalid records', async () => {
  assert.equal((await fetch(`${base}/v1/nothex/records`)).status, 404);
  await post([{ c: 'BAD!', id: 'z', u: 1, d: 'q' }, { c: 'tasks', id: 'z', u: 'no', d: 'q' }]);
  const all = await (await fetch(`${base}/v1/${gid}/records?since=0`)).json();
  assert.ok(!all.records.some((r) => r.id === 'z'));
});

test('serves the app but never the server code or repo files', async () => {
  assert.equal((await fetch(`${base}/`)).status, 200);
  assert.equal((await fetch(`${base}/js/main.js`)).headers.get('content-type'), 'text/javascript; charset=utf-8');
  for (const p of ['/server/relay.mjs', '/README.md', '/package.json', '/.git/config', '/data/../server/relay.mjs']) {
    assert.equal((await fetch(base + p)).status, 404, p);
  }
});
