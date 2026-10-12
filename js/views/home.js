import { D, I, done, taskState, docCodes, settings } from '../store.js';
import { toast, esc, fmtDate, fmtShort, parseDate, daysBetween, isoDate, cap, fmtDist } from '../util.js';
import { tripPhase, activityNow, lodgingOfDay } from '../tripstate.js';
import { departureCard, renderCards, mapBox, cat, actRow, notesFor, noteHtml, dayLabel, register } from '../ui.js';
import { computeNearby, lodgingsNear } from '../nearby.js';
import { gps, onPosition, startGps, autoStartGpsIfGranted } from '../geo.js';
import { now } from '../store.js';

const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

function heroPre(st) {
  const n = st.daysToGo;
  const first = D.days[0], last = D.days[D.days.length - 1];
  return `<section class="hero hero-pre">
    <div class="hero-kicker">${esc(D.trip.subtitle || '')}</div>
    <h1>${n === 1 ? 'Falta' : 'Faltan'} <span class="big">${n}</span> ${n === 1 ? 'día' : 'días'} para tu viaje</h1>
    <p>${esc(D.trip.title)} · ${fmtShort(first.date)} → ${fmtShort(last.date)} · ${plural(D.days.length, 'día', 'días')}</p>
    <p class="hero-sub">Salís el ${esc(fmtDate(first.date))}</p>
  </section>`;
}

function heroDuring(st) {
  const d = st.day, l = lodgingOfDay(d);
  return `<section class="hero">
    <div class="hero-kicker">Día ${d.n} de ${st.total}${d.cityId ? ' · ' + esc(I.city[d.cityId]?.name || '') : ''}</div>
    <h1>${esc(d.title)}</h1>
    <p>${esc(d.summary || '')}</p>
    <p class="hero-sub">${esc(dayLabel(d))}${d.sleepsAt ? ` · 🛏 ${esc(l ? l.name + (l.area ? ' (' + l.area + ')' : '') : d.sleepsAt)}` : ''}</p>
  </section>`;
}

function heroPost() {
  const total = D.days.length;
  return `<section class="hero hero-post"><div class="hero-emoji">🎉</div><h1>¡Volviste!</h1>
    <p>Fueron ${total} días. Repasá las fotos y cerrá las cuentas.</p>
    <div class="row-actions center"><a class="btn" href="#/fotos">📷 Fotos</a><a class="btn" href="#/gastos">💸 Gastos</a></div></section>`;
}

function quickLinks(st) {
  const today = st.phase === 'during' ? `<a class="tile" href="#/dia/${st.day.id}"><span>📅</span>Actividades de hoy</a>` : `<a class="tile" href="#/dia/${D.days[0].id}"><span>🗓️</span>Itinerario</a>`;
  return `<nav class="tiles" aria-label="Accesos rápidos">
    <a class="tile primary" href="#/docs/pasaje"><span>🎫</span>Pasajes y códigos</a>
    <a class="tile primary" href="#/docs"><span>🛂</span>Visas y documentos</a>
    ${today}
    <a class="tile" href="#/pendientes"><span>📋</span>Pendientes</a>
  </nav>`;
}

function pinnedDocs() {
  const docs = D.documents.filter((d) => d.pin);
  if (!docs.length) return '';
  return `<section class="card"><h3>📌 Documentos clave</h3><ul class="doc-mini">${docs.map((d) => {
    const code = docCodes.get(d);
    return `<li><a href="#/docs/${esc(d.type)}"><b>${esc(d.title)}</b><small>${code ? esc(code) : esc(d.subtitle || '')}</small></a></li>`;
  }).join('')}</ul></section>`;
}

