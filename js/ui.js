// Shared rendering pieces: badges, activity rows, day cards (departure / arrival / info), map boxes, action registry.
import { D, I, done, checks, NOTE_KINDS } from './store.js';
import { esc, ic, icon, fmtDate, fmtShort, hhmm, cap, isoDate, imgUrl, extLink } from './util.js';
import { departureTimes, lodgingOfDay } from './tripstate.js';
import { TripMap } from './map.js';
import { ticketBox, ticketOf } from './ticket.js';
import { weatherLine } from './weather.js';

// ------------------------------------------------------------------ click-action registry (event delegation)
export const actions = {};
export const register = (map) => Object.assign(actions, map);

// ------------------------------------------------------------------ small fragments
// Picture of a day / of the trip (AI-generated, see trip.imageService). Empty string when there is none.
export const tripImgUrl = (img) => imgUrl(img, D.trip.imageService);
// Hero with a background picture: ' hero-img' class + inline CSS variable (the gradient stays as the fallback while offline).
export function heroImg(img) {
  const u = tripImgUrl(img);
  return u ? { cls: ' hero-img', style: ` style="--hero-img:url('${esc(u)}')"` } : { cls: '', style: '' };
}
export const cat = (id) => D.trip.categories[id] || { icon: 'location-dot', label: id, color: '#666' };
export const catChip = (id) => `<span class="tag" style="--c:${cat(id).color}">${icon(cat(id).icon)} ${esc(cat(id).label)}</span>`;
export const PRIO = { imperdible: ['star', 'Imperdible', 'must'], recomendado: ['thumbs-up', 'Recomendado', 'rec'], opcional: ['circle', 'Opcional', 'opt'] };
export const prioBadge = (p) => PRIO[p] ? `<span class="badge ${PRIO[p][2]}">${ic(PRIO[p][0])} ${PRIO[p][1]}</span>` : '';
export function statusBadge(s) {
  if (s === 'reservado') return `<span class="badge ok">${ic('check')} Reservado</span>`;
  if (s === 'pendiente') return `<span class="badge warn">${ic('hourglass-half')} Pendiente</span>`;
  if (s === 'hecho') return `<span class="badge ok">${ic('check')} Hecho</span>`;
  return '';
}
export const resvBadge = (r) => r === 'requerida' ? '<span class="badge warn">Reserva necesaria</span>'
  : r === 'recomendada' ? '<span class="badge info">Reserva recomendada</span>' : '';
export { extLink };
/** "Reserva en Booking.com" from a booking URL (the site's name, or a generic label). */
export function bookingSite(url) {
  let host = '';
  try { host = new URL(url).hostname.replace(/^(www|secure|m)\./, ''); } catch { return 'Ver la reserva'; }
  const known = { 'booking.com': 'Booking.com', 'trip.com': 'Trip.com', 'airbnb.com': 'Airbnb', 'agoda.com': 'Agoda', 'expedia.com': 'Expedia', 'hotels.com': 'Hotels.com', 'ctrip.com': 'Ctrip', 'jalan.net': 'Jalan', 'travel.rakuten.co.jp': 'Rakuten Travel' };
  const name = Object.entries(known).find(([d]) => host === d || host.endsWith('.' + d))?.[1];
  return name ? `Reserva en ${name}` : 'Ver la reserva';
}
export const dayLabel = (day) => cap(fmtDate(day.date, { weekday: 'long', day: 'numeric', month: 'long' }));
export const transportIcon = (k) => ic({ vuelo: 'plane', tren: 'train', bus: 'bus', auto: 'car' }[k] || 'route');

// ------------------------------------------------------------------ map box (creates a TripMap after render)
export function mapBox(ctx, id, init, cls = '') {
  ctx.after(() => {
    const el = document.getElementById(id);
    if (!el) return;
    const m = new TripMap(el, { scrollWheel: false });
    ctx.cleanup(() => m.destroy());
    init(m);
  });
  return `<div class="map ${cls}" id="${id}" role="region" aria-label="Mapa"></div>`;
}

