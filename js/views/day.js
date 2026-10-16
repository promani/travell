import { D, I, done, settings, now, forMe } from '../store.js';
import { hasTicket, transportTicket, ticketCode, paintAttachments, freeUrls } from '../ticket.js';
import { esc, ic, imgFormUrl, fmtShort, fmtWeekdayShort, cap } from '../util.js';
import { tripPhase, activityNow, lodgingOfDay, dayClockNote, transportTimes } from '../tripstate.js';
import { heroImg, actRow, renderCards, notesCard, dayLabel, statusBadge, extLink, transportIcon, register, cat, bookingSite, lodgingOptions, whoBadge, mapBox } from '../ui.js';
import { thumbsFor } from './photos.js';
import { dayTotalText } from './expenses.js';
import { resourcesForDay, resRow } from './resources.js';
import { weatherLine } from '../weather.js';
import { mateSuggestion } from './mate.js';

let onlyMust = false;

function strip(active, todayId) {
  return `<div class="daystrip" id="daystrip">${D.days.map((d) => `<a href="#/dia/${d.id}" class="daychip ${d.id === active ? 'on' : ''} ${d.id === todayId ? 'today' : ''}" ${d.id === active ? 'aria-current="page"' : ''}>
    <small>${esc(cap(fmtWeekdayShort(d.date)))}</small><b>${d.n}</b><small>${esc(fmtShort(d.date))}</small></a>`).join('')}</div>`;
}

function transportRow(t) {
  const times = [t.depart, t.arrive].filter(Boolean).join(' → ');
  return `<li class="trow ${forMe(t) ? '' : 'not-mine'}"><span class="o-ic">${transportIcon(t.kind)}</span><div>
    <b>${esc(t.route)}</b> ${statusBadge(t.status)} ${whoBadge(t)}
    <small>${esc([t.medium, t.service].filter(Boolean).join(' · '))}${times ? ' · ' + esc(times) : ''}</small>
    ${t.price ? `<small>${ic('credit-card')} ${esc(t.price)}</small>` : ''}
    ${t.buyWhere && t.status === 'pendiente' ? `<small>${ic('cart-shopping')} ${esc(t.buyWhere)}${t.buyWhen ? ' — ' + esc(t.buyWhen) : ''}</small>` : ''}
    ${t.link ? `<small>${extLink(t.link, 'Más info')}</small>` : ''}
    ${t.notes ? `<small class="muted">${esc(t.notes)}</small>` : ''}
    ${hasTicket(t) ? transportTicket(t) : ''}</div></li>`;
}

// ------------------------------------------------------------------ flight: its own card (times, airports, duration, code and QR)
/** "15:00 PVG T2" → ["15:00", "PVG T2"]; "~18:10 (14/11)" → ["~18:10", "(14/11)"]. */
const splitEnd = (v) => { const m = /^(~?\d{1,2}:\d{2})\s*(.*)$/.exec(v || ''); return m ? [m[1], m[2]] : ['', v || '']; };
function flightCard(t) {
  const [from, to] = (t.route || '').split(/\s*→\s*/);
  const [dt, dp] = splitEnd(t.depart), [at, ap] = splitEnd(t.arrive);
  const { dep, arr } = transportTimes(t);
  const mins = dep && arr ? Math.round((arr - dep) / 60000) : null;
  const dur = mins > 0 ? `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, '0')}` : '';
  const end = (time, where, city) => `<div><b>${esc(time || '—')}</b>${where ? `<span>${esc(where)}</span>` : ''}${city ? `<small>${esc(city)}</small>` : ''}</div>`;
  return `<section class="card card-flight ${forMe(t) ? '' : 'not-mine'}">
    <div class="card-head"><h3>${ic('plane')} ${esc(t.service || 'Vuelo')}</h3><span>${whoBadge(t)} ${statusBadge(t.status)}</span></div>
    <div class="flight">${end(dt, dp, from)}<div class="flight-mid">${ic('plane')}${dur ? `<small>${esc(dur)}</small>` : ''}</div>${end(at, ap, to)}</div>
    ${t.price && t.price !== 'Ya pagado' ? `<p><small>${ic('credit-card')} ${esc(t.price)}</small></p>` : ''}
    ${t.buyWhere && t.status === 'pendiente' ? `<p><small>${ic('cart-shopping')} ${esc(t.buyWhere)}${t.buyWhen ? ' — ' + esc(t.buyWhen) : ''}</small></p>` : ''}
    ${t.notes ? `<p class="note-line">${esc(t.notes)}</p>` : ''}
    ${t.link ? `<p>${extLink(t.link, 'Más info')}</p>` : ''}
    ${transportTicket(t)}</section>`;
}

