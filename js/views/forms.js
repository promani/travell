// ABM (alta / baja / modificación) forms: places, lodging, activities, tasks, notes.
// Saved as overlay records (store.cols) on top of the JSON; location from the map, GPS or typed coordinates.
import { D, I, cols, me, settings, NOTE_KINDS } from '../store.js';
import { esc, ic, uid, toast, openModal, closeModal, fmtShort, haversine } from '../util.js';
import { register } from '../ui.js';
import { TripMap } from '../map.js';
import { gps, currentPosition } from '../geo.js';
import { tripPhase, focusCity } from '../tripstate.js';

// ------------------------------------------------------------------ field helpers
const opt = (v, l, cur) => `<option value="${esc(v ?? '')}" ${String(v ?? '') === String(cur ?? '') ? 'selected' : ''}>${esc(l)}</option>`;
const input = (label, name, val, attrs = '') => `<label class="field">${label}<input name="${name}" value="${esc(val ?? '')}" ${attrs}></label>`;
const textarea = (label, name, val) => `<label class="field">${label}<textarea name="${name}" rows="3">${esc(val ?? '')}</textarea></label>`;
const select = (label, name, options, cur, attrs = '') => `<label class="field">${label}<select name="${name}" ${attrs}>${options.map(([v, l]) => opt(v, l, cur)).join('')}</select></label>`;
const cityOptions = () => D.trip.cities.map((c) => [c.id, c.name]);
const dayOptions = (blank = '—') => [['', blank], ...D.days.map((d) => [d.id, `Día ${d.n} · ${fmtShort(d.date)} · ${d.title}`])];
const travelerOptions = (blank) => [...(blank ? [['', blank]] : []), ...D.travelers.map((t) => [t.id, t.name])];
// Who does it: every traveler ticked = everyone (no `travelers` field); a subset is saved as travelers: [ids]
const whoPick = (r) => `<fieldset class="field"><legend>Quiénes</legend><div class="day-pick">${D.travelers.map((t) => `<label class="chip"><input type="checkbox" name="travelers" value="${esc(t.id)}" ${!r.travelers?.length || r.travelers.includes(t.id) ? 'checked' : ''}>${esc(t.name)}</label>`).join('')}</div></fieldset>`;
const whoVal = (f) => { const ids = f.getAll('travelers'); return ids.length && ids.length < D.travelers.length ? ids : null; };
const buttons = (delAct, id, rec, col) => `<div class="row-actions"><button class="btn primary" type="submit">Guardar</button>
  <button class="btn" type="button" data-act="close-modal">Cancelar</button>
  ${delAct && id ? `<button class="btn danger" type="button" data-act="${delAct}" data-id="${esc(id)}">Borrar</button>` : ''}
  ${rec?.edited ? `<button class="btn" type="button" data-act="restore-original" data-col="${col}" data-id="${esc(id)}" title="Descarta los cambios hechos en la app">${ic('rotate-left')} Restaurar original</button>` : ''}</div>`;
const val = (f, k) => { const v = (f.get(k) ?? '').toString().trim(); return v === '' ? null : v; };

function nearestCity(lat, lon) {
  let best = null, bd = Infinity;
  for (const c of D.trip.cities) { const d = haversine([lat, lon], c.center); if (d < bd) { bd = d; best = c; } }
  return best;
}

// ------------------------------------------------------------------ location picker inside a form
const locBlock = (lat, lon, required) => `<fieldset class="field loc"><legend>Ubicación${required ? '' : ' (opcional)'}</legend>
  <div class="map map-pick" data-pick></div>
  <div class="row-actions"><button type="button" class="btn small" data-x="gps">${ic('location-dot')} Usar mi ubicación</button>
    <button type="button" class="btn small" data-x="clear">Quitar</button></div>
  <div class="two">${input('Latitud', 'lat', lat, 'inputmode="decimal" autocomplete="off"')}${input('Longitud', 'lon', lon, 'inputmode="decimal" autocomplete="off"')}</div>
  <p class="hint" data-loc-hint>Tocá el mapa o arrastrá el marcador. También podés pegar "lat, lon" en Latitud.</p></fieldset>`;

