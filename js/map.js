// Leaflet wrapper: picks tiles that work in the region (AutoNavi in mainland China, OSM elsewhere),
// handles the GCJ-02 offset, draws places / lodging / routes / the user, and can pre-cache tiles for offline.
import { D, I, settings } from './store.js';
import { esc, haversine } from './util.js';
import { wgs2gcj, externalMapUrl, googleMapUrl, gps, onPosition, startGps } from './geo.js';

const L = window.L;

export function providerForPoint(lat, lon) {
  let best = null, bd = Infinity;
  for (const c of D.trip.cities) {
    const d = haversine([lat, lon], c.center);
    if (d < bd) { bd = d; best = c; }
  }
  return best?.tiles || Object.keys(D.trip.tileProviders)[0];
}

const catOf = (id) => D.trip.categories[id] || { icon: '📍', color: '#555', label: id };
const icon = (emoji, color, cls = '') => L.divIcon({
  className: 'poi-icon ' + cls, iconSize: [32, 32], iconAnchor: [16, 30], popupAnchor: [0, -26],
  html: `<span style="--c:${color}">${emoji}</span>`,
});

export class TripMap {
  constructor(el, { center, zoom = 13, onPlace, scrollWheel = true } = {}) {
    this.el = el; this.onPlace = onPlace;
    this.items = []; this.user = gps.pos;
    this.map = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: scrollWheel, tap: true })
      .setView(center || D.trip.cities[0].center, zoom);
    this.layer = L.layerGroup().addTo(this.map);
    this.userLayer = L.layerGroup().addTo(this.map);
    this.mode = settings.get('mapProvider', 'auto');
    this.providerId = null;
    this.setProvider(this.mode === 'auto' ? providerForPoint(...(center || D.trip.cities[0].center)) : this.mode);
    this.map.on('moveend', () => this.autoProvider());
    this.offPos = onPosition((p) => { this.user = p; this.drawUser(); });
    this.drawUser();
    this.ro = new ResizeObserver(() => this.map.invalidateSize());
    this.ro.observe(el);
    requestAnimationFrame(() => this.map.invalidateSize());
  }

  destroy() { this.offPos?.(); this.ro?.disconnect(); this.map.remove(); }

  get provider() { return D.trip.tileProviders[this.providerId]; }
  /** WGS-84 -> coordinates in the tile layer's own system. */
  proj(lat, lon) { return this.provider?.gcj02 ? wgs2gcj(lat, lon) : [lat, lon]; }

  setMode(mode) {
    this.mode = mode;
    const c = this.map.getCenter();
    this.setProvider(mode === 'auto' ? providerForPoint(c.lat, c.lng) : mode);
  }
  autoProvider() {
    if (this.mode !== 'auto') return;
    const c = this.map.getCenter();
    const id = providerForPoint(c.lat, c.lng);
    if (id !== this.providerId) this.setProvider(id);
  }
  setProvider(id) {
    if (!D.trip.tileProviders[id]) id = Object.keys(D.trip.tileProviders)[0];
    if (id === this.providerId) return;
    this.providerId = id;
    const p = this.provider;
    this.tile?.remove();
    this.tile = L.tileLayer(p.url, {
      subdomains: p.subdomains || 'abc', maxZoom: p.maxZoom || 18, attribution: p.attribution,
      errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
    }).addTo(this.map);
    this.render();
    this.el.dispatchEvent(new CustomEvent('providerchange', { detail: id }));
  }

  // ---------------------------------------------------------------- content
  setItems(items) { this.items = items; this.render(); }

  render() {
    this.layer.clearLayers();
    for (const it of this.items) {
      if (it.kind === 'route') {
        L.polyline(it.path.map(([a, b]) => this.proj(a, b)), {
          color: it.color || '#e03131', weight: 4, opacity: 0.85, dashArray: it.dashed ? '8 8' : null,
        }).bindTooltip(it.label || '', { sticky: true }).addTo(this.layer);
        continue;
      }
      let lat, lon, ic, html;
      if (it.kind === 'poi') {
        const p = it.place, c = catOf(p.category);
        lat = p.lat; lon = p.lon; ic = icon(c.icon, c.color, it.active ? 'active' : '');
        html = this.popup(p, c);
      } else if (it.kind === 'lodging') {
        const l = it.lodging;
        lat = l.lat; lon = l.lon; ic = icon('🏨', catOf('alojamiento').color, 'lodging');
        html = `<b>${esc(l.name)}</b><br><small>${esc(l.area || '')}${l.approx ? ' · ubicación aproximada' : ''}</small>`;
      } else {                                           // plain labelled point
        lat = it.lat; lon = it.lon; ic = icon(it.icon || '📍', it.color || '#1c7ed6');
        html = `<b>${esc(it.label || '')}</b>`;
      }
      const m = L.marker(this.proj(lat, lon), { icon: ic, title: it.label || it.place?.name || '' }).addTo(this.layer);
      m.bindPopup(html);
      if (it.kind === 'poi') {
        m._placeId = it.place.id;
        m.on('click', () => this.onPlace?.(it.place));
      }
    }
  }

  popup(p, c) {
    const link = externalMapUrl(p.lat, p.lon, p.name, this.providerId);
    const g = this.providerId === 'gaode' ? '' : ` · <a href="${googleMapUrl(p.lat, p.lon)}" target="_blank" rel="noopener">Google</a>`;
    return `<div class="pop"><b>${c.icon} ${esc(p.name)}</b>${p.nameLocal ? `<div class="local">${esc(p.nameLocal)}</div>` : ''}
      <small>${esc(c.label)}${p.area ? ' · ' + esc(p.area) : ''}${p.approx ? ' · ubicación aproximada' : ''}</small>
      ${p.description ? `<p>${esc(p.description.length > 150 ? p.description.slice(0, 147) + '…' : p.description)}</p>` : ''}
      <div class="pop-links"><a href="#/lugar/${esc(p.id)}">Detalle</a> · <a href="${link}" target="_blank" rel="noopener">Abrir mapa</a>${g}</div></div>`;
  }

  openPlace(id) {
    this.layer.eachLayer((m) => { if (m._placeId === id) { this.map.setView(m.getLatLng(), Math.max(this.map.getZoom(), 16)); m.openPopup(); } });
  }

  drawUser() {
    this.userLayer.clearLayers();
    if (!this.user) return;
    const ll = this.proj(this.user.lat, this.user.lon);
    L.circle(ll, { radius: Math.min(this.user.acc || 30, 500), color: '#1c7ed6', weight: 1, fillOpacity: 0.12 }).addTo(this.userLayer);
    L.circleMarker(ll, { radius: 7, color: '#fff', weight: 2, fillColor: '#1c7ed6', fillOpacity: 1 }).addTo(this.userLayer);
  }
  locate() {
    startGps();
    if (this.user) this.map.setView(this.proj(this.user.lat, this.user.lon), Math.max(this.map.getZoom(), 15));
  }

  setView(lat, lon, zoom) { this.map.setView(this.proj(lat, lon), zoom ?? this.map.getZoom()); this.autoProvider(); }
  fit(extra = []) {
    const pts = [];
    for (const it of this.items) {
      if (it.kind === 'route') it.path.forEach(([a, b]) => pts.push(this.proj(a, b)));
      else if (it.kind === 'poi') pts.push(this.proj(it.place.lat, it.place.lon));
      else if (it.kind === 'lodging') pts.push(this.proj(it.lodging.lat, it.lodging.lon));
      else pts.push(this.proj(it.lat, it.lon));
    }
    extra.forEach(([a, b]) => pts.push(this.proj(a, b)));
    if (pts.length) this.map.fitBounds(L.latLngBounds(pts), { padding: [28, 28], maxZoom: 16 });
    this.autoProvider();
  }
}

