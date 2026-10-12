// Service worker: makes the app work with no connection.
//  - app shell + data JSON: precached, then network-first (fresh when online, cached when not)
//  - map tiles: cache-first, filled while browsing or by "Guardar zona offline"
const VERSION = 'v3';
const SHELL = `travell-shell-${VERSION}`;
const TILES = 'travell-tiles-v1';
const MAX_TILES = 2500;

const CORE = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/main.js', 'js/util.js', 'js/store.js', 'js/geo.js', 'js/map.js', 'js/tripstate.js', 'js/nearby.js', 'js/ui.js',
  'js/sync.js', 'js/suggest.js', 'js/share.js', 'js/money.js', 'js/views/search.js',
  'js/views/tasks.js', 'js/views/people.js', 'js/views/places.js', 'js/views/forms.js',
  'js/views/home.js', 'js/views/day.js', 'js/views/mapview.js', 'js/views/photos.js', 'js/views/expenses.js', 'js/views/docs.js', 'js/views/more.js',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css',
  'vendor/leaflet/images/layers.png', 'vendor/leaflet/images/layers-2x.png', 'vendor/leaflet/images/marker-icon.png', 'vendor/leaflet/images/marker-shadow.png',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'data/trip.json', 'data/itinerary.json', 'data/transport.json', 'data/lodging.json', 'data/places.json',
  'data/documents.json', 'data/travelers.json', 'data/tasks.json', 'data/notes.json', 'data/links.json',
  'data/places-extra.json', 'data/requirements.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => Promise.all(CORE.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('travell-shell-') && k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const isTile = (url) => /appmaptile|\/\d{1,2}\/\d+\/\d+\.(png|jpg|jpeg|webp)(\?|$)/.test(url);

async function trimTiles(cache) {
  const keys = await cache.keys();
  if (keys.length > MAX_TILES) await Promise.all(keys.slice(0, keys.length - MAX_TILES).map((k) => cache.delete(k)));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

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

  if (url.origin !== location.origin) return;       // other external requests: let the network handle them

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