function mountPicker(dlg, { lat, lon, cityId }) {
  const el = dlg.querySelector('[data-pick]');
  const fLat = dlg.querySelector('[name=lat]'), fLon = dlg.querySelector('[name=lon]');
  const fCity = dlg.querySelector('[name=cityId]');
  const hint = dlg.querySelector('[data-loc-hint]');
  const city = I.city[cityId] || focusCity(tripPhase().day || D.days[0]);
  const map = new TripMap(el, { center: city.center, zoom: city.zoom, scrollWheel: true });
  const write = ([a, b], why) => {
    fLat.value = a.toFixed(6); fLon.value = b.toFixed(6);
    if (fCity) { const c = nearestCity(a, b); if (c && haversine([a, b], c.center) < 80000) fCity.value = c.id; }
    if (why) hint.textContent = why;
  };
  let start = Number.isFinite(+lat) && lat !== null && lat !== '' ? [+lat, +lon] : null;
  // deduce from GPS only when it makes sense (no city chosen yet, or you are in that city)
  const gpsNear = gps.pos && (!I.city[cityId] || haversine([gps.pos.lat, gps.pos.lon], I.city[cityId].center) < 60000);
  if (!start && gpsNear) { start = [gps.pos.lat, gps.pos.lon]; write(start, 'Ubicación tomada de tu GPS. Podés moverla.'); }
  else if (!start) hint.textContent = `Tocá el mapa de ${city.name} para ubicarlo, o usá tu GPS.`;
  map.enablePicker(start, (p) => write(p, 'Ubicación elegida en el mapa.'));
  if (start) map.setPick(start[0], start[1], 16);
  const fromFields = () => {
    const m = /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(fLat.value);
    if (m) { fLat.value = m[1]; fLon.value = m[2]; }
    const a = parseFloat(fLat.value), b = parseFloat(fLon.value);
    if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180) { map.setPick(a, b); write([a, b]); }
  };
  fLat.addEventListener('change', fromFields); fLon.addEventListener('change', fromFields);
  dlg.querySelector('[data-x=gps]').onclick = async () => {
    hint.textContent = 'Buscando tu ubicación…';
    try { const p = await currentPosition(); map.setPick(p.lat, p.lon, 17); write([p.lat, p.lon], `Ubicación de tu GPS (±${Math.round(p.acc)} m).`); }
    catch (e) { hint.textContent = e.code === 1 ? 'Permiso de ubicación denegado: habilitalo en el navegador.' : 'No se pudo obtener la ubicación.'; }
  };
  dlg.querySelector('[data-x=clear]').onclick = () => { fLat.value = ''; fLon.value = ''; map.pick = null; map.pickMarker?.remove(); map.pickMarker = null; };
  return () => map.destroy();
}

function open(html, loc) {
  let destroy = null;
  const dlg = openModal(html, { cls: 'wide form-modal', onClose: () => destroy?.() });
  if (loc) destroy = mountPicker(dlg, loc);
  dlg.querySelector('input:not([type=hidden]):not([type=radio]):not([type=checkbox]), textarea')?.focus({ preventScroll: true });
  return dlg;
}
function readLoc(f, required) {
  const lat = parseFloat(f.get('lat')), lon = parseFloat(f.get('lon'));
  if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
  if (required) { toast('Elegí la ubicación en el mapa o con tu GPS'); return false; }
  return { lat: null, lon: null };
}
const confirmDel = (what) => confirm(`¿Borrar ${what}? Se puede volver a cargar, pero no se recupera automáticamente.`);