export function dueInfo(t, todayISO) {
  if (t.dueAt) {
    const due = new Date(t.dueAt);
    const diff = daysBetween(todayISO, isoDate(due));
    const when = `${fmtShort(isoDate(due))} ${due.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
    if (due < now()) return { text: `Venció el ${when}`, cls: 'late', rank: -1000 + diff };
    return { text: diff === 0 ? `Hoy ${when.split(' ').slice(-1)[0]}` : `En ${plural(diff, 'día', 'días')} · ${when}`, cls: diff <= 3 ? 'soon' : '', rank: diff };
  }
  if (t.urgent) return { text: t.when || 'Ya', cls: 'soon', rank: -500 };
  return { text: t.when || '', cls: '', rank: 500 };
}

export function pendingTasks(todayISO) {
  return D.tasks.filter((t) => taskState.get(t) !== 'hecho')
    .map((t) => ({ t, due: dueInfo(t, todayISO) })).sort((a, b) => a.due.rank - b.due.rank);
}
export function taskRow({ t, due }) {
  const dayRef = t.day && I.day[t.day] ? `<a href="#/dia/${t.day}">${esc(fmtShort(I.day[t.day].date))}</a>` : '';
  return `<li class="task ${due.cls}"><button class="act-done" data-act="toggle-task" data-id="${esc(t.id)}" aria-label="Marcar como hecho">✓</button>
    <div><b>${esc(t.title)}</b><small>${esc(due.text)}${dayRef ? ' · para el ' + dayRef : ''}</small>${t.notes ? `<small class="muted">${esc(t.notes)}</small>` : ''}</div></li>`;
}

function nearbyRow({ place, dist, today }, usingGps) {
  const c = cat(place.category);
  return `<li><a href="#/mapa?focus=${esc(place.id)}"><span class="act-ic" style="--c:${c.color}">${c.icon}</span>
    <div><b>${esc(place.name)}</b><small>${esc(c.label)}${place.area ? ' · ' + esc(place.area) : ''}${today ? ' · ⭐ hoy' : ''}</small></div>
    <em>${usingGps ? fmtDist(dist) : ''}</em></a></li>`;
}

export function render(_, ctx) {
  const st = tripPhase();
  let h = '';
  const day = st.day;
  if (st.phase === 'pre') h += heroPre(st);
  else if (st.phase === 'post') h += heroPost();
  else {
    const startCard = day.cards.find((c) => c.type === 'departure' && c.tripStart);
    h += startCard ? departureCard(startCard, day, { hero: true }) : heroDuring(st);
  }
  h += quickLinks(st);

  if (st.phase === 'during') {
    h += renderCards(day, ctx, { skipTripStart: true });
    const { current, next } = activityNow(day, now());
    const first = day.activities.filter((a) => !done.has(a.id)).slice(0, 3);
    const rows = (current || next ? [current, next].filter(Boolean) : first);
    if (rows.length) {
      h += `<section class="card"><div class="card-head"><h3>${current ? 'Ahora y lo que sigue' : next ? 'Lo que sigue' : 'Hoy'}</h3><a href="#/dia/${day.id}">Ver el día completo →</a></div>
        ${rows.map((a) => actRow(a, { current: a === current, next: a === next })).join('')}</section>`;
    }
    h += notesFor(day).map(noteHtml).join('');
  }
  if (st.phase === 'pre' || (st.phase === 'during' && day.n <= 3)) h += pinnedDocs();

  const tasks = pendingTasks(st.today);
  if (tasks.length && st.phase !== 'post') {
    h += `<section class="card"><div class="card-head"><h3>📋 Por hacer</h3><a href="#/pendientes">Ver todo (${tasks.length}) →</a></div>
      <ul class="tasks">${tasks.slice(0, 4).map(taskRow).join('')}</ul></section>`;
  }

  const nb = computeNearby(st);
  h += `<section class="card"><div class="card-head"><h3>📍 <span id="nb-title">${esc(nb.label)}</span></h3><a href="#/mapa">Mapa completo →</a></div>
    ${mapBox(ctx, 'homemap', (m) => setupHomeMap(m, st, ctx), 'map-home')}
    <div class="map-tools"><button class="btn small" data-act="locate">📍 Usar mi ubicación</button>
      <span class="hint" id="nb-hint"></span></div>
    <ul class="nearby" id="nb-list"></ul></section>`;
  return h;
}

function setupHomeMap(m, st, ctx) {
  let first = true;
  const refresh = () => {
    const nb = computeNearby(st);
    const items = nb.list.map((x) => ({ kind: 'poi', place: x.place }));
    lodgingsNear(nb.city, st).filter(Boolean).forEach((l) => items.push({ kind: 'lodging', lodging: l }));
    m.setItems(items);
    if (first) {
      first = false;
      if (nb.usingGps) m.setView(nb.ref[0], nb.ref[1], 15);
      else if (items.length > 1) m.fit();
      else m.setView(nb.ref[0], nb.ref[1], nb.city.zoom);
    }
    const t = document.getElementById('nb-title'); if (t) t.textContent = nb.label;
    const l = document.getElementById('nb-list');
    if (l) l.innerHTML = nb.list.slice(0, 6).map((x) => nearbyRow(x, nb.usingGps)).join('') || '<li class="muted">Sin lugares cargados para esta zona.</li>';
    const hint = document.getElementById('nb-hint');
    if (hint) hint.textContent = nb.usingGps ? 'Ordenado por distancia.' : (gps.error ? 'No se pudo obtener tu ubicación.' : 'Sin GPS: mostrando la ciudad del día.');
  };
  refresh();
  const off = onPosition(() => { if (gps.pos) { first = true; } refresh(); });
  ctx.cleanup(off);
  autoStartGpsIfGranted();
}

register({
  locate: () => { if (!('geolocation' in navigator)) return toast('Este dispositivo no tiene GPS'); startGps(); toast('Buscando tu ubicación…'); },
});