// ------------------------------------------------------------------ offline tiles
const tileX = (lon, z) => Math.floor((lon + 180) / 360 * 2 ** z);
const tileY = (lat, z) => {
  const r = lat * Math.PI / 180;
  return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z);
};

/** Tile URLs covering the given WGS-84 points (+ ~1.2 km margin) for the configured zoom levels, capped. */
export function tileUrls(providerId, points) {
  const p = D.trip.tileProviders[providerId];
  const cfg = D.trip.prefetch || { zooms: [12, 13, 14, 15], maxTiles: 160 };
  const pts = points.map(([a, b]) => (p.gcj02 ? wgs2gcj(a, b) : [a, b]));
  const m = 0.011;
  const minLat = Math.min(...pts.map((x) => x[0])) - m, maxLat = Math.max(...pts.map((x) => x[0])) + m;
  const minLon = Math.min(...pts.map((x) => x[1])) - m, maxLon = Math.max(...pts.map((x) => x[1])) + m;
  const subs = p.subdomains || 'abc';
  const byZoom = cfg.zooms.map((z) => {
    const urls = [];
    for (let x = tileX(minLon, z); x <= tileX(maxLon, z); x++) {
      for (let y = tileY(maxLat, z); y <= tileY(minLat, z); y++) {
        urls.push(p.url.replace('{s}', subs[Math.abs(x + y) % subs.length]).replace('{z}', z).replace('{x}', x).replace('{y}', y));
      }
    }
    return urls;
  });
  let total = byZoom.reduce((n, u) => n + u.length, 0);
  while (total > cfg.maxTiles && byZoom.length > 1) total -= byZoom.pop().length;   // drop the most detailed zooms first
  return byZoom.flat().slice(0, cfg.maxTiles);
}

export async function prefetchTiles(urls, onProgress) {
  const cache = await caches.open('travell-tiles-v1');
  let ok = 0, n = 0;
  const queue = [...urls];
  const worker = async () => {
    while (queue.length) {
      const u = queue.shift();
      try {
        if (!(await cache.match(u))) await cache.put(u, await fetch(u, { mode: 'no-cors' }));
        ok++;
      } catch { /* offline or blocked: skip */ }
      onProgress?.(++n, urls.length);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return ok;
}