// ------------------------------------------------------------------ activities
export function actRow(a, { current = false, next = false } = {}) {
  const isDone = done.has(a.id);
  const c = cat(a.category);
  const time = a.start ? `${esc(a.start)}${a.end ? `<small>${esc(a.end)}</small>` : ''}` : `<small>${esc(a.slot || '')}</small>`;
  return `<article class="act ${isDone ? 'is-done' : ''} ${current ? 'is-now' : ''} ${next ? 'is-next' : ''}" data-act-id="${esc(a.id)}">
    <button class="act-done" data-act="toggle-done" data-id="${esc(a.id)}" aria-label="Marcar como hecho" aria-pressed="${isDone}">${ic('check')}</button>
    <div class="act-main" data-act="toggle-act" role="button" tabindex="0" aria-expanded="false">
      <div class="act-time">${time}</div>
      <div class="act-body">
        <div class="act-title"><span class="act-ic" style="--c:${c.color}">${icon(c.icon)}</span> ${esc(a.title)}</div>
        <div class="act-tags">${current ? '<span class="badge now">Ahora</span>' : next ? '<span class="badge next">Sigue</span>' : ''}
          ${a.priority !== 'recomendado' ? prioBadge(a.priority) : ''}${a.source === 'app' ? '<span class="badge">nueva</span>' : ''}${a.status === 'reservado' ? statusBadge('reservado') : resvBadge(a.reservation)}</div>
      </div>
      <span class="chev" aria-hidden="true">▾</span>
    </div>
    <div class="act-more" hidden>
      ${a.detail ? `<p>${esc(a.detail)}</p>` : ''}
      <dl class="kv">
        ${a.area ? `<dt>Zona</dt><dd>${esc(a.area)}</dd>` : ''}
        ${a.how ? `<dt>Cómo llegar</dt><dd>${esc(a.how)}</dd>` : ''}
        ${a.cost ? `<dt>Costo</dt><dd>${esc(a.cost)}</dd>` : ''}
        ${a.status && a.status !== 'reservado' ? `<dt>Estado</dt><dd>${statusBadge(a.status)}</dd>` : ''}
      </dl>
      <div class="row-actions">
        ${a.placeId && I.place[a.placeId] ? `<a class="btn small" href="#/mapa?focus=${esc(a.placeId)}">${ic('map')} Ver en el mapa</a>` : ''}
        <button class="btn small" data-act="act-edit" data-id="${esc(a.id)}">${ic('pen')} Editar</button>
        ${a.link ? extLink(a.link, 'Más info') : ''}
      </div>
      ${a.reservation || ticketOf(`activity:${a.id}`) ? `<h4>${ic('ticket')} Entrada / reserva</h4>${ticketBox(`activity:${a.id}`, { codeLabel: 'Código o N° de reserva', title: a.title })}` : ''}
    </div>
  </article>`;
}

// ------------------------------------------------------------------ day cards
function docButtons(types) {
  const names = { pasaje: ['ticket', 'Pasajes y QR', '#/transporte'], visa: ['passport', 'Visas y documentos', '#/docs'] };
  return (types || []).map((t) => `<a class="btn" href="${names[t]?.[2] || '#/docs'}">${ic(names[t]?.[0] || 'file-lines')} ${esc(names[t]?.[1] || t)}</a>`).join('');
}

export function checklistHtml(card, day) {
  if (!card.checklist?.length) return '';
  return `<div class="checklist"><h4>Antes de salir</h4>${card.checklist.map((it, i) => {
    const key = `${day.id}:${i}`;
    return `<label class="check"><input type="checkbox" data-act="toggle-check" data-key="${esc(key)}" ${checks.has(key) ? 'checked' : ''}><span>${esc(it)}</span></label>`;
  }).join('')}</div>`;
}

