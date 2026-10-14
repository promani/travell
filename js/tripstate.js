// Where are we in the trip? (before / during / after) and derived facts about "today".
import { D, I, now, forMe } from './store.js';
import { isoDate, daysBetween, at, parseAt, tzOffset, fmtOffset, deviceTz } from './util.js';

// ------------------------------------------------------------------ time zones
// Times in the data ("09:00", "2026-11-18T15:00") are wall-clock times of the place where they happen, never of the
// phone. Each city has a `tz` in trip.json; a day can override it with `tz`. Travel days start in one zone and end in
// another: until the day's flight takes off, times are those of the place where you woke up.
const cityTz = (id) => (id && I.city[id]?.tz) || null;
/** Zone of home (before and after the trip). */
export const homeTz = () => cityTz(D.trip.home?.cityId) || D.trip.tz || undefined;
/** Zone where the day ends: its own `tz`, its city's, or (a day in the air) the next city's; home after the last city. */
export function dayTz(day) {
  if (day.tz) return day.tz;
  for (let k = D.days.indexOf(day); k >= 0 && k < D.days.length; k++) {
    const d = D.days[k], tz = d.tz || cityTz(d.cityId);
    if (tz) return tz;
  }
  return homeTz();
}
/** Zone where the day starts: where the previous day ended. */
export const startTz = (day) => { const i = D.days.indexOf(day); return i > 0 ? dayTz(D.days[i - 1]) : homeTz() || dayTz(day); };
/** Takeoff and landing of a transport. Without an explicit offset, departAt is read in the zone where its day starts
 *  and arriveAt in the zone where it ends. */
export function transportTimes(t) {
  const day = I.day[t.day];
  return { dep: day ? parseAt(t.departAt, startTz(day)) : null, arr: day ? parseAt(t.arriveAt, dayTz(day)) : null };
}
/** When the day's flight (or any transport with an exact time) leaves: the moment the zone changes. */
function switchAt(day) {
  const cardT = (day.cards || []).find((c) => c.type === 'departure' && forMe(c) && I.transport[c.transportId]?.day === day.id);
  const t = cardT ? I.transport[cardT.transportId] : D.transport.find((x) => x.day === day.id && x.departAt && forMe(x));
  return t ? transportTimes(t).dep : null;
}
/** Zone for an "HH:MM" of that day. */
export function tzForTime(day, hm) {
  const a = startTz(day), b = dayTz(day);
  if (a === b) return b;
  const sw = switchAt(day);
  return sw && at(day.date, hm, a) <= sw ? a : b;
}
/** The instant of an "HH:MM" of a day, in the right zone. */
export const timeOf = (day, hm) => at(day.date, hm, tzForTime(day, hm));
/** Zone the traveler is in at instant `n`. */
export function tzAt(n = now()) {
  const st = tripPhase(n);
  if (st.phase !== 'during') return homeTz();
  const sw = switchAt(st.day);
  return sw && n < sw ? startTz(st.day) : dayTz(st.day);
}
/** "hora de Japón (UTC+9)": the zone named after the country of the trip's cities that use it. */
export function tzLabel(tz, when = now()) {
  const c = D.trip.cities.find((x) => x.tz === tz);
  return `hora de ${c?.country || tz.split('/').pop().replace(/_/g, ' ')} (${fmtOffset(tzOffset(tz, when))})`;
}
/** Which clock the times of a day are in, when it isn't the phone's: "" otherwise. */
export function dayClockNote(day) {
  const a = startTz(day), b = dayTz(day), dev = deviceTz();
  if (!b || (a === b && tzOffset(b, at(day.date, '12:00', b)) === tzOffset(dev, at(day.date, '12:00', b)))) return '';
  const noon = at(day.date, '12:00', b);
  if (a === b) return `Horarios en ${tzLabel(b, noon)}`;
  return `Horarios en ${tzLabel(a, noon)} hasta el vuelo, después en ${tzLabel(b, noon)}`;
}

/** The instant for a date and wall-clock time where the traveler is that day (home before/after the trip). */
export function localInstant(dateISO, hm) {
  const day = I.dayByDate[dateISO];
  return day ? timeOf(day, hm) : at(dateISO, hm, homeTz());
}

export function tripPhase(n = now()) {
  const first = D.days[0], last = D.days[D.days.length - 1];
  // a day begins at midnight where you wake up and the trip ends at midnight where you land
  const day = [...D.days].reverse().find((d) => d.date <= isoDate(n, startTz(d)));
  if (!day) { const today = isoDate(n, startTz(first)); return { phase: 'pre', daysToGo: daysBetween(today, first.date), today }; }
  if (day === last && isoDate(n, dayTz(last)) > last.date) return { phase: 'post', today: isoDate(n, homeTz()) };
  const today = isoDate(n, startTz(day));
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

/** Start and end instants of an activity (end: its `end`, or one hour later; past midnight goes to the next day). */
export function activityTimes(a, day) {
  if (!a.start) return null;
  const s = timeOf(day, a.start);
  let e = a.end ? timeOf(day, a.end) : new Date(s.getTime() + 3600000);
  if (e <= s) e = new Date(e.getTime() + 86400000);
  return { s, e };
}
/** { current, next } activity of a day relative to `n`. */
export function activityNow(day, n = now()) {
  let current = null, next = null;
  for (const a of day.activities) {
    if (!a.start || !forMe(a)) continue;
    const { s, e } = activityTimes(a, day);
    if (s <= n && n < e) current = current || a;
    else if (s > n && !next) next = a;
  }
  return { current, next };
}

/** Times for a "departure" card: when to leave, when to be at the airport, when the plane takes off. */
export function departureTimes(card, day) {
  const t = card.transportId ? I.transport[card.transportId] : null;
  const dep = t ? transportTimes(t).dep : null;
  const airport = dep ? new Date(dep.getTime() - (card.airportLeadMinutes ?? 180) * 60000) : null;
  const leave = card.leaveHomeAt ? timeOf(day, card.leaveHomeAt) : null;
  // shown on the wall clock of the place you leave from
  const tz = t && I.day[t.day] ? startTz(I.day[t.day]) : startTz(day);
  return { t, dep, airport, leave, tz };
}

export const lodgingOfDay = (day) => (day.lodgingId ? I.lodging[day.lodgingId] : null);
export const cityName = (id) => I.city[id]?.name || '';