// ------------------------------------------------------------------ places
export function openPlaceForm(p = {}) {
  const cats = Object.entries(D.trip.categories).filter(([k]) => k !== 'vuelo' && k !== 'alojamiento').map(([k, c]) => [k, c.label]);
  open(`<h3>${p.id ? 'Editar lugar' : 'Nuevo lugar'}</h3><form class="form" data-submit="place-save">
    <input type="hidden" name="id" value="${esc(p.id || '')}">
    ${input('Nombre *', 'name', p.name, 'required maxlength="100"')}
    ${input('Nombre en idioma local (para mostrar al taxista)', 'nameLocal', p.nameLocal)}
    <div class="two">${select('Categoría', 'category', cats, p.category || 'gastronomia')}${select('Ciudad', 'cityId', cityOptions(), p.cityId || focusCity(tripPhase().day || D.days[0]).id)}</div>
    ${locBlock(p.lat, p.lon, true)}
    ${input('Zona / barrio', 'area', p.area)}
    ${textarea('Descripción', 'description', p.description)}
    <div class="two">${input('Costo aprox.', 'cost', p.cost)}${input('Link', 'link', p.link, 'type="url" placeholder="https://"')}</div>
    ${p.id ? '' : `<div class="two">${select('Agregar al itinerario del día', 'addDay', dayOptions('No agregar'), '')}${input('Hora', 'addTime', '', 'type="time"')}</div>`}
    ${buttons('place-del', p.id, p, 'places')}</form>`, { lat: p.lat, lon: p.lon, cityId: p.cityId });
}

// ------------------------------------------------------------------ lodging
export function openLodgingForm(l = {}) {
  open(`<h3>${l.id ? 'Editar alojamiento' : 'Nuevo alojamiento'}</h3><form class="form" data-submit="lodging-save">
    <input type="hidden" name="id" value="${esc(l.id || '')}">
    ${input('Nombre *', 'name', l.name, 'required maxlength="100"')}
    <div class="two">${select('Ciudad', 'cityId', cityOptions(), l.cityId)}${select('Estado', 'status', [['pendiente', 'Por reservar'], ['reservado', 'Reservado']], l.status || 'pendiente')}</div>
    <div class="two">${input('Check-in *', 'checkIn', l.checkIn, 'type="date" required')}${input('Check-out *', 'checkOut', l.checkOut, 'type="date" required')}</div>
    <div class="two">${input('Hora check-in', 'checkInTime', l.checkInTime, 'type="time"')}${input('Hora check-out', 'checkOutTime', l.checkOutTime, 'type="time"')}</div>
    ${input('Zona / barrio', 'area', l.area)}
    ${input('Dirección', 'address', l.address)}
    ${textarea('Dirección en idioma local (para el taxista)', 'addressLocal', l.addressLocal)}
    ${locBlock(l.lat, l.lon, false)}
    <div class="two">${input('N° de reserva', 'confirmation', l.confirmation)}${input('Link a la reserva', 'bookingUrl', l.bookingUrl, 'type="url" placeholder="Booking, Trip.com, Airbnb…"')}</div>
    ${input('Sitio del hotel', 'link', l.link, 'type="url" placeholder="https://"')}
    ${textarea('Notas', 'notes', l.notes)}
    ${whoPick(l)}
    ${buttons('lodging-del', l.id, l, 'lodging')}</form>`, { lat: l.lat, lon: l.lon, cityId: l.cityId });
}

