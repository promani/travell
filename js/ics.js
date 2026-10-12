// Calendar export (.ics): activities with a time, nights at each hotel, when to leave for the airport and my tasks
// with a due date. Times go out in UTC, so the calendar shows them right whatever zone the phone is in.
// Each event keeps a stable UID: importing the file again updates the events instead of duplicating them (Apple, Outlook).
import { D, I, me } from './store.js';
import { activityTimes, departureTimes } from './tripstate.js';

const utc = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const day = (iso) => iso.replace(/-/g, '');
const text = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[,;]/g, (c) => '\\' + c);

/** RFC 5545 line folding: at most 75 bytes per line, continuation lines start with a space. */
function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = '', size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; size = 0; }
    cur += ch; size += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

function event({ uid, start, end, allDay, title, location, geo, description, url, alarm }) {
  const L = ['BEGIN:VEVENT', `UID:${uid}@${D.trip.id}.travell`, `DTSTAMP:${utc(new Date())}`];
  if (allDay) L.push(`DTSTART;VALUE=DATE:${day(start)}`, `DTEND;VALUE=DATE:${day(end)}`);
  else L.push(`DTSTART:${utc(start)}`, `DTEND:${utc(end || start)}`);
  L.push(`SUMMARY:${text(title)}`);
  if (location) L.push(`LOCATION:${text(location)}`);
  if (geo) L.push(`GEO:${geo[0]};${geo[1]}`);
  if (description) L.push(`DESCRIPTION:${text(description)}`);
  if (url) L.push(`URL:${url}`);
  if (alarm != null) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${text(title)}`, `TRIGGER:-PT${alarm}M`, 'END:VALARM');
  L.push('END:VEVENT');
  return L;
}

export function buildIcs() {
  const ev = [];
  for (const d of D.days) {
    for (const a of d.activities) {
      const t = activityTimes(a, d);
      if (!t) continue;
      const p = a.placeId && I.place[a.placeId];
      ev.push(event({
        uid: `act-${a.id}`, start: t.s, end: t.e, title: a.title,
        location: p ? [p.name, p.nameLocal].filter(Boolean).join(' · ') : a.area,
        geo: p && Number.isFinite(p.lat) ? [p.lat, p.lon] : null,
        description: [a.detail, a.how && `Cómo llegar: ${a.how}`, a.cost && `Costo: ${a.cost}`, `Día ${d.n} · ${d.title}`].filter(Boolean).join('\n'),
        url: a.link,
      }));
    }
    for (const c of d.cards || []) {
      if (c.type !== 'departure') continue;
      const { leave, airport, t } = departureTimes(c, d);
      const when = leave || airport;
      if (!when) continue;
      ev.push(event({ uid: `go-${d.id}`, start: when, end: new Date(when.getTime() + 30 * 60000), alarm: 30,
        title: leave ? 'Salir hacia el aeropuerto' : 'Estar en el aeropuerto', description: [c.title, t?.route, t?.service, c.note].filter(Boolean).join('\n') }));
    }
  }
  for (const l of D.lodging) {
    if (!l.checkIn || !l.checkOut) continue;
    ev.push(event({ uid: `lodging-${l.id}`, allDay: true, start: l.checkIn, end: l.checkOut, title: `Hotel: ${l.name}`,
      location: [l.address, l.addressLocal].filter(Boolean).join(' · ') || l.area,
      geo: Number.isFinite(l.lat) ? [l.lat, l.lon] : null,
      description: [l.confirmation && `Reserva: ${l.confirmation}`, l.checkInTime && `Check-in ${l.checkInTime}`, l.checkOutTime && `Check-out ${l.checkOutTime}`, l.notes].filter(Boolean).join('\n'),
      url: l.link }));
  }
  // tasks: mine (or unassigned) when I said who I am, all of them otherwise; their due time was typed on this phone
  for (const t of D.tasks) {
    if (t.status === 'hecho' || !t.dueAt || (me() && t.assignee && t.assignee !== me())) continue;
    const due = new Date(t.dueAt);
    ev.push(event({ uid: `task-${t.id}`, start: due, end: new Date(due.getTime() + 15 * 60000), alarm: 0, title: `Tarea: ${t.title}`, description: t.notes }));
  }
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Travell//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${text(D.trip.title)}`, ...ev.flat(), 'END:VCALENDAR'];
  return lines.map(fold).join('\r\n') + '\r\n';
}
