// "Points of interest near you": uses GPS when you're actually among the trip's places, otherwise the day's city.
import { D, I } from './store.js';
import { gps, distance } from './geo.js';
import { defaultCity } from './tripstate.js';

export const isPoi = (p) => D.trip.poiCategories.includes(p.category);

export function computeNearby(st, { categories = null, limit = 40 } = {}) {
  const city = defaultCity(st);
  const keep = (p) => (categories ? categories.has(p.category) : isPoi(p));
  const pos = gps.pos;
  const allPts = D.places;
  const gpsUseful = pos && allPts.some((p) => distance([pos.lat, pos.lon], [p.lat, p.lon]) < 60000);

  if (gpsUseful) {
    const ref = [pos.lat, pos.lon];
    const all = D.places.filter(keep).map((place) => ({ place, dist: distance(ref, [place.lat, place.lon]) })).sort((a, b) => a.dist - b.dist);
    let radius = 4000, list = all.filter((x) => x.dist <= radius);
    if (list.length < 4) { radius = 15000; list = all.filter((x) => x.dist <= radius); }
    if (list.length < 4) list = all.slice(0, 6);
    return { ref, usingGps: true, city, list: list.slice(0, limit), label: 'Cerca de tu ubicación' };
  }
  const ref = city.center;
  const today = st.phase === 'during' ? new Set(st.day.activities.map((a) => a.placeId).filter(Boolean)) : new Set();
  const list = D.places.filter((p) => p.cityId === city.id && keep(p))
    .map((place) => ({ place, dist: distance(ref, [place.lat, place.lon]), today: today.has(place.id) }))
    .sort((a, b) => (b.today - a.today) || (a.dist - b.dist));
  return { ref, usingGps: false, city, list: list.slice(0, limit), label: `Puntos de interés en ${city.name}` };
}

export function lodgingsNear(city, st) {
  if (st.phase === 'during' && st.day.lodgingId) return [I.lodging[st.day.lodgingId]];
  return D.lodging.filter((l) => l.cityId === city.id).slice(0, 1);
}