// ------------------------------------------------------------------ lodging: always its own card (not only on check-in days)
function lodgingBlock(l, day) {
  const nightN = Math.round((new Date(day.date) - new Date(l.checkIn)) / 86400000) + 1;
  const tomorrow = D.days[D.days.indexOf(day) + 1];
  const when = [l.checkIn === day.date ? `Check-in hoy${l.checkInTime ? ' desde las ' + l.checkInTime : ''}` : `Noche ${nightN} de ${l.nights}`,
    tomorrow && l.checkOut === tomorrow.date ? `check-out mañana${l.checkOutTime ? ' a las ' + l.checkOutTime : ''}` : ''].filter(Boolean).join(' · ');
  return `<div class="lodg ${forMe(l) ? '' : 'not-mine'}">
    <div class="card-head"><b class="lodg-name">${esc(l.name)}</b><span>${whoBadge(l)} ${statusBadge(l.status)}</span></div>
    <p class="muted">${esc(when)}${l.area ? ' · ' + esc(l.area) : ''}</p>
    ${l.address ? `<p>${ic('map-location-dot')} ${esc(l.address)}</p>` : ''}
    ${l.confirmation ? `<p>${ic('key')} Reserva: <b>${esc(l.confirmation)}</b></p>` : ''}
    ${l.notes ? `<p class="note-line">${esc(l.notes)}</p>` : ''}
    ${lodgingOptions(l)}
    <div class="row-actions">${l.addressLocal ? `<button class="btn small" data-act="show-address" data-id="${esc(l.id)}">Mostrar dirección al taxista</button>` : ''}
      ${l.bookingUrl ? extLink(l.bookingUrl, bookingSite(l.bookingUrl)) : ''}${l.link ? extLink(l.link, 'Hotel') : ''}
      <button class="btn small" data-act="lodging-edit" data-id="${esc(l.id)}">${ic('pen')} Editar</button></div></div>`;
}
function lodgingCard(day, ctx, { noTransfers }) {
  const i = D.days.indexOf(day), next = D.days[i + 1];
  // tonight: this phone's traveler's room first (lodgingOfDay), then the others' (shown dimmed)
  const main = lodgingOfDay(day);
  const tonight = [main, ...D.lodging.filter((x) => x !== main && x.checkIn <= day.date && day.date < x.checkOut)].filter(Boolean);
  const out = D.lodging.filter((x) => x.checkOutDay === day.id && !tonight.includes(x));
  const onPlane = /avi[oó]n/i.test(day.sleepsAt || '') || !next;
  if (!tonight.length && !out.length && onPlane) return '';
  const outHtml = out.map((x) => `<p class="lodg-out ${forMe(x) ? '' : 'not-mine'}">${ic('suitcase-rolling')} Check-out · <b>${esc(x.name)}</b>${x.checkOutTime ? ` · ${esc(x.checkOutTime)}` : ''} ${whoBadge(x)}</p>`).join('');
  const missing = !main && !onPlane ? `<div class="note warn"><b>${ic('bed')} No hay hospedaje cargado para esta noche</b>
    <div class="row-actions"><button class="btn small" data-act="lodging-new" data-prefill='${esc(JSON.stringify({ checkIn: day.date, checkOut: next.date, cityId: day.cityId }))}'>${ic('plus')} Cargar hospedaje</button></div></div>` : '';
  // a day without moving around: the lodging with the day's places around it, all in view (they can be far from it)
  const map = noTransfers && main && Number.isFinite(main.lat) ? mapBox(ctx, `lmap-${day.id}`, (m) => {
    const places = [...new Set(day.activities.map((a) => a.placeId))].map((id) => I.place[id]).filter((p) => p && Number.isFinite(p.lat));
    const lodgings = [...new Set([main, ...out])].filter((x) => Number.isFinite(x.lat));
    m.setItems([...lodgings.map((x) => ({ kind: 'lodging', lodging: x })), ...places.map((p) => ({ kind: 'poi', place: p }))]);
    m.fit();
  }, 'map-card') : '';
  return `<section class="card card-lodging"><h3>${ic('bed')} ${onPlane && !tonight.length ? 'Alojamiento' : 'Dónde dormís'}</h3>
    ${outHtml}${tonight.map((l) => lodgingBlock(l, day)).join('')}${missing}${map}</section>`;
}