export function departureCard(card, day, { hero = false } = {}) {
  const { t, dep, airport, leave, tz } = departureTimes(card, day);
  const place = card.airportPlaceId ? I.place[card.airportPlaceId] : null;
  const target = leave || airport;
  const cells = [
    leave && ['Salir de casa', hhmm(leave, tz), ''],
    airport && [hero ? 'Aeropuerto' : 'Estar en el aeropuerto', hhmm(airport, tz), place && !hero ? place.name.replace(/ \(.*\)/, '') : ''],
    dep && ['Despega', hhmm(dep, tz), hero ? fmtShort(isoDate(dep, tz)) : `${fmtShort(isoDate(dep, tz))}${t?.service ? ' · ' + t.service : ''}`],
  ].filter(Boolean);
  const grid = `<div class="go-grid">${cells.map(([l, v, s]) => `<div><small>${l}</small><b>${v}</b>${s ? `<em>${esc(s)}</em>` : ''}</div>`).join('')}</div>`;
  const count = target ? `<p class="countdown" data-countdown="${target.getTime()}" data-label="${leave ? 'para salir de casa' : 'para llegar al aeropuerto'}"></p>` : '';
  const airportBtn = place ? `<a class="btn" href="#/mapa?focus=${esc(place.id)}">${ic('map')} ${hero ? esc(place.name.replace(/ \(.*\)/, '')) : 'Aeropuerto'}</a>` : '';
  // The hero only keeps the times; the checklist goes in its own card below (see checklistCard) and the
  // document shortcuts are already on the home screen.
  if (hero) { const g = heroImg(day.image); return `<section class="hero hero-go${g.cls}"${g.style}><h1>${icon(card.icon || 'plane-departure')} ${esc(card.title)}</h1>${weatherLine(day)}${grid}${count}
    ${card.note ? `<p class="note-line">${esc(card.note)}</p>` : ''}${airportBtn ? `<div class="row-actions">${airportBtn}</div>` : ''}</section>`; }
  const body = `${grid}${count}${card.note ? `<p class="note-line">${esc(card.note)}</p>` : ''}${checklistHtml(card, day)}
    <div class="row-actions">${docButtons(card.docTypes)}${airportBtn}</div>`;
  return `<section class="card card-go"><h3>${icon(card.icon || 'plane-departure')} ${esc(card.title)}</h3>${body}</section>`;
}

export function checklistCard(card, day) {
  if (!card.checklist?.length) return '';
  const keys = card.checklist.map((_, i) => `${day.id}:${i}`);
  const n = keys.filter((k) => checks.has(k)).length;
  return `<section class="card"><div class="card-head"><h3>${ic('suitcase-rolling')} Antes de salir</h3><span class="badge ${n === keys.length ? 'ok' : ''}">${n}/${keys.length}</span></div>
    ${card.checklist.map((it, i) => `<label class="check"><input type="checkbox" data-act="toggle-check" data-key="${esc(keys[i])}" ${checks.has(keys[i]) ? 'checked' : ''}><span>${esc(it)}</span></label>`).join('')}</section>`;
}

