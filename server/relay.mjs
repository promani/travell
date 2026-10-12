#!/usr/bin/env node
// Travell relay: a tiny, dependency-free store-and-forward server for group sync.
// It never sees the data: clients send AES-GCM ciphertext, keyed by an opaque group id derived from the group code.
//
//   PORT=8787 RELAY_DATA=./relay-data node server/relay.mjs
//
//   POST /v1/:gid/records   { records: [{ c, id, u, d }] }   -> { seq }
//   GET  /v1/:gid/records?since=N                            -> { seq, records: [...], more }
//   GET  /health
//
// With SERVE_STATIC=<dir> it also serves the PWA from that folder (one container for app + relay).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = +(process.env.PORT || 8787);
const DIR = process.env.RELAY_DATA || './relay-data';
const MAX_BODY = 2 * 1024 * 1024, MAX_RECORDS = 50000, MAX_D = 256 * 1024, PAGE = 500;
const GID = /^[a-f0-9]{32}$/, COL = /^[a-z]{1,24}$/;
const STATIC = process.env.SERVE_STATIC ? path.resolve(process.env.SERVE_STATIC) : null;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
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
    'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type', 'cache-control': 'no-store',
  });
  res.end(obj === undefined ? '' : JSON.stringify(obj));
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') return send(res, 204);
  if (url.pathname === '/health') return send(res, 200, { ok: true, groups: groups.size });
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
server.listen(PORT, () => console.log(`travell relay on :${PORT}, data in ${DIR}${STATIC ? `, serving app from ${STATIC}` : ''}`));
