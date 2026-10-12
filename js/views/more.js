// Secondary screens: menu, transport, lodging, to-do list, links, settings.
import { D, I, settings, setSimulatedNow, DATA_BASE, kv, cols, overriddenBase } from '../store.js';
import { exportBackup, importBackup } from '../share.js';
import { tileUrls, prefetchTiles } from '../map.js';
import { esc, ic, fmtShort, fmtDate, toast, isoDate, cap } from '../util.js';
import { register, statusBadge, extLink, transportIcon, cat } from '../ui.js';
import { tripPhase } from '../tripstate.js';
import { setupCard } from './people.js';

export function menu(_, ctx) {
  ctx.after(() => setupCard(document.getElementById('setup')));
  const items = [
    ['#/tareas', 'square-check', 'Tareas y sugerencias', 'Pendientes asignables a cada viajero y lo que falta'],
    ['#/viajeros', 'users', 'Viajeros', 'Quién sos, ubicación del grupo, sincronización'],
    ['#/lugares', 'location-dot', 'Lugares', 'Agregar, editar e importar lugares de interés'],
    ['#/docs', 'ticket', 'Documentos', 'Pasajes, visas, entradas, códigos'],
    ['#/pasaportes', 'passport', 'Pasaportes', 'Datos y foto del pasaporte de cada viajero'],
    ['#/recursos', 'book', 'Recursos', 'Enlaces, mapas del metro, guías y apps por ciudad'],
    ['#/frases', 'language', 'Frases útiles', 'Cómo decir gracias, la cuenta, etc. en chino y japonés'],
    ['#/alojamientos', 'hotel', 'Alojamientos', 'Hoteles: agregar, editar, check-in'],
    ['#/transporte', 'train', 'Transporte', 'Vuelos, trenes y traslados por día'],
    ['#/fotos', 'camera', 'Fotos', 'Fotos por día, guardadas en el celular'],
    ['#/itinerario', 'calendar-days', 'Itinerario completo', 'Todos los días'],
    ['#/ajustes', 'gear', 'Ajustes', 'Mapas, simulador de fecha, datos'],
  ];
  return `<header class="pagehead"><h1>Más</h1></header><div id="setup"></div><nav class="menu">${items.map(([h, i, t, s]) => `<a href="${h}"><span>${ic(i)}</span><div><b>${t}</b><small>${s}</small></div><em>›</em></a>`).join('')}</nav>`;
}

export function itinerary() {
  const st = tripPhase();
  return `<header class="pagehead"><h1>${ic('calendar-days')} Itinerario</h1><p class="muted">${esc(D.trip.title)}</p></header>
  <ol class="daylist">${D.days.map((d) => `<li class="${st.phase === 'during' && st.day.id === d.id ? 'today' : ''}"><a href="#/dia/${d.id}">
    <span class="n">${d.n}</span><div><b>${esc(d.title)}</b><small>${esc(cap(fmtDate(d.date, { weekday: 'short', day: 'numeric', month: 'short' })))}${d.cityId ? ' · ' + esc(I.city[d.cityId].name) : ''}</small>
    <small class="muted">${esc(d.summary || '')}</small></div></a></li>`).join('')}</ol>`;
}

export function transport() {
  const byDay = {};
  D.transport.forEach((t) => (byDay[t.day] ||= []).push(t));
  return `<header class="pagehead"><h1>${ic('train')} Transporte</h1></header>` + D.days.filter((d) => byDay[d.id]).map((d) => `
    <h3 class="grp"><a href="#/dia/${d.id}">Día ${d.n} · ${esc(fmtShort(d.date))}</a></h3>
    ${byDay[d.id].map((t) => `<article class="card trow2"><div class="o-ic">${transportIcon(t.kind)}</div><div>
      <b>${esc(t.route)}</b> ${statusBadge(t.status)}
      <small>${esc([t.medium, t.service].filter(Boolean).join(' · '))}</small>
      ${(t.depart || t.arrive) ? `<small>${ic('clock')} ${esc([t.depart, t.arrive].filter(Boolean).join(' → '))}</small>` : ''}
      ${t.price ? `<small>${ic('credit-card')} ${esc(t.price)}</small>` : ''}
      ${t.buyWhere ? `<small>${ic('cart-shopping')} ${esc(t.buyWhere)}${t.buyWhen ? ' · ' + esc(t.buyWhen) : ''}</small>` : ''}
      ${t.link ? `<small>${extLink(t.link, 'Más info')}</small>` : ''}</div></article>`).join('')}`).join('');
}