export function render({ id }, ctx) {
  const st = tripPhase();
  const day = I.day[id] || (st.phase === 'during' ? st.day : D.days[0]);
  const todayId = st.phase === 'during' ? st.day.id : null;
  const i = D.days.indexOf(day);
  const prev = D.days[i - 1], next = D.days[i + 1];
  const l = lodgingOfDay(day);
  const isToday = day.id === todayId;
  const { current, next: nextA } = isToday ? activityNow(day, now()) : {};
  const acts = day.activities.filter((a) => !onlyMust || a.priority === 'imperdible');
  const dayTrans = D.transport.filter((t) => t.day === day.id);
  const flights = dayTrans.filter((t) => t.kind === 'vuelo').sort((a, b) => forMe(b) - forMe(a));
  const trans = dayTrans.filter((t) => t.kind !== 'vuelo');
  const noTransfers = !dayTrans.length && !(day.cards || []).some((c) => c.type === 'departure' || c.type === 'arrival');
  const docs = D.documents.filter((x) => x.day === day.id);
  const res = resourcesForDay(day);
  const dayPlaces = [...new Set(day.activities.map((a) => a.placeId).filter(Boolean))];

  ctx.cleanup(freeUrls);
  ctx.after(paintAttachments);
  ctx.after(() => {
    document.querySelector('#daystrip .on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
    thumbsFor(day.id, document.getElementById('day-photos'), ctx);
    dayTotalText(day.id).then((t) => { const el = document.getElementById('day-spend'); if (el) el.innerHTML = t; });
  });
  ctx.title = `Día ${day.n} · ${day.title}`;

  const g = heroImg(day.image);
  return `${strip(day.id, todayId)}
  <header class="dayhead${g.cls ? ' has-img' : ''}">
    ${g.cls ? `<div class="day-banner"${g.style} title="${esc(day.image.prompt)}"><a class="icon-btn sm banner-edit" href="${esc(imgFormUrl(day.image, D.trip.imageService))}" target="_blank" rel="noopener" aria-label="Rehacer la imagen">${ic('pen')}</a></div>` : ''}
    <div class="dayhead-nav">${prev ? `<a class="icon-btn" href="#/dia/${prev.id}" aria-label="Día anterior">‹</a>` : '<span></span>'}
      <div><small>Día ${day.n} de ${D.days.length}${isToday ? ' · <b>hoy</b>' : ''}</small><h1>${esc(day.title)}</h1><small>${esc(dayLabel(day))}${day.cityId ? ' · ' + esc(I.city[day.cityId].name) : ''}</small></div>
      ${next ? `<a class="icon-btn" href="#/dia/${next.id}" aria-label="Día siguiente">›</a>` : '<span></span>'}</div>
    <p>${esc(day.summary || '')}</p>
    ${weatherLine(day)}
    ${dayClockNote(day) ? `<p class="hint">${ic('clock')} ${esc(dayClockNote(day))}</p>` : ''}
    ${day.sleepsAt ? `<p class="hero-sub">${ic('bed')} Dormís en: ${esc(l ? `${l.name}${l.area ? ' (' + l.area + ')' : ''}` : day.sleepsAt)}</p>` : ''}
    <div class="row-actions">${dayPlaces.length ? `<a class="btn small" href="#/mapa?day=${day.id}">${ic('map')} Mapa del día</a>` : ''}
      <a class="btn small" href="#/fotos?day=${day.id}">${ic('camera')} Fotos</a><a class="btn small" href="#/gastos?day=${day.id}">${ic('money-bill-wave')} Gastos</a></div>
  </header>

  ${renderCards(day, ctx, { withLodging: false })}
  ${flights.map(flightCard).join('')}
  ${mateSuggestion(day)}
  ${notesCard(day)}

  <section class="card">
    <div class="card-head"><h3>Actividades</h3>
      <div class="row-actions"><button class="btn small ${onlyMust ? 'on' : ''}" data-act="toggle-must">${ic('star')} Imperdibles</button>
      <button class="btn small primary" data-act="act-new" data-day="${day.id}">${ic('plus')} Actividad</button></div></div>
    <div class="timeline">${acts.map((a) => actRow(a, { current: a === current, next: a === nextA })).join('') || '<p class="muted">Sin actividades.</p>'}</div>
    <p class="hint">Tocá una actividad para verla en el mapa; la flecha ▾ abre el detalle. El círculo ${ic('check')} la marca como hecha (se guarda en este dispositivo).</p>
  </section>

  ${lodgingCard(day, ctx, { noTransfers })}
  ${trans.length ? `<section class="card"><h3>Logística</h3><ul class="tlist">${trans.map(transportRow).join('')}</ul></section>` : ''}

  ${docs.length ? `<section class="card"><h3>${ic('file-lines')} Documentos de este día</h3><ul class="doc-mini">${docs.map((x) => `<li><a href="#/docs/${esc(x.type)}"><b>${esc(x.title)}</b><small>${esc(ticketCode(`doc:${x.id}`, x.code) || x.subtitle || '')}</small></a></li>`).join('')}</ul></section>` : ''}
  ${res.length ? `<section class="card"><div class="card-head"><h3>${ic('book')} Recursos${day.cityId ? ' · ' + esc(I.city[day.cityId].name) : ''}</h3><a href="#/recursos${day.cityId ? '?city=' + esc(day.cityId) : ''}">Ver →</a></div>
    <ul class="res-list">${res.map((r) => resRow(r, { actions: false })).join('')}</ul></section>` : ''}

  <section class="card"><div class="card-head"><h3>${ic('camera')} Fotos del día</h3><a href="#/fotos?day=${day.id}">Ver / agregar →</a></div><div class="thumbs" id="day-photos"></div></section>
  <section class="card"><div class="card-head"><h3>${ic('money-bill-wave')} Gastos del día</h3><a href="#/gastos?day=${day.id}">Ver / agregar →</a></div><p id="day-spend" class="muted">…</p></section>`;
}

register({
  'toggle-must': (_, __, app) => { onlyMust = !onlyMust; app.rerender(); },
  'toggle-act': (el) => {
    const art = el.closest('.act'), more = art.querySelector('.act-more');
    const open = more.hidden;
    more.hidden = !open; el.setAttribute('aria-expanded', String(open)); art.classList.toggle('open', open);
  },
  'act-map': (el) => { location.hash = el.dataset.href; },
  'toggle-done': (el) => {
    const on = done.toggle(el.dataset.id);
    const art = el.closest('.act'); art.classList.toggle('is-done', on); el.setAttribute('aria-pressed', String(on));
  },
});
