import { D, I, done, settings, now } from '../store.js';
import { hasTicket, transportTicket, ticketCode, paintAttachments, freeUrls } from '../ticket.js';
import { esc, ic, fmtShort, fmtWeekdayShort, cap } from '../util.js';
import { tripPhase, activityNow, lodgingOfDay, dayClockNote } from '../tripstate.js';
import { heroImg, actRow, renderCards, notesCard, dayLabel, statusBadge, extLink, transportIcon, register, cat, bookingSite, lodgingOptions } from '../ui.js';
import { thumbsFor } from './photos.js';
import { dayTotalText } from './expenses.js';
import { resourcesForDay, resRow } from './resources.js';
import { weatherLine } from '../weather.js';

let onlyMust = false;

function strip(active, todayId) {
  return `<div class="daystrip" id="daystrip">${D.days.map((d) => `<a href="#/dia/${d.id}" class="daychip ${d.id === active ? 'on' : ''} ${d.id === todayId ? 'today' : ''}" ${d.id === active ? 'aria-current="page"' : ''}>
    <small>${esc(cap(fmtWeekdayShort(d.date)))}</small><b>${d.n}</b><small>${esc(fmtShort(d.date))}</small></a>`).join('')}</div>`;
}

function transportRow(t) {
  const times = [t.depart, t.arrive].filter(Boolean).join(' → ');
  return `<li class="trow"><span class="o-ic">${transportIcon(t.kind)}</span><div>
    <b>${esc(t.route)}</b> ${statusBadge(t.status)}
    <small>${esc([t.medium, t.service].filter(Boolean).join(' · '))}${times ? ' · ' + esc(times) : ''}</small>
    ${t.price ? `<small>${ic('credit-card')} ${esc(t.price)}</small>` : ''}
    ${t.buyWhere && t.status === 'pendiente' ? `<small>${ic('cart-shopping')} ${esc(t.buyWhere)}${t.buyWhen ? ' — ' + esc(t.buyWhen) : ''}</small>` : ''}
    ${t.link ? `<small>${extLink(t.link, 'Más info')}</small>` : ''}
    ${t.notes ? `<small class="muted">${esc(t.notes)}</small>` : ''}
    ${hasTicket(t) ? transportTicket(t) : ''}</div></li>`;
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
  const trans = D.transport.filter((t) => t.day === day.id);
  const lodgIn = D.lodging.filter((x) => x.checkInDay === day.id), lodgOut = D.lodging.filter((x) => x.checkOutDay === day.id);
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
    ${g.cls ? `<div class="day-banner"${g.style} role="img" aria-label="${esc(day.image.prompt)}"></div>` : ''}
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

  ${renderCards(day, ctx)}
  ${notesCard(day)}

  <section class="card">
    <div class="card-head"><h3>Actividades</h3>
      <div class="row-actions"><button class="btn small ${onlyMust ? 'on' : ''}" data-act="toggle-must">${ic('star')} Imperdibles</button>
      <button class="btn small primary" data-act="act-new" data-day="${day.id}">${ic('plus')} Actividad</button></div></div>
    <div class="timeline">${acts.map((a) => actRow(a, { current: a === current, next: a === nextA })).join('') || '<p class="muted">Sin actividades.</p>'}</div>
    <p class="hint">Tocá una actividad para ver el detalle. El círculo ${ic('check')} la marca como hecha (se guarda en este dispositivo).</p>
  </section>

  ${!l && !/avi[oó]n/i.test(day.sleepsAt || '') && i < D.days.length - 1 ? `<div class="note warn"><b>${ic('bed')} No hay hospedaje cargado para esta noche</b>
    <div class="row-actions"><button class="btn small" data-act="lodging-new" data-prefill='${esc(JSON.stringify({ checkIn: day.date, checkOut: next.date, cityId: day.cityId }))}'>${ic('plus')} Cargar hospedaje</button></div></div>` : ''}
  ${(trans.length || lodgIn.length || lodgOut.length) ? `<section class="card"><h3>Logística</h3><ul class="tlist">
    ${lodgOut.map((x) => `<li class="trow"><span class="o-ic">${ic('suitcase-rolling')}</span><div><b>Check-out · ${esc(x.name)}</b><small>${esc(x.checkOutTime || '')}</small></div></li>`).join('')}
    ${trans.map(transportRow).join('')}
    ${lodgIn.map((x) => `<li class="trow"><span class="o-ic">${ic('hotel')}</span><div><b>Check-in · ${esc(x.name)}</b> ${statusBadge(x.status)} <button class="btn tiny" data-act="lodging-edit" data-id="${esc(x.id)}">Editar</button><small>${esc([x.area, x.checkInTime, x.notes].filter(Boolean).join(' · '))}</small>
      ${x.confirmation ? `<small>${ic('key')} Reserva: <b>${esc(x.confirmation)}</b></small>` : ''}
      ${x.bookingUrl ? `<small>${extLink(x.bookingUrl, bookingSite(x.bookingUrl))}</small>` : ''}${x.link ? `<small>${extLink(x.link, 'Hotel')}</small>` : ''}${lodgingOptions(x)}</div></li>`).join('')}</ul></section>` : ''}

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
  'toggle-done': (el) => {
    const on = done.toggle(el.dataset.id);
    const art = el.closest('.act'); art.classList.toggle('is-done', on); el.setAttribute('aria-pressed', String(on));
  },
});