export function lodging() {
  return `<header class="pagehead"><h1>${ic('hotel')} Alojamientos</h1></header>
  <div class="row-actions"><button class="btn primary" data-act="lodging-new">${ic('plus')} Agregar alojamiento</button></div>` + D.lodging.map((l) => `
    <article class="card"><div class="card-head"><h3>${esc(l.name)}</h3>${statusBadge(l.status)}</div>
      <p>${esc(I.city[l.cityId]?.name || '')}${l.area ? ' · ' + esc(l.area) : ''}</p>
      <p>${ic('calendar-day')} ${esc(fmtShort(l.checkIn))} → ${esc(fmtShort(l.checkOut))} · ${l.nights} noche${l.nights === 1 ? '' : 's'}${l.checkInTime ? ` · check-in ${esc(l.checkInTime)}` : ''}${l.checkOutTime ? ` · check-out ${esc(l.checkOutTime)}` : ''}</p>
      ${l.address ? `<p>${ic('map-location-dot')} ${esc(l.address)}</p>` : ''}
      ${l.addressLocal ? `<p class="local">${esc(l.addressLocal)}</p>` : ''}
      ${l.confirmation ? `<p>${ic('key')} Reserva: <b>${esc(l.confirmation)}</b></p>` : ''}
      ${l.notes ? `<p class="note-line">${esc(l.notes)}</p>` : ''}
      ${l.approx && Number.isFinite(l.lat) ? '<p class="hint">Ubicación aproximada (zona).</p>' : ''}
      <div class="row-actions"><button class="btn small" data-act="lodging-edit" data-id="${esc(l.id)}">${ic('pen')} Editar</button>
        ${l.checkInDay ? `<a class="btn small" href="#/dia/${l.checkInDay}">Día de llegada</a>` : ''}
        ${l.addressLocal ? `<button class="btn small" data-act="show-address" data-id="${esc(l.id)}">Mostrar al taxista</button>` : ''}
        ${l.link ? extLink(l.link, 'Sitio del hotel') : ''}</div></article>`).join('');
}

