// Service worker: makes the app work with no connection.
//  - app shell + data JSON: precached, then network-first (fresh when online, cached when not)
//  - map tiles: cache-first, filled while browsing or by "Guardar zona offline"
//  - AI-generated pictures (imgg host): stale-while-revalidate, filled the first time each one is seen
const VERSION = 'v10';
const SHELL = `travell-shell-${VERSION}`;
const TILES = 'travell-tiles-v1';
const PICS = 'travell-pics-v1';
const INBOX = 'travell-inbox';   // what other apps share to Travell (see js/views/inbox.js)
const MAX_PICS = 80;
const MAX_TILES = 2500;

const CORE = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/main.js', 'js/util.js', 'js/store.js', 'js/geo.js', 'js/map.js', 'js/tripstate.js', 'js/nearby.js', 'js/ui.js',
  'js/sync.js', 'js/upload.js', 'js/ics.js', 'js/ticket.js', 'js/qr.js', 'js/weather.js', 'js/suggest.js', 'js/share.js', 'js/money.js', 'js/views/search.js',
  'js/views/tasks.js', 'js/views/people.js', 'js/views/places.js', 'js/views/forms.js',
  'js/passport.js', 'js/views/passports.js', 'js/views/resources.js', 'js/views/sim.js',
  'js/views/home.js', 'js/views/day.js', 'js/views/mapview.js', 'js/views/photos.js', 'js/views/expenses.js', 'js/views/docs.js', 'js/views/more.js', 'js/views/phrases.js', 'js/views/inbox.js', 'js/guess.js', 'js/admin.js',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css',
  'vendor/jsqr/jsQR.min.js', 'vendor/qrcode/qrcode.js',
  'vendor/fontawesome/css/fontawesome.min.css', 'vendor/fontawesome/css/solid.min.css', 'vendor/fontawesome/webfonts/fa-solid-900.woff2',
  'vendor/leaflet/images/layers.png', 'vendor/leaflet/images/layers-2x.png', 'vendor/leaflet/images/marker-icon.png', 'vendor/leaflet/images/marker-shadow.png',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'data/trip.json', 'data/itinerary.json', 'data/transport.json', 'data/lodging.json', 'data/places.json',
  'data/documents.json', 'data/travelers.json', 'data/tasks.json', 'data/notes.json', 'data/phrases.json',
  'data/places-extra.json', 'data/requirements.json', 'data/resources.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => Promise.all(CORE.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('travell-shell-') && k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const isPic = (url) => url.hostname === 'imgg.unab.dpdns.org';
const isTile = (url) => /appmaptile|\/\d{1,2}\/\d+\/\d+\.(png|jpg|jpeg|webp)(\?|$)/.test(url);

async function trim(cache, max) {
  const keys = await cache.keys();
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}
const trimTiles = (cache) => trim(cache, MAX_TILES);

// Share target (manifest.webmanifest): Android posts what was shared here. It waits in the inbox until the
// "Compartido" screen saves it where it belongs. Same keys and shape as js/views/inbox.js.
async function receiveShare(req) {
  const at = (path) => new URL(`inbox/${path}`, self.registration.scope).href;
  try {
    const form = await req.formData(), c = await caches.open(INBOX);
    const id = 'in' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), files = [];
    for (const [i, f] of form.getAll('files').filter((f) => f && f.size).entries()) {
      const path = `${id}/${i}`;
      await c.put(at(path), new Response(f, { headers: { 'content-type': f.type || 'application/octet-stream' } }));
      files.push({ path, name: f.name || `archivo-${i + 1}`, type: f.type || 'application/octet-stream' });
    }
    const index = await (await c.match(at('index')))?.json().catch(() => []) || [];
    const s = (k) => (form.get(k) || '').toString();
    index.push({ id, at: Date.now(), title: s('title'), text: s('text'), url: s('url'), files });
    await c.put(at('index'), new Response(JSON.stringify(index), { headers: { 'content-type': 'application/json' } }));
  } catch (err) { console.warn('share', err); }
  return Response.redirect(new URL('index.html#/compartido', self.registration.scope).href, 303);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === 'POST' && url.pathname.endsWith('/share')) { e.respondWith(receiveShare(req)); return; }
  if (req.method !== 'GET') return;

  if (isTile(req.url)) {
    e.respondWith((async () => {
      const cache = await caches.open(TILES);
      const hit = await cache.match(req.url);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') { cache.put(req.url, res.clone()); trimTiles(cache); }
        return res;
      } catch { return new Response('', { status: 504 }); }
    })());
    return;
  }

  if (isPic(url)) {
    e.respondWith((async () => {
      const cache = await caches.open(PICS);
      // Stale-while-revalidate: the service answers a gray placeholder while it is still generating a new picture
      // (opaque, so it can't be inspected); refreshing in the background replaces it once the real one exists.
      // Real pictures are immutable, so the refresh is a free HTTP-cache hit.
      const hit = await cache.match(req.url);
      const fresh = fetch(req).then((res) => {
        if (res.ok || res.type === 'opaque') { cache.put(req.url, res.clone()); trim(cache, MAX_PICS); }
        return res;
      });
      if (hit) { fresh.catch(() => null); return hit; }
      try { return await fresh; } catch { return new Response('', { status: 504 }); }
    })());
    return;
  }

  if (url.origin !== location.origin) return;       // other external requests: let the network handle them
  if (url.pathname.includes('/v1/')) return;          // relay API (sync, weather): always live, the app keeps its own copy

  e.respondWith((async () => {
    const cache = await caches.open(SHELL);
    const cached = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; });
    try {
      // Online: prefer fresh content, but don't wait forever on a bad connection.
      return await Promise.race([network, new Promise((_, rej) => setTimeout(rej, cached ? 3500 : 15000))]);
    } catch {
      network.catch(() => null);
      if (cached) return cached;
      if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
      return Response.error();
    }
  })());
});