// ------------------------------------------------------------------ activities
export function openActivityForm(a = {}) {
  const day = I.day[a.dayId] || tripPhase().day || D.days[0];
  const places = D.places.filter((p) => !day.cityId || p.cityId === day.cityId || p.id === a.placeId).sort((x, y) => x.name.localeCompare(y.name));
  const cats = Object.entries(D.trip.categories).map(([k, c]) => [k, c.label]);
  open(`<h3>${a.id ? 'Editar actividad' : 'Nueva actividad'}</h3><form class="form" data-submit="act-save">
    <input type="hidden" name="id" value="${esc(a.id || '')}">
    ${select('Día *', 'dayId', dayOptions().slice(1), day.id)}
    ${input('Actividad *', 'title', a.title, 'required maxlength="120"')}
    <div class="two">${input('Desde', 'start', a.start, 'type="time"')}${input('Hasta', 'end', a.end, 'type="time"')}</div>
    <div class="two">${select('Categoría', 'category', cats, a.category || 'cultura')}${select('Prioridad', 'priority', [['imperdible', 'Imperdible'], ['recomendado', 'Recomendado'], ['opcional', 'Opcional']], a.priority || 'recomendado')}</div>
    ${select('Lugar', 'placeId', [['', '— Sin lugar —'], ...places.map((p) => [p.id, p.name])], a.placeId)}
    <p class="hint">¿El lugar no está? Cargalo primero en Más → Lugares (con su ubicación).</p>
    ${textarea('Detalle', 'detail', a.detail)}
    <div class="two">${input('Zona', 'area', a.area)}${input('Cómo llegar', 'how', a.how)}</div>
    <div class="two">${input('Costo', 'cost', a.cost)}${input('Link', 'link', a.link, 'type="url" placeholder="https://"')}</div>
    <div class="two">${select('Reserva', 'reservation', [['', 'No hace falta'], ['recomendada', 'Recomendada'], ['requerida', 'Necesaria']], a.reservation)}${select('Estado', 'status', [['', '—'], ['pendiente', 'Pendiente'], ['reservado', 'Reservado']], a.status)}</div>
    ${whoPick(a)}
    ${buttons('act-del', a.id, a, 'activities')}</form>`);
}

// ------------------------------------------------------------------ tasks
export function openTaskForm(t = {}) {
  const due = t.dueAt ? new Date(t.dueAt) : null;
  const pad = (n) => String(n).padStart(2, '0');
  const dDate = due ? `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}` : '';
  const dTime = due ? `${pad(due.getHours())}:${pad(due.getMinutes())}` : '';
  open(`<h3>${t.id ? 'Editar tarea' : 'Nueva tarea'}</h3><form class="form" data-submit="task-save">
    <input type="hidden" name="id" value="${esc(t.id || '')}"><input type="hidden" name="source" value="${esc(t.source || '')}">
    <input type="hidden" name="covers" value="${esc(JSON.stringify(t.covers || []))}">
    ${input('Tarea *', 'title', t.title, 'required maxlength="140"')}
    ${select('Asignada a', 'assignee', travelerOptions('Sin asignar (cualquiera)'), t.assignee ?? (t.id ? '' : me() || ''))}
    <div class="two">${input('Vence (fecha)', 'dueDate', dDate, 'type="date"')}${input('Hora', 'dueTime', dTime, 'type="time"')}</div>
    <div class="two">${select('Prioridad', 'priority', [['normal', 'Normal'], ['alta', 'Alta']], t.priority || 'normal')}${select('Estado', 'status', [['pendiente', 'Pendiente'], ['hecho', 'Hecha']], t.status || 'pendiente')}</div>
    ${select('Para el día', 'day', dayOptions(), t.day)}
    ${textarea('Notas', 'notes', t.notes)}
    ${buttons('task-del', t.id, t, 'tasks')}</form>`);
}

