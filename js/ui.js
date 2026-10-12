// Shared rendering pieces: badges, activity rows, day cards (departure / arrival / info), map boxes, action registry.
import { D, I, done, checks } from './store.js';
import { esc, fmtDate, fmtShort, hhmm, cap, isoDate, imgUrl } from './util.js';
import { departureTimes, lodgingOfDay } from './tripstate.js';
import { TripMap } from './map.js';

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
export const cat = (id) => D.trip.categories[id] || { icon: '📍', label: id, color: '#666' };
export const catChip = (id) => `<span class="tag" style="--c:${cat(id).color}">${cat(id).icon} ${esc(cat(id).label)}</span>`;
export const PRIO = { imperdible: ['⭐', 'Imperdible', 'must'], recomendado: ['👍', 'Recomendado', 'rec'], opcional: ['◦', 'Opcional', 'opt'] };
export const prioBadge = (p) => PRIO[p] ? `<span class="badge ${PRIO[p][2]}">${PRIO[p][0]} ${PRIO[p][1]}</span>` : '';
export function statusBadge(s) {
  if (s === 'reservado') return '<span class="badge ok">✔ Reservado</span>';
  if (s === 'pendiente') return '<span class="badge warn">⏳ Pendiente</span>';
  if (s === 'hecho') return '<span class="badge ok">✔ Hecho</span>';
  return '';
}
export const resvBadge = (r) => r === 'requerida' ? '<span class="badge warn">Reserva necesaria</span>'
  : r === 'recomendada' ? '<span class="badge info">Reserva recomendada</span>' : '';