export function arrivalCard(card, day, ctx) {
  const lodging = (card.lodgingId && I.lodging[card.lodgingId]) || lodgingOfDay(day);
  const id = `amap-${day.id}-${Math.random().toString(36).slice(2, 6)}`;
  const mapHtml = card.map ? mapBox(ctx, id, (m) => {
    const items = [];
    (card.map.routes || []).forEach((r) => items.push({ kind: 'route', path: r.path, color: r.color, dashed: r.dashed, label: r.label }));
    (card.map.points || []).forEach((p) => {
      if (p.placeId && I.place[p.placeId]) items.push({ kind: 'poi', place: I.place[p.placeId], label: p.label });
      else if (p.lodgingId && I.lodging[p.lodgingId]) items.push({ kind: 'lodging', lodging: I.lodging[p.lodgingId] });
      else if (p.lat) items.push({ kind: 'point', ...p });
    });
    m.setItems(items); m.fit();
  }, 'map-card') : '';
  const legend = (card.map?.routes || []).length
    ? `<div class="legend">${card.map.routes.map((r) => `<span><i style="--c:${r.color}"></i>${esc(r.label)}</span>`).join('')}</div>` : '';
  return `<section class="card card-arrival">
    <h3>${icon(card.icon || 'plane-arrival')} ${esc(card.title)}</h3>
    ${card.intro ? `<p>${esc(card.intro)}</p>` : ''}
    <h4>Cómo llegar al hospedaje</h4>
    <ul class="options">${(card.options || []).map((o) => `<li class="${o.recommended ? 'rec' : ''}">
      <span class="o-ic">${icon(o.icon || 'arrow-right')}</span>
      <div><b>${esc(o.label)}</b>${o.recommended ? ' <span class="badge ok">Sugerido</span>' : ''}
        <p>${esc(o.detail || '')}</p>
        <small>${[o.duration, o.cost].filter(Boolean).map(esc).join(' · ')}</small></div></li>`).join('')}</ul>
    ${mapHtml}${legend}
    ${lodging ? `<div class="lodging-line"><b>${ic('hotel')} ${esc(lodging.name)}</b>${lodging.area ? `<span>${esc(lodging.area)}</span>` : ''}
      ${lodging.status === 'pendiente' ? '<span class="badge warn">Hotel por reservar</span>' : ''}
      <button class="btn small" data-act="lodging-edit" data-id="${esc(lodging.id)}">${ic('pen')} Editar</button>
      ${lodging.bookingUrl ? extLink(lodging.bookingUrl, bookingSite(lodging.bookingUrl)) : ''}
      ${lodging.addressLocal ? `<button class="btn small" data-act="show-address" data-id="${esc(lodging.id)}">Mostrar dirección al taxista</button>` : ''}</div>` : ''}
    ${(card.links || []).length ? `<h4>Links de interés</h4><ul class="links">${card.links.map((l) => `<li>${extLink(l.url, l.title)}</li>`).join('')}</ul>
      <p class="hint">Los links necesitan internet. Para tener un mapa de metro offline, guardá una captura y adjuntala en Documentos.</p>` : ''}
  </section>`;
}

export function infoCard(card) {
  return `<section class="card"><h3>${icon(card.icon || 'circle-info')} ${esc(card.title)}</h3>${card.body ? `<p>${esc(card.body)}</p>` : ''}
    ${(card.links || []).map((l) => `<p>${extLink(l.url, l.title)}</p>`).join('')}</section>`;
}

export function renderCards(day, ctx, { skipTripStart = false } = {}) {
  return (day.cards || []).map((c) => {
    if (c.type === 'departure') return skipTripStart && c.tripStart ? '' : departureCard(c, day);
    if (c.type === 'arrival') return arrivalCard(c, day, ctx);
    return infoCard(c);
  }).join('');
}

// ------------------------------------------------------------------ notes: tips, reminders and alerts of a day
const KIND_ORDER = { alerta: 0, recordatorio: 1, tip: 2 };
/** The day's notes: alerts first, then reminders by time, then tips. */
export const notesFor = (day) => D.notes.filter((n) => n.days.includes(day.id))
  .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (a.time || '99').localeCompare(b.time || '99'));
const noteRow = (n) => `<li class="nrow k-${n.kind}" data-act="note-edit" data-id="${esc(n.id)}">
  <span class="nrow-ic">${ic(n.icon || NOTE_KINDS[n.kind][0])}</span>
  <div><b>${n.time ? `<span class="nrow-time">${esc(n.time)}</span> ` : ''}${esc(n.title)}</b>${n.detail ? `<p>${esc(n.detail)}</p>` : ''}
    ${(n.links || []).map((l) => `<p>${extLink(l.url, l.title)}</p>`).join('')}</div></li>`;
/** One card with the day's notes and a button to add one. Empty days show just the button. */
export function notesCard(day, { title = 'Notas del día', compact = false } = {}) {
  const list = notesFor(day);
  if (compact && !list.length) return '';
  return `<section class="card notes-card"><div class="card-head"><h3>${ic('note-sticky')} ${esc(title)}</h3>
      <button class="btn small" data-act="note-new" data-day="${esc(day.id)}">${ic('plus')} Nota</button></div>
    ${list.length ? `<ul class="nlist">${list.map(noteRow).join('')}</ul>` : '<p class="muted">Tips, recordatorios o alertas para este día: los ve todo el grupo.</p>'}</section>`;
}
