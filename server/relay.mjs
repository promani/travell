#!/usr/bin/env node
// Travell relay: a tiny, dependency-free store-and-forward server for group sync.
// It never sees the data: clients send AES-GCM ciphertext, keyed by an opaque group id derived from the group code.
//
//   PORT=8787 RELAY_DATA=./relay-data node server/relay.mjs
//
//   POST /v1/:gid/records   { records: [{ c, id, u, d }] }   -> { seq }
//   GET  /v1/:gid/records?since=N                            -> { seq, records: [...], more }
//   GET  /v1/weather                                          -> weather for every day of the trip (see weather.mjs)
//   PUT  /v1/files/:trip/(photos|files)/:name  (raw body)     -> uploads a photo / attachment to R2
//   GET  /v1/files/:trip/(photos|files)/:name                 -> streams it back from R2
//   DELETE /v1/files/:trip/(photos|files)/:name
//   GET  /health
//
// With SERVE_STATIC=<dir> it also serves the PWA from that folder (one container for app + relay).
// REDIS_URL=redis://[:password@]host:6379[/db] keeps the weather in Redis (otherwise in a file in RELAY_DATA).
// WEATHER=0 turns the daily weather download off. REDIS_KEY_PREFIX (default "travell:") prefixes every Redis key.
// R2_ENDPOINT, R2_KEY, R2_SECRET, R2_BUCKET: Cloudflare R2, where photos and attachments are uploaded (unencrypted).
// File names carry 128 random bits, so a name works as a capability: whoever knows it can read or delete that file.
// Locally `npm start` loads them from .env.local.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { startWeather, weatherStore } from './weather.mjs';
import { r2FromEnv } from './r2.mjs';

const PORT = +(process.env.PORT || 8787);
const DIR = process.env.RELAY_DATA || './relay-data';
const MAX_BODY = 2 * 1024 * 1024, MAX_RECORDS = 50000, MAX_D = 256 * 1024, PAGE = 500;
const GID = /^[a-f0-9]{32}$/, COL = /^[a-z]{1,24}$/;
const STATIC = process.env.SERVE_STATIC ? path.resolve(process.env.SERVE_STATIC) : null;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
const MAX_FILE = 30 * 1024 * 1024;
const FILE_PATH = /^\/v1\/files\/([a-z0-9-]{1,60})\/(photos|files)\/([A-Za-z0-9_-]{8,120}\.(?:jpe?g|png|webp|gif|heic|heif|pdf|bin))$/;
const FILE_TYPES = /^(image\/[a-z0-9.+-]+|application\/pdf|application\/octet-stream)$/;
const PUBLIC = /^\/(index\.html|manifest\.webmanifest|sw\.js|(css|js|data|icons|vendor)\/.+)$/;   // never serve server/, .git, docs…

function serveStatic(req, res, pathname) {
  if (pathname === '/') pathname = '/index.html';
  let file;
  try { file = path.join(STATIC, decodeURIComponent(pathname)); } catch { return false; }
  if (!PUBLIC.test(pathname) || !file.startsWith(STATIC + path.sep)) return false;
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found'); }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
      // the service worker handles offline caching; let the browser revalidate so updates arrive
      'cache-control': pathname.startsWith('/vendor/') || pathname.startsWith('/icons/') ? 'public, max-age=86400' : 'no-cache',
      'x-content-type-options': 'nosniff',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
  return true;
}

fs.mkdirSync(DIR, { recursive: true });

const DATA_DIR = path.join(STATIC || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'data');
let weather = null;
try {
  const tripId = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'trip.json'), 'utf8')).id;
  weather = startWeather({ dataDir: DATA_DIR, store: weatherStore({ tripId, redisUrl: process.env.REDIS_URL, prefix: process.env.REDIS_KEY_PREFIX, dir: DIR }), auto: process.env.WEATHER !== '0' });
} catch (e) { console.log(`weather: disabled (${e.message})`); }
const bucket = r2FromEnv();
console.log(bucket ? 'files: uploading to R2' : 'files: R2 not configured (R2_ENDPOINT, R2_KEY, R2_SECRET, R2_BUCKET)');
const groups = new Map();            // gid -> { seq, recs: Map(key -> rec), dirty }

function load(gid) {
  if (!groups.has(gid)) {
    let g = { seq: 0, recs: new Map(), dirty: false };
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(DIR, gid + '.json'), 'utf8'));
      g = { seq: raw.seq, recs: new Map(raw.recs.map((r) => [`${r.c}/${r.id}`, r])), dirty: false };
    } catch { /* new group */ }
    groups.set(gid, g);
  }
  return groups.get(gid);
}
function persist() {
  for (const [gid, g] of groups) {
    if (!g.dirty) continue;
    g.dirty = false;
    const tmp = path.join(DIR, gid + '.json.tmp');
    fs.writeFileSync(tmp, JSON.stringify({ seq: g.seq, recs: [...g.recs.values()] }));
    fs.renameSync(tmp, path.join(DIR, gid + '.json'));
  }
}
setInterval(persist, 2000).unref();
process.on('SIGINT', () => { persist(); process.exit(0); });
process.on('SIGTERM', () => { persist(); process.exit(0); });

