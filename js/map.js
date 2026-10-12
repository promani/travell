// Leaflet wrapper: picks tiles that work in the region (AutoNavi in mainland China, OSM elsewhere),
// handles the GCJ-02 offset, draws places / lodging / routes / the user, and can pre-cache tiles for offline.
import { D, settings } from './store.js';
import { esc, ic, icon as iconHtml, haversine } from './util.js';
import { wgs2gcj, gcj2wgs, externalMapUrl, googleMapUrl, gps, onPosition, startGps } from './geo.js';

const L = window.L;

export function ago(ms) {
  const m = Math.round(ms / 60000);
  if (m < 1) return 'recién';
  if (m < 60) return `hace ${m} min`;
  if (m < 48 * 60) return `hace ${Math.round(m / 60)} h`;
  return `hace ${Math.round(m / 1440)} días`;
}

export function providerForPoint(lat, lon) {
  let best = null, bd = Infinity;
  for (const c of D.trip.cities) {
    const d = haversine([lat, lon], c.center);
    if (d < bd) { bd = d; best = c; }
  }
  return best?.tiles || Object.keys(D.trip.tileProviders)[0];
}

const catOf = (id) => D.trip.categories[id] || { icon: 'location-dot', color: '#555', label: id };
const icon = (name, color, cls = '') => L.divIcon({
  className: 'poi-icon ' + cls, iconSize: [32, 32], iconAnchor: [16, 30], popupAnchor: [0, -26],
  html: `<span style="--c:${color}">${iconHtml(name)}</span>`,
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
  /** Tile-layer coordinates (e.g. a click) -> WGS-84. */
  unproj(lat, lon) { return this.provider?.gcj02 ? gcj2wgs(lat, lon) : [lat, lon]; }

  /** Turn the map into a location picker: tap or drag the marker. `onPick([lat, lon])` gets WGS-84. */
  enablePicker(start, onPick) {
    const pinIcon = L.divIcon({ className: 'pick-icon', iconSize: [36, 46], iconAnchor: [18, 44], html: `<span>${ic('location-dot')}</span>` });
    this.pick = start ? [...start] : null;
    const place = () => {
      if (!this.pick) { this.pickMarker?.remove(); this.pickMarker = null; return; }
      const ll = this.proj(this.pick[0], this.pick[1]);
      if (!this.pickMarker) {
        this.pickMarker = L.marker(ll, { icon: pinIcon, draggable: true, zIndexOffset: 1000 }).addTo(this.map);
        this.pickMarker.on('dragend', () => { const p = this.pickMarker.getLatLng(); this.pick = this.unproj(p.lat, p.lng); onPick(this.pick); });
      } else this.pickMarker.setLatLng(ll);
    };
    this.setPick = (lat, lon, zoom) => { this.pick = [lat, lon]; place(); this.setView(lat, lon, zoom ?? Math.max(this.map.getZoom(), 15)); };
    this.map.on('click', (e) => { this.pick = this.unproj(e.latlng.lat, e.latlng.lng); place(); onPick(this.pick); });
    this.el.addEventListener('providerchange', place);
    place();
  }

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
        lat = l.lat; lon = l.lon; ic = icon('hotel', catOf('alojamiento').color, 'lodging');
        html = `<b>${esc(l.name)}</b><br><small>${esc(l.area || '')}${l.approx ? ' · ubicación aproximada' : ''}</small>`;
      } else if (it.kind === 'person') {
        const tr = it.traveler, age = Date.now() - it.pos.updatedAt;
        lat = it.pos.lat; lon = it.pos.lon;
        ic = L.divIcon({ className: 'person-icon' + (age > 2 * 3600000 ? ' stale' : ''), iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -16],
          html: `<span style="--c:${tr.color || '#1c7ed6'}">${esc((tr.name || '?').trim().slice(0, 2).toUpperCase())}</span>` });
        html = `<b>${esc(tr.name)}</b><br><small>${esc(ago(age))}${it.pos.acc ? ` · ±${Math.round(it.pos.acc)} m` : ''}</small>`;
      } else {                                           // plain labelled point
        lat = it.lat; lon = it.lon; ic = icon(it.icon || 'location-dot', it.color || '#1c7ed6');
        html = `<b>${esc(it.label || '')}</b>`;
      }
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
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
    return `<div class="pop"><b>${iconHtml(c.icon)} ${esc(p.name)}</b>${p.nameLocal ? `<div class="local">${esc(p.nameLocal)}</div>` : ''}
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
      else if (it.kind === 'person') continue;
      else pts.push(this.proj(it.lat, it.lon));
    }
    extra.forEach(([a, b]) => pts.push(this.proj(a, b)));
    const ok = pts.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (ok.length) this.map.fitBounds(L.latLngBounds(ok), { padding: [40, 40], maxZoom: 16 });
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
