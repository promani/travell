// Where are we in the trip? (before / during / after) and derived facts about "today".
import { D, I, now } from './store.js';
import { isoDate, daysBetween, at } from './util.js';

export function tripPhase() {
  const n = now(), today = isoDate(n);
  const first = D.days[0], last = D.days[D.days.length - 1];
  if (today < first.date) return { phase: 'pre', daysToGo: daysBetween(today, first.date), today };
  if (today > last.date) return { phase: 'post', today };
  let day = I.dayByDate[today];
  if (!day) day = [...D.days].reverse().find((d) => d.date < today) || first;
  return { phase: 'during', day, index: D.days.indexOf(day), total: D.days.length, today };
}

/** First day (from `from` on) that has a city, so travel/flight days still have a map focus. */
export function focusCity(day) {
  const i = D.days.indexOf(day);
  for (let k = i; k < D.days.length; k++) if (D.days[k].cityId) return I.city[D.days[k].cityId];
  for (let k = i; k >= 0; k--) if (D.days[k].cityId) return I.city[D.days[k].cityId];
  return D.trip.cities[0];
}

/** City the map should open on, depending on the phase. */
export function defaultCity(st = tripPhase()) {
  const homeId = D.trip.home?.cityId;
  if (st.phase === 'during') return focusCity(st.day);
  if (st.phase === 'post') return focusCity(D.days[D.days.length - 1]);
  const d = D.days.find((x) => x.cityId && x.cityId !== homeId) || D.days[0];
  return focusCity(d);
}

const endOf = (a, date) => {
  const s = at(date, a.start);
  if (!a.start) return null;
  let e = a.end ? at(date, a.end) : new Date(s.getTime() + 3600000);
  if (e <= s) e = new Date(e.getTime() + 86400000);
  return e;
};
/** { current, next } activity of a day relative to `n`. */
export function activityNow(day, n = now()) {
  let current = null, next = null;
  for (const a of day.activities) {
    if (!a.start) continue;
    const s = at(day.date, a.start), e = endOf(a, day.date);
    if (s <= n && n < e) current = current || a;
    else if (s > n && !next) next = a;
  }
  return { current, next };
}

/** Times for a "departure" card: when to leave, when to be at the airport, when the plane takes off. */
export function departureTimes(card, day) {
  const t = card.transportId ? I.transport[card.transportId] : null;
  const dep = t?.departAt ? new Date(t.departAt) : null;
  const airport = dep ? new Date(dep.getTime() - (card.airportLeadMinutes ?? 180) * 60000) : null;
  const leave = card.leaveHomeAt ? at(day.date, card.leaveHomeAt) : null;
  return { t, dep, airport, leave };
}

export const lodgingOfDay = (day) => (day.lodgingId ? I.lodging[day.lodgingId] : null);
export const cityName = (id) => I.city[id]?.name || '';