const send = (res, status, obj) => {
  res.writeHead(status, {
    'content-type': 'application/json', 'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', 'access-control-allow-headers': 'content-type', 'cache-control': 'no-store',
  });
  res.end(obj === undefined ? '' : JSON.stringify(obj));
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') return send(res, 204);
  if (url.pathname === '/health') return send(res, 200, { ok: true, groups: groups.size, files: !!bucket });
  const f = FILE_PATH.exec(url.pathname);
  if (f) return files(req, res, f.slice(1, 4).join('/'));
  if (url.pathname === '/v1/weather' && req.method === 'GET') {
    const doc = weather?.get();
    return doc ? send(res, 200, doc) : send(res, 503, { error: 'weather not ready' });
  }
  const m = /^\/v1\/([^/]+)\/records$/.exec(url.pathname);
  if (!m && STATIC && (req.method === 'GET' || req.method === 'HEAD') && serveStatic(req, res, url.pathname)) return;
  if (!m || !GID.test(m[1])) return send(res, 404, { error: 'not found' });
  const g = load(m[1]);

  if (req.method === 'GET') {
    let since = Math.max(0, parseInt(url.searchParams.get('since') || '0', 10) || 0);
    if (since > g.seq) since = 0;                                   // relay was reset: resend everything
    const all = [...g.recs.values()].filter((r) => r.seq > since).sort((a, b) => a.seq - b.seq);
    const page = all.slice(0, PAGE);
    return send(res, 200, { seq: page.length ? page[page.length - 1].seq : g.seq, records: page, more: all.length > PAGE });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });

  let size = 0; const chunks = [];
  req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { send(res, 413, { error: 'too large' }); req.destroy(); } else chunks.push(c); });
  req.on('end', () => {
    if (res.writableEnded) return;
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(res, 400, { error: 'json' }); }
    const list = Array.isArray(body?.records) ? body.records : null;
    if (!list || list.length > 500) return send(res, 400, { error: 'records' });
    for (const r of list) {
      if (!r || !COL.test(r.c) || typeof r.id !== 'string' || r.id.length > 120 || !Number.isFinite(r.u) || typeof r.d !== 'string' || r.d.length > MAX_D) continue;
      const k = `${r.c}/${r.id}`, cur = g.recs.get(k);
      if (cur && cur.u >= r.u) continue;                       // last write wins
      if (!cur && g.recs.size >= MAX_RECORDS) continue;
      g.recs.set(k, { c: r.c, id: r.id, u: r.u, d: r.d, seq: ++g.seq });
      g.dirty = true;
    }
    send(res, 200, { seq: g.seq });
  });
});
/** Photos and attachments: the relay only forwards them to R2 (or streams them back). */
function files(req, res, key) {
  if (!bucket) return send(res, 503, { error: 'files storage not configured' });
  const fail = (e) => { console.log(`files: ${req.method} ${key}: ${e.message}`); if (!res.headersSent) send(res, 502, { error: 'storage' }); else res.destroy(); };
  if (req.method === 'GET') {
    return bucket.get(key).then((r) => {
      if (r.status === 404) return send(res, 404, { error: 'not found' });
      if (!r.ok) throw new Error('status ' + r.status);
      const headers = { 'content-type': r.headers.get('content-type') || 'application/octet-stream',
        'cache-control': 'private, max-age=31536000, immutable', 'access-control-allow-origin': '*', 'x-content-type-options': 'nosniff' };
      if (r.headers.get('content-length')) headers['content-length'] = r.headers.get('content-length');
      res.writeHead(200, headers);
      Readable.fromWeb(r.body).on('error', fail).pipe(res);
    }).catch(fail);
  }
  if (req.method === 'DELETE') return bucket.del(key).then(() => send(res, 200, { ok: true })).catch(fail);
  if (req.method !== 'PUT') return send(res, 405, { error: 'method' });
  const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!FILE_TYPES.test(type)) return send(res, 415, { error: 'type' });
  if (+req.headers['content-length'] > MAX_FILE) return send(res, 413, { error: 'too large' });
  let size = 0; const chunks = [];
  req.on('data', (c) => { size += c.length; if (size > MAX_FILE) { send(res, 413, { error: 'too large' }); req.destroy(); } else chunks.push(c); });
  req.on('end', () => {
    if (res.writableEnded) return;
    if (!size) return send(res, 400, { error: 'empty' });
    bucket.put(key, Buffer.concat(chunks), type).then(() => send(res, 200, { key, size })).catch(fail);
  });
}

server.listen(PORT, () => console.log(`travell relay on :${PORT}, data in ${DIR}${STATIC ? `, serving app from ${STATIC}` : ''}`));
