// Photos and attachments: the relay forwards them to R2 (here a fake S3 server) and streams them back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

const PORT = 19000 + Math.floor(Math.random() * 500);
const S3_PORT = PORT + 600;
const base = `http://127.0.0.1:${PORT}`;
const objects = new Map();           // "/bucket/key" -> { body, type }
const seen = [];                     // requests that reached the fake R2
let proc, s3;

test.before(async () => {
  s3 = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers });
      if (req.method === 'PUT') { objects.set(req.url, { body: Buffer.concat(chunks), type: req.headers['content-type'] }); res.writeHead(200); return res.end(); }
      const o = objects.get(req.url);
      if (req.method === 'DELETE') { objects.delete(req.url); res.writeHead(204); return res.end(); }
      if (!o) { res.writeHead(404); return res.end('<Error><Code>NoSuchKey</Code></Error>'); }
      res.writeHead(200, { 'content-type': o.type, 'content-length': o.body.length }); res.end(o.body);
    });
  }).listen(S3_PORT);
  const env = { ...process.env, PORT: String(PORT), RELAY_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'relay-')), WEATHER: '0', REDIS_URL: '',
    R2_ENDPOINT: `http://127.0.0.1:${S3_PORT}`, R2_KEY: 'test-key', R2_SECRET: 'test-secret', R2_BUCKET: 'bucket' };
  proc = spawn(process.execPath, ['server/relay.mjs'], { cwd: ROOT, env, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`${base}/health`)).ok) return; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('relay did not start');
});
test.after(() => { proc?.kill(); s3?.close(); });

const key = 'china-japon-2026/photos/ph123-0123456789abcdef0123456789abcdef.jpg';

test('uploads a photo to R2 with a signed request and serves it back', async () => {
  const body = Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]);
  const put = await fetch(`${base}/v1/files/${key}`, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body });
  assert.equal(put.status, 200);
  assert.deepEqual(objects.get(`/bucket/${key}`), { body, type: 'image/jpeg' });
  const sent = seen.find((r) => r.method === 'PUT');
  assert.match(sent.headers.authorization, /^AWS4-HMAC-SHA256 Credential=test-key\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
  const get = await fetch(`${base}/v1/files/${key}`);
  assert.equal(get.status, 200);
  assert.equal(get.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(Buffer.from(await get.arrayBuffer()), body);
});

test('deletes it, and a missing file is a 404', async () => {
  assert.equal((await fetch(`${base}/v1/files/${key}`, { method: 'DELETE' })).status, 200);
  assert.equal(objects.has(`/bucket/${key}`), false);
  assert.equal((await fetch(`${base}/v1/files/${key}`)).status, 404);
});

test('rejects bad names, types and empty bodies', async () => {
  const put = (k, type, body = 'x') => fetch(`${base}/v1/files/${k}`, { method: 'PUT', headers: { 'content-type': type }, body });
  assert.equal((await put('trip/photos/short.jpg', 'image/jpeg')).status, 404);                       // name without the random part
  assert.equal((await put('trip/secrets/ph1-0123456789abcdef.jpg', 'image/jpeg')).status, 404);     // unknown folder
  assert.equal((await put('../x/photos/ph1-0123456789abcdef.jpg', 'image/jpeg')).status, 404);
  assert.equal((await put('trip/files/fi1-0123456789abcdef.bin', 'text/html')).status, 415);
  assert.equal((await put('trip/files/fi1-0123456789abcdef.pdf', 'application/pdf', '')).status, 400);
});
