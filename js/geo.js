// Coordinates: WGS-84 <-> GCJ-02 (the offset system used by Chinese map tiles), GPS, external map links.
import { haversine } from './util.js';

const PI = Math.PI, A = 6378245.0, EE = 0.00669342162296594323;
const outOfChina = (lon, lat) => lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271;
const tLat = (x, y) => {
  let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  r += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3;
  r += (20 * Math.sin(y * PI) + 40 * Math.sin(y / 3 * PI)) * 2 / 3;
  r += (160 * Math.sin(y / 12 * PI) + 320 * Math.sin(y * PI / 30)) * 2 / 3;
  return r;
};
const tLon = (x, y) => {
  let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  r += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3;
  r += (20 * Math.sin(x * PI) + 40 * Math.sin(x / 3 * PI)) * 2 / 3;
  r += (150 * Math.sin(x / 12 * PI) + 300 * Math.sin(x / 30 * PI)) * 2 / 3;
  return r;
};
/** WGS-84 [lat, lon] -> GCJ-02 [lat, lon] (identity outside China's box). */
export function wgs2gcj(lat, lon) {
  if (outOfChina(lon, lat)) return [lat, lon];
  let dLat = tLat(lon - 105, lat - 35), dLon = tLon(lon - 105, lat - 35);
  const rad = lat / 180 * PI;
  let magic = Math.sin(rad); magic = 1 - EE * magic * magic;
  const sq = Math.sqrt(magic);
  dLat = (dLat * 180) / ((A * (1 - EE)) / (magic * sq) * PI);
  dLon = (dLon * 180) / (A / sq * Math.cos(rad) * PI);
  return [lat + dLat, lon + dLon];
}

/** Link to open a point in an external map app, appropriate to the tile region. */
export function externalMapUrl(lat, lon, name, providerId) {
  if (providerId === 'gaode') {
    return `https://uri.amap.com/marker?position=${lon},${lat}&name=${encodeURIComponent(name || '')}&coordinate=wgs84&src=travell`;
  }
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;
}
export const googleMapUrl = (lat, lon) => `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;

// ------------------------------------------------------------------ GPS (shared by every map)
const listeners = new Set();
export const gps = { pos: null, watchId: null, error: null };
export function onPosition(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function startGps() {
  if (!('geolocation' in navigator) || gps.watchId != null) return;
  gps.watchId = navigator.geolocation.watchPosition(
    (p) => {
      gps.pos = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy };
      gps.error = null; listeners.forEach((f) => f(gps.pos));
    },
    (e) => { gps.error = e; gps.watchId = null; listeners.forEach((f) => f(null, e)); },
    { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
}
export function stopGps() {
  if (gps.watchId != null) navigator.geolocation.clearWatch(gps.watchId);
  gps.watchId = null;
}
export async function autoStartGpsIfGranted() {
  try {
    const s = await navigator.permissions?.query({ name: 'geolocation' });
    if (s?.state === 'granted') startGps();
  } catch { /* permissions API unavailable */ }
}
export const distance = (a, b) => haversine(a, b);