export const extLink = (url, text) => `<a href="${esc(url)}" target="_blank" rel="noopener" class="ext">${esc(text)} <span aria-hidden="true">↗</span><span class="net" title="Requiere internet">🌐</span></a>`;
export const dayLabel = (day) => cap(fmtDate(day.date, { weekday: 'long', day: 'numeric', month: 'long' }));
export const transportIcon = (k) => ({ vuelo: '✈️', tren: '🚆', bus: '🚌', auto: '🚗' }[k] || '🚉');

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
    <button class="act-done" data-act="toggle-done" data-id="${esc(a.id)}" aria-label="Marcar como hecho" aria-pressed="${isDone}">✓</button>
    <div class="act-main" data-act="toggle-act" role="button" tabindex="0" aria-expanded="false">
      <div class="act-time">${time}</div>
      <div class="act-body">
        <div class="act-title"><span class="act-ic" style="--c:${c.color}">${c.icon}</span> ${esc(a.title)}</div>
        <div class="act-tags">${current ? '<span class="badge now">Ahora</span>' : next ? '<span class="badge next">Sigue</span>' : ''}
          ${a.priority !== 'recomendado' ? prioBadge(a.priority) : ''}${a.source === 'app' ? '<span class="badge">nueva</span>' : ''}${resvBadge(a.reservation)}${a.status === 'reservado' ? statusBadge('reservado') : ''}</div>
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
        ${a.placeId && I.place[a.placeId] ? `<a class="btn small" href="#/mapa?focus=${esc(a.placeId)}">🗺 Ver en el mapa</a>` : ''}
        <button class="btn small" data-act="act-edit" data-id="${esc(a.id)}">✏️ Editar</button>
        ${a.link ? extLink(a.link, 'Más info') : ''}
      </div>
    </div>
  </article>`;
}

// ------------------------------------------------------------------ day cards
function docButtons(types) {
  const names = { pasaje: ['🎫', 'Pasajes y códigos'], visa: ['🛂', 'Visas y documentos'] };
  return (types || []).map((t) => `<a class="btn" href="#/docs${t === 'pasaje' ? '/pasaje' : ''}">${names[t]?.[0] || '📄'} ${esc(names[t]?.[1] || t)}</a>`).join('');
}

export function checklistHtml(card, day) {
  if (!card.checklist?.length) return '';
  return `<div class="checklist"><h4>Antes de salir</h4>${card.checklist.map((it, i) => {
    const key = `${day.id}:${i}`;
    return `<label class="check"><input type="checkbox" data-act="toggle-check" data-key="${esc(key)}" ${checks.has(key) ? 'checked' : ''}><span>${esc(it)}</span></label>`;
  }).join('')}</div>`;
}

export function departureCard(card, day, { hero = false } = {}) {
  const { t, dep, airport, leave } = departureTimes(card, day);
  const place = card.airportPlaceId ? I.place[card.airportPlaceId] : null;
  const target = leave || airport;
  const cells = [
    leave && ['Salir de casa', hhmm(leave), ''],
    airport && ['Estar en el aeropuerto', hhmm(airport), place ? place.name.replace(/ \(.*\)/, '') : ''],
    dep && ['Despega', hhmm(dep), `${fmtShort(isoDate(dep))}${t?.service ? ' · ' + t.service : ''}`],
  ].filter(Boolean);
  const grid = `<div class="go-grid">${cells.map(([l, v, s]) => `<div><small>${l}</small><b>${v}</b>${s ? `<em>${esc(s)}</em>` : ''}</div>`).join('')}</div>`;
  const count = target ? `<p class="countdown" data-countdown="${target.getTime()}" data-label="${leave ? 'para salir de casa' : 'para llegar al aeropuerto'}"></p>` : '';
  const body = `${grid}${count}${card.note ? `<p class="note-line">${esc(card.note)}</p>` : ''}${checklistHtml(card, day)}
    <div class="row-actions">${docButtons(card.docTypes)}${place ? `<a class="btn" href="#/mapa?focus=${esc(place.id)}">🗺 Aeropuerto</a>` : ''}</div>`;
  if (hero) { const g = heroImg(day.image); return `<section class="hero hero-go${g.cls}"${g.style}><div class="hero-emoji">${card.icon || '🛫'}</div><h1>${esc(card.title)}</h1>${body}</section>`; }
  return `<section class="card card-go"><h3>${card.icon || '🛫'} ${esc(card.title)}</h3>${body}</section>`;
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
    ? `<div class="legend">${card.map.routes.map((r) => `<span><i style="background:${r.color}"></i>${esc(r.label)}</span>`).join('')}</div>` : '';
  return `<section class="card card-arrival">
    <h3>${card.icon || '🛬'} ${esc(card.title)}</h3>
    ${card.intro ? `<p>${esc(card.intro)}</p>` : ''}
    <h4>Cómo llegar al hospedaje</h4>
    <ul class="options">${(card.options || []).map((o) => `<li class="${o.recommended ? 'rec' : ''}">
      <span class="o-ic">${o.icon || '➡️'}</span>
      <div><b>${esc(o.label)}</b>${o.recommended ? ' <span class="badge ok">Sugerido</span>' : ''}
        <p>${esc(o.detail || '')}</p>
        <small>${[o.duration, o.cost].filter(Boolean).map(esc).join(' · ')}</small></div></li>`).join('')}</ul>
    ${mapHtml}${legend}
    ${lodging ? `<div class="lodging-line"><b>🏨 ${esc(lodging.name)}</b>${lodging.area ? `<span>${esc(lodging.area)}</span>` : ''}
      ${lodging.status === 'pendiente' ? '<span class="badge warn">Hotel por reservar</span>' : ''}
      <button class="btn small" data-act="lodging-edit" data-id="${esc(lodging.id)}">✏️ Editar</button>
      ${lodging.addressLocal ? `<button class="btn small" data-act="show-address" data-id="${esc(lodging.id)}">Mostrar dirección al taxista</button>` : ''}</div>` : ''}
    ${(card.links || []).length ? `<h4>Links de interés</h4><ul class="links">${card.links.map((l) => `<li>${extLink(l.url, l.title)}</li>`).join('')}</ul>
      <p class="hint">Los links necesitan internet. Para tener un mapa de metro offline, guardá una captura y adjuntala en Documentos.</p>` : ''}
  </section>`;
}

export function infoCard(card) {
  return `<section class="card"><h3>${card.icon || 'ℹ️'} ${esc(card.title)}</h3>${card.body ? `<p>${esc(card.body)}</p>` : ''}
    ${(card.links || []).map((l) => `<p>${extLink(l.url, l.title)}</p>`).join('')}</section>`;
}

export function renderCards(day, ctx, { skipTripStart = false } = {}) {
  return (day.cards || []).map((c) => {
    if (c.type === 'departure') return skipTripStart && c.tripStart ? '' : departureCard(c, day);
    if (c.type === 'arrival') return arrivalCard(c, day, ctx);
    return infoCard(c);
  }).join('');
}

// ------------------------------------------------------------------ notes (alerts) relevant to a day
export const notesFor = (day) => D.notes.filter((n) => (n.days || []).includes(day.id));
export const noteHtml = (n) => `<div class="note ${n.level === 'warn' ? 'warn' : 'info'}"><b>${n.level === 'warn' ? '⚠️' : 'ℹ️'} ${esc(n.title)}</b><p>${esc(n.detail)}</p></div>`;
