// "Te falta…": things that look pending, derived from the data (not typed by anyone).
// Skips anything a task already covers (task.covers / task.source = "sug:<key>") or that was marked done/ignored.
import { D, I, cols } from './store.js';
import { ticketCode } from './ticket.js';
import { passportOf, passportStatus } from './passport.js';
import { parseDate, isoDate, fmtShort } from './util.js';

const ICON = { salud: 'syringe', documentos: 'passport', dinero: 'credit-card', 'tecnología': 'mobile-screen', equipaje: 'suitcase-rolling' };
const addDays = (iso, n) => { const d = parseDate(iso); d.setDate(d.getDate() + n); return isoDate(d); };
const night = (n) => `${n} noche${n === 1 ? '' : 's'}`;

export function suggestionState(key) { const r = cols.map('suggestions')[key]; return r && !r.deleted ? r.state : null; }

export function suggestions({ includeClosed = false } = {}) {
  const out = [];
  const covered = new Set();
  D.tasks.forEach((t) => { (t.covers || []).forEach((k) => covered.add(k)); if (t.source?.startsWith('sug:')) covered.add(t.source.slice(4)); });
  const countries = new Set(D.trip.cities.map((c) => c.country));
  const start = D.days[0].date;
  const add = (s) => {
    if (covered.has(s.key)) return;
    const st = suggestionState(s.key);
    if (st && !includeClosed) return;
    out.push({ ...s, state: st });
  };

  // 1. preparativos (requirements.json)
  const reqs = (D.requirements || []).filter((r) => !r.countries?.length || r.countries.some((c) => countries.has(c)));
  reqs.forEach((r) => (r.covers || []).forEach((k) => covered.add(k)));
  for (const r of reqs) {
    add({ key: 'req:' + r.id, kind: 'preparativo', icon: ICON[r.category] || 'square-check', title: r.title, detail: r.detail, link: r.link,
      due: r.dueDaysBefore != null ? addDays(start, -r.dueDaysBefore) : null, category: r.category });
  }

  // 2. noches sin hospedaje
  D.days.forEach((d, i) => {
    if (i === D.days.length - 1 || /avi[oó]n/i.test(d.sleepsAt || '') || d.lodgingId) return;
    const city = I.city[d.cityId] || I.city[D.days[i + 1]?.cityId];
    add({ key: 'gap:' + d.date, kind: 'hospedaje', icon: 'bed', title: `Falta hospedaje la noche del ${fmtShort(d.date)}${city ? ' en ' + city.name : ''}`,
      detail: 'No hay ningún alojamiento cargado que cubra esta noche.', day: d.id, due: addDays(start, -7),
      action: { act: 'lodging-new', label: 'Cargar hospedaje', prefill: { checkIn: d.date, checkOut: D.days[i + 1].date, cityId: city?.id || null } } });
  });

  // 3. hospedajes sin reservar
  for (const l of D.lodging.filter((x) => x.status === 'pendiente')) {
    add({ key: 'lodging:' + l.id, kind: 'hospedaje', icon: 'hotel', title: `Reservar hospedaje en ${I.city[l.cityId]?.name || l.area || ''} (${fmtShort(l.checkIn)}, ${night(l.nights)})`,
      detail: l.notes, day: l.checkInDay, due: addDays(start, -10), action: { act: 'lodging-edit', label: 'Cargar la reserva', id: l.id } });
  }
  // 3b. tarea marcada como hecha pero el hospedaje sigue pendiente
  for (const t of D.tasks.filter((x) => x.status === 'hecho')) {
    for (const k of t.covers || []) {
      const l = k.startsWith('lodging:') && I.lodging[k.slice(8)];
      if (l && l.status === 'pendiente') {
        add({ key: 'fix:' + k, kind: 'hospedaje', icon: 'pen', title: `Completá los datos del hospedaje en ${I.city[l.cityId]?.name || ''}`,
          detail: `Marcaste "${t.title}" como hecha, pero el alojamiento sigue como "por reservar".`, day: l.checkInDay,
          action: { act: 'lodging-edit', label: 'Editar hospedaje', id: l.id } });
      }
    }
  }

  // 4. transportes sin comprar
  for (const t of D.transport.filter((x) => x.status === 'pendiente')) {
    add({ key: 'transport:' + t.id, kind: 'transporte', icon: 'ticket', title: `Comprar: ${t.route}${t.service ? ' (' + t.service + ')' : ''}`,
      detail: [t.buyWhere, t.buyWhen].filter(Boolean).join(' · '), day: t.day, link: t.link });
  }
  // 5. actividades que necesitan reserva
  for (const d of D.days) for (const a of d.activities.filter((x) => x.reservation === 'requerida' && x.status === 'pendiente')) {
    add({ key: 'activity:' + a.id, kind: 'reserva', icon: 'ticket', title: `Reservar: ${a.title}`, detail: a.detail, day: d.id, link: a.link });
  }
  // 6. documentos y códigos de los vuelos reservados
  for (const doc of D.documents) {
    if (doc.status === 'pendiente') add({ key: 'doc:' + doc.id, kind: 'documento', icon: 'file-lines', title: `Conseguir: ${doc.title}`, detail: doc.notes, day: doc.day, link: doc.url });
  }
  for (const t of D.transport.filter((x) => x.kind === 'vuelo' && x.status === 'reservado' && !ticketCode(`transport:${x.id}`, x.code))) {
    add({ key: 'code:transport:' + t.id, kind: 'pasaje', icon: 'key', title: `Cargá el código de reserva: ${t.route}${t.service ? ' (' + t.service + ')' : ''}`,
      detail: 'Y escaneá el QR de la tarjeta de embarque: así lo tenés sin internet en el aeropuerto.', day: t.day, action: { href: '#/transporte', label: 'Ir a transporte' } });
  }

  // 7. pasaportes
  const end = D.days[D.days.length - 1].date;
  for (const t of D.travelers) {
    const p = passportOf(t.id), st = passportStatus(p, end);
    if (st.level === 'missing') add({ key: 'passport:' + t.id, kind: 'documento', icon: 'passport', title: `Cargá el pasaporte de ${t.name}`, detail: 'Número, vencimiento y una foto, para tenerlos sin internet.', due: addDays(start, -30), action: { href: '#/pasaportes', label: 'Cargar pasaporte' } });
    else if (st.level !== 'ok') add({ key: 'passport-exp:' + t.id, kind: 'documento', icon: 'triangle-exclamation', title: `Revisá el vencimiento del pasaporte de ${t.name}`, detail: st.text, due: addDays(start, -30), action: { href: '#/pasaportes', label: 'Ver pasaporte' } });
  }

  const rank = (s) => (s.due || (s.day && I.day[s.day]?.date) || '9999');
  return out.sort((a, b) => rank(a).localeCompare(rank(b)));
}