export function ajustes() {
  const rates = { ...D.trip.currencies.rates, ...settings.get('rates', {}) };
  const sim = settings.get('simOffset', 0);
  const simDate = sim ? new Date(Date.now() + sim) : null;
  const loc = (d) => `${isoDate(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `<header class="pagehead"><h1>${ic('gear')} Ajustes</h1></header>
  <section class="card"><h3>${ic('map')} Mapa</h3>
    <label class="field">Capa de mapa<select data-change="set-provider">
      <option value="auto" ${settings.get('mapProvider', 'auto') === 'auto' ? 'selected' : ''}>Automática (según la ciudad)</option>
      ${Object.entries(D.trip.tileProviders).map(([k, p]) => `<option value="${k}" ${settings.get('mapProvider', 'auto') === k ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
    <p class="hint">En China continental se usa AutoNavi (Gaode), que funciona sin VPN. Fuera de China, OpenStreetMap. Ningún servicio de Google es necesario.</p></section>
  <section class="card"><h3>${ic('users')} Viajeros y sincronización</h3><p class="hint">Quién usa este celular, compartir ubicación y sincronizar con el grupo.</p>
    <div class="row-actions"><a class="btn small" href="#/viajeros">Abrir Viajeros</a></div></section>
  <section class="card"><h3>${ic('money-bill-transfer')} Cotizaciones (por 1 ${esc(D.trip.currencies.base)})</h3>
    <p class="hint">${esc(D.trip.currencies.note || '')}</p>
    <form data-submit="save-rates" class="form two">${D.trip.currencies.list.filter((c) => c !== D.trip.currencies.base).map((c) => `<label class="field">${c}<input name="${c}" type="number" step="any" min="0" value="${rates[c]}"></label>`).join('')}
      <div class="row-actions"><button class="btn primary" type="submit">Guardar</button></div></form></section>
  <section class="card"><h3>${ic('flask')} Probar con otra fecha</h3>
    <p class="hint">Simula la fecha y hora para ver cómo se comporta la pantalla de inicio en cada momento del viaje (cuenta regresiva, día de salida, llegada…).</p>
    <label class="field">Fecha y hora simuladas<input type="datetime-local" id="sim-input" value="${simDate ? loc(simDate) : ''}"></label>
    <div class="row-actions"><button class="btn primary" data-act="sim-open">${ic('flask')} Simular un día</button><button class="btn" data-act="sim-set">Aplicar fecha de arriba</button><button class="btn" data-act="sim-clear">Volver a la fecha real</button>
      ${D.days.slice(0, 1).concat(D.days.filter((d) => d.cards.length)).map((d) => `<button class="btn small" data-act="sim-day" data-d="${d.date}">${esc(fmtShort(d.date))}</button>`).join('')}</div>
    ${simDate ? `<p class="note warn">Fecha simulada activa: ${esc(simDate.toLocaleString('es-AR'))}</p>` : ''}</section>
  <section class="card"><h3>${ic('map')} Mapas offline por ciudad</h3>
    <p class="hint">Descarga las teselas alrededor de los lugares de cada ciudad (zooms 12–15) para usar el mapa sin internet. Hacelo con wifi antes de viajar.</p>
    <ul class="people">${D.trip.cities.filter((c) => D.places.some((p) => p.cityId === c.id)).map((c) => {
      const saved = kv.get('offlineMaps', {})[c.id];
      return `<li><span class="o-ic">${ic('map-location-dot')}</span><div><b>${esc(c.name)}</b><small>${esc(D.trip.tileProviders[c.tiles]?.name || c.tiles)} · ~${cityTiles(c).length} teselas${saved ? ` · guardado el ${esc(new Date(saved).toLocaleDateString('es-AR'))}` : ''}</small></div>
        <button class="btn tiny ${saved ? '' : 'primary'}" data-act="offline-city" data-id="${esc(c.id)}">${saved ? 'Actualizar' : 'Descargar'}</button></li>`;
    }).join('')}</ul>
    <div class="row-actions"><button class="btn small" data-act="offline-all">${ic('download')} Descargar todas</button></div></section>

  <section class="card"><h3>${ic('box-archive')} Respaldo completo</h3>
    <p class="hint">Un archivo con <b>todo</b> lo que está en este celular: fotos, adjuntos (PDFs, QR), códigos, tareas, lugares, gastos, actividades hechas y checklists. Sirve para cambiar de celular o por si se pierde. Al importarlo se suma a lo que ya hay.</p>
    <div class="row-actions"><button class="btn small primary" data-act="backup-export">${ic('file-export')} Exportar respaldo</button>
      <label class="btn small">${ic('file-import')} Importar respaldo<input type="file" accept="application/json,.json" hidden data-change="backup-import"></label></div></section>

  ${(() => { const ov = overriddenBase(); return ov.length ? `<section class="card"><h3>${ic('rotate-left')} Cambios sobre el JSON</h3>
    <p class="hint">Registros del itinerario original que editaste o borraste en la app. Restaurar vuelve a la versión del JSON (en todos los celulares sincronizados).</p>
    <ul class="people">${ov.map((o) => `<li><div><b>${esc(o.title)}</b><small>${esc({ places: 'Lugar', lodging: 'Alojamiento', tasks: 'Tarea', travelers: 'Viajero', activities: 'Actividad' }[o.col])} · ${o.deleted ? 'borrado' : 'editado'}</small></div>
      <button class="btn tiny" data-act="restore-one" data-col="${o.col}" data-id="${esc(o.id)}">Restaurar</button></li>`).join('')}</ul></section>` : ''; })()}

  <section class="card"><h3>${ic('floppy-disk')} Datos del dispositivo</h3><p id="storage-info" class="muted">…</p>
    <p class="hint">Viaje: <b>${esc(D.trip.title)}</b> · datos en <code>${esc(DATA_BASE)}/</code>. Editá los JSON para cambiar el itinerario; lo que cargues en la app (fotos, gastos, códigos) queda en este dispositivo.</p>
    <div class="row-actions"><button class="btn" data-act="sw-refresh">Actualizar app y datos</button><button class="btn danger" data-act="wipe">Borrar datos locales</button></div></section>
  <p class="muted center">Travell · app web sin backend</p>`;
}

function cityTiles(c) {
  const pts = [c.center, ...D.places.filter((p) => p.cityId === c.id).map((p) => [p.lat, p.lon]), ...D.lodging.filter((l) => l.cityId === c.id && Number.isFinite(l.lat)).map((l) => [l.lat, l.lon])];
  return tileUrls(c.tiles, pts);
}
async function downloadCity(c, btn) {
  const urls = cityTiles(c);
  const ok = await prefetchTiles(urls, (n, tot) => { if (btn) btn.textContent = `${Math.round((n / tot) * 100)} %`; });
  if (ok) { const m = kv.get('offlineMaps', {}); m[c.id] = Date.now(); kv.set('offlineMaps', m); }
  return ok;
}

export async function storageInfo() {
  const el = document.getElementById('storage-info');
  if (!el) return;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    const persisted = await navigator.storage.persisted?.();
    el.textContent = `Usado: ${(usage / 1048576).toFixed(1)} MB de ${(quota / 1048576).toFixed(0)} MB · ${persisted ? 'almacenamiento persistente' : 'almacenamiento no persistente'}`;
  } catch { el.textContent = 'No disponible.'; }
}

register({
  'offline-city': async (el, _, app) => {
    el.disabled = true;
    const ok = await downloadCity(I.city[el.dataset.id], el);
    toast(ok ? `Mapa de ${I.city[el.dataset.id].name} guardado (${ok} teselas)` : 'No se pudo descargar (¿sin internet?)'); app.rerender();
  },
  'offline-all': async (el, _, app) => {
    el.disabled = true;
    const cities = D.trip.cities.filter((c) => D.places.some((p) => p.cityId === c.id));
    let total = 0;
    for (const [i, c] of cities.entries()) { el.textContent = `${i + 1}/${cities.length} · ${c.name}`; total += await downloadCity(c); }
    toast(total ? `Listo: ${total} teselas guardadas` : 'No se pudo descargar (¿sin internet?)'); app.rerender();
  },
  'backup-export': async (el) => {
    el.disabled = true; const label = el.textContent;
    try {
      const size = await exportBackup((s, n, tot) => { el.textContent = `${s === 'photoFull' ? 'Fotos' : s === 'files' ? 'Archivos' : 'Miniaturas'} ${n}/${tot}`; });
      toast(`Respaldo listo (${(size / 1048576).toFixed(1)} MB)`);
    } catch { toast('No se pudo generar el respaldo'); }
    el.disabled = false; el.textContent = label;
  },
  'backup-import': async (el, _, app) => {
    const file = el.files[0]; el.value = '';
    if (!file) return;
    toast('Importando…');
    try { const n = await importBackup(file); toast(`Respaldo importado (${n} fotos/archivos)`); app.rerender(); } catch (e) { toast(e.message || 'Archivo inválido'); }
  },
  'restore-one': (el, _, app) => { cols.reset(el.dataset.col, el.dataset.id); toast('Restaurado'); app.rerender(); },
  'set-provider': (el) => { settings.set('mapProvider', el.value); toast('Listo'); },
  'save-rates': (form) => {
    const r = {}; new FormData(form).forEach((v, k) => { if (+v > 0) r[k] = +v; });
    settings.set('rates', r); toast('Cotizaciones guardadas');
  },
  'sim-set': () => { const v = document.getElementById('sim-input').value; if (v) { setSimulatedNow(v); toast('Fecha simulada'); } },
  'sim-clear': () => { setSimulatedNow(null); toast('Fecha real'); },
  'sim-day': (el) => { setSimulatedNow(`${el.dataset.d}T09:00`); },
  'sw-refresh': async () => {
    const regs = await navigator.serviceWorker?.getRegistrations?.() || [];
    for (const r of regs) await r.update();
    for (const k of await caches.keys()) if (!k.includes('tiles')) await caches.delete(k);
    toast('Actualizando…'); setTimeout(() => location.reload(), 600);
  },
  wipe: async () => {
    if (!confirm('Esto borra fotos, gastos, códigos y marcas guardadas en ESTE dispositivo. ¿Seguro?')) return;
    Object.keys(localStorage).filter((k) => k.startsWith(`travell:${D.trip.id}:`)).forEach((k) => localStorage.removeItem(k));
    indexedDB.deleteDatabase('travell-' + D.trip.id);
    toast('Datos borrados'); setTimeout(() => location.reload(), 800);
  },
});