// ------------------------------------------------------------------ notes (tips, reminders, alerts) on one or more days
export function openNoteForm(n = {}, dayId = null) {
  const days = new Set(n.days?.length ? n.days : [dayId || tripPhase().day?.id || D.days[0].id]);
  const kind = n.kind || 'tip';
  open(`<h3>${n.id ? 'Editar nota' : 'Nueva nota'}</h3><form class="form" data-submit="note-save">
    <input type="hidden" name="id" value="${esc(n.id || '')}">
    <fieldset class="field"><legend>Tipo</legend><div class="kind-pick">${Object.entries(NOTE_KINDS).map(([k, [i, l]]) => `<label class="chip k-${k}"><input type="radio" name="kind" value="${k}" ${k === kind ? 'checked' : ''}>${ic(i)} ${l}</label>`).join('')}</div></fieldset>
    ${input('Título *', 'title', n.title, 'required maxlength="120" placeholder="Ej.: Llevar el pasaporte"')}
    ${textarea('Detalle', 'detail', n.detail)}
    ${input('Hora (opcional)', 'time', n.time, 'type="time"')}
    <fieldset class="field"><legend>Días</legend><div class="day-pick">${D.days.map((d) => `<label class="chip"><input type="checkbox" name="days" value="${esc(d.id)}" ${days.has(d.id) ? 'checked' : ''}><b>${d.n}</b> ${esc(fmtShort(d.date))}</label>`).join('')}</div></fieldset>
    <p class="hint">La ve todo el grupo (con la sincronización activa).</p>
    ${buttons('note-del', n.id, n, 'notes')}</form>`);
}

// ------------------------------------------------------------------ actions
const parsePrefill = (el) => { try { return JSON.parse(el.dataset.prefill || '{}'); } catch { return {}; } };
register({
  'restore-original': (el, _, app) => {
    if (!confirm('¿Descartar los cambios hechos en la app y volver a la versión del JSON?')) return;
    cols.reset(el.dataset.col, el.dataset.id); closeModal(el); toast('Restaurado'); app.rerender();
  },
  'place-new': (el) => openPlaceForm(parsePrefill(el)),
  'place-edit': (el) => openPlaceForm(I.place[el.dataset.id]),
  'place-save': (form, _, app) => {
    const f = new FormData(form), loc = readLoc(f, true);
    if (!loc) return;
    const id = val(f, 'id') || uid('p-u-');
    const prev = I.place[id] || {};
    cols.put('places', { id, name: val(f, 'name'), nameLocal: val(f, 'nameLocal'), category: val(f, 'category'), cityId: val(f, 'cityId'),
      ...loc, approx: false, area: val(f, 'area'), description: val(f, 'description'), cost: val(f, 'cost'), link: val(f, 'link'),
      source: prev.source || 'app' });
    const addDay = val(f, 'addDay');
    if (addDay) cols.put('activities', { id: uid('a-u-'), dayId: addDay, title: val(f, 'name'), start: val(f, 'addTime'), category: val(f, 'category'),
      priority: 'recomendado', placeId: id, area: val(f, 'area'), cityId: val(f, 'cityId'), source: 'app' });
    closeModal(form); toast('Lugar guardado'); app.rerender();
  },
  'place-del': (el, _, app) => { if (!confirmDel('este lugar')) return; cols.del('places', el.dataset.id); closeModal(el); toast('Lugar borrado'); app.navigate('#/lugares'); app.rerender(); },

  'lodging-new': (el) => openLodgingForm(parsePrefill(el)),
  'lodging-edit': (el) => openLodgingForm(I.lodging[el.dataset.id]),
  'lodging-save': (form, _, app) => {
    const f = new FormData(form), loc = readLoc(f, false);
    if (val(f, 'checkOut') <= val(f, 'checkIn')) return toast('El check-out tiene que ser después del check-in');
    const id = val(f, 'id') || uid('l-u-');
    cols.put('lodging', { id, name: val(f, 'name'), cityId: val(f, 'cityId'), status: val(f, 'status'), checkIn: val(f, 'checkIn'), checkOut: val(f, 'checkOut'),
      checkInTime: val(f, 'checkInTime'), checkOutTime: val(f, 'checkOutTime'), area: val(f, 'area'), address: val(f, 'address'), addressLocal: val(f, 'addressLocal'),
      ...loc, approx: false, confirmation: val(f, 'confirmation'), bookingUrl: val(f, 'bookingUrl'), link: val(f, 'link'), notes: val(f, 'notes'), travelers: whoVal(f) });
    closeModal(form); toast('Alojamiento guardado'); app.rerender();
  },
  'lodging-del': (el, _, app) => { if (!confirmDel('este alojamiento')) return; cols.del('lodging', el.dataset.id); closeModal(el); app.rerender(); },

  'act-new': (el) => openActivityForm({ dayId: el.dataset.day }),
  'act-edit': (el) => openActivityForm(I.activity[el.dataset.id]),
  'act-save': (form, _, app) => {
    const f = new FormData(form);
    const id = val(f, 'id') || uid('a-u-');
    const prev = I.activity[id] || {};
    cols.put('activities', { id, dayId: val(f, 'dayId'), title: val(f, 'title'), start: val(f, 'start'), end: val(f, 'end'), category: val(f, 'category'),
      priority: val(f, 'priority'), placeId: val(f, 'placeId'), detail: val(f, 'detail'), area: val(f, 'area'), how: val(f, 'how'), cost: val(f, 'cost'),
      link: val(f, 'link'), reservation: val(f, 'reservation'), status: val(f, 'status'), travelers: whoVal(f), slot: prev.slot || null,
      cityId: prev.cityId || I.day[val(f, 'dayId')]?.cityId || null, source: prev.source || 'app' });
    closeModal(form); toast('Actividad guardada'); app.rerender();
  },
  'act-del': (el, _, app) => { if (!confirmDel('esta actividad')) return; cols.del('activities', el.dataset.id); closeModal(el); app.rerender(); },

  'task-new': (el) => openTaskForm(parsePrefill(el)),
  'task-edit': (el) => openTaskForm(I.task[el.dataset.id]),
  'task-save': (form, _, app) => {
    const f = new FormData(form);
    const id = val(f, 'id') || uid('k-u-');
    const prev = I.task[id] || {};
    const date = val(f, 'dueDate'), time = val(f, 'dueTime');
    let covers = []; try { covers = JSON.parse(f.get('covers') || '[]'); } catch { /* ignore */ }
    cols.put('tasks', { id, title: val(f, 'title'), assignee: val(f, 'assignee'), priority: val(f, 'priority'), status: val(f, 'status'),
      day: val(f, 'day'), notes: val(f, 'notes'), dueAt: date ? `${date}T${time || '23:59'}` : null, when: date ? null : prev.when || null,
      urgent: prev.urgent && !date ? prev.urgent : false, covers: prev.covers || covers, source: prev.source || val(f, 'source') || 'app',
      createdBy: prev.createdBy || me() });
    const who = I.traveler[val(f, 'assignee')];
    closeModal(form); toast(who && who.id !== me() ? `Tarea asignada a ${who.name}` : 'Tarea guardada'); app.rerender();
  },
  'note-new': (el) => openNoteForm({}, el.dataset.day),
  'note-edit': (el, e) => { if (e?.target.closest('a')) return; const n = I.note[el.dataset.id]; if (n) openNoteForm(n); },
  'note-save': (form, _, app) => {
    const f = new FormData(form), days = f.getAll('days').map(String);
    if (!days.length) return toast('Elegí al menos un día');
    const prev = I.note[val(f, 'id')] || {};
    const { edited, ...base } = prev;
    cols.put('notes', { ...base, id: val(f, 'id') || uid('n-'), kind: val(f, 'kind') || 'tip', title: val(f, 'title'), detail: val(f, 'detail'), time: val(f, 'time'), days, ...(!prev.id && { by: me() }) });
    closeModal(form); app.rerender();
  },
  'note-del': (el, _, app) => { if (!confirmDel('esta nota')) return; cols.del('notes', el.dataset.id); closeModal(el); app.rerender(); },
  'task-del': (el, _, app) => { if (!confirmDel('esta tarea')) return; cols.del('tasks', el.dataset.id); closeModal(el); app.rerender(); },

});
