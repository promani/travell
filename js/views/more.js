// Secondary screens: menu, transport, lodging, to-do list, links, settings.
import { D, I, kv, settings, taskState, now, setSimulatedNow, bus, DATA_BASE } from '../store.js';
import { esc, fmtShort, fmtDate, toast, isoDate, cap } from '../util.js';
import { register, statusBadge, extLink, transportIcon, cat } from '../ui.js';
import { pendingTasks, taskRow } from './home.js';
import { tripPhase } from '../tripstate.js';
import { balances } from './expenses.js';

export function menu() {
  const items = [
    ['#/docs', '🎫', 'Documentos', 'Pasajes, visas, entradas, códigos'],
    ['#/transporte', '🚆', 'Transporte', 'Vuelos, trenes y traslados por día'],
    ['#/alojamientos', '🏨', 'Alojamientos', 'Hoteles, check-in y estado'],
    ['#/pendientes', '📋', 'Pendientes', 'Reservas y trámites por hacer'],
    ['#/itinerario', '🗓️', 'Itinerario completo', 'Todos los días'],
    ['#/enlaces', '🔗', 'Enlaces y fuentes', 'Metros, trámites, fuentes consultadas'],
    ['#/ajustes', '⚙️', 'Ajustes', 'Mapas, fecha de prueba, datos'],
  ];
  return `<header class="pagehead"><h1>Más</h1></header><nav class="menu">${items.map(([h, i, t, s]) => `<a href="${h}"><span>${i}</span><div><b>${t}</b><small>${s}</small></div><em>›</em></a>`).join('')}</nav>`;
}

export function itinerary() {
  const st = tripPhase();
  return `<header class="pagehead"><h1>🗓️ Itinerario</h1><p class="muted">${esc(D.trip.title)}</p></header>
  <ol class="daylist">${D.days.map((d) => `<li class="${st.phase === 'during' && st.day.id === d.id ? 'today' : ''}"><a href="#/dia/${d.id}">
    <span class="n">${d.n}</span><div><b>${esc(d.title)}</b><small>${esc(cap(fmtDate(d.date, { weekday: 'short', day: 'numeric', month: 'short' })))}${d.cityId ? ' · ' + esc(I.city[d.cityId].name) : ''}</small>
    <small class="muted">${esc(d.summary || '')}</small></div></a></li>`).join('')}</ol>`;
}

export function transport() {
  const byDay = {};
  D.transport.forEach((t) => (byDay[t.day] ||= []).push(t));
  return `<header class="pagehead"><h1>🚆 Transporte</h1></header>` + D.days.filter((d) => byDay[d.id]).map((d) => `
    <h3 class="grp"><a href="#/dia/${d.id}">Día ${d.n} · ${esc(fmtShort(d.date))}</a></h3>
    ${byDay[d.id].map((t) => `<article class="card trow2"><div class="o-ic">${transportIcon(t.kind)}</div><div>
      <b>${esc(t.route)}</b> ${statusBadge(t.status)}
      <small>${esc([t.medium, t.service].filter(Boolean).join(' · '))}</small>
      ${(t.depart || t.arrive) ? `<small>🕒 ${esc([t.depart, t.arrive].filter(Boolean).join(' → '))}</small>` : ''}
      ${t.price ? `<small>💳 ${esc(t.price)}</small>` : ''}
      ${t.buyWhere ? `<small>🛒 ${esc(t.buyWhere)}${t.buyWhen ? ' · ' + esc(t.buyWhen) : ''}</small>` : ''}
      ${t.link ? `<small>${extLink(t.link, 'Más info')}</small>` : ''}</div></article>`).join('')}`).join('');
}

export function lodging() {
  return `<header class="pagehead"><h1>🏨 Alojamientos</h1></header>` + D.lodging.map((l) => `
    <article class="card"><div class="card-head"><h3>${esc(l.name)}</h3>${statusBadge(l.status)}</div>
      <p>${esc(I.city[l.cityId]?.name || '')}${l.area ? ' · ' + esc(l.area) : ''}</p>
      <p>📅 ${esc(fmtShort(l.checkIn))} → ${esc(fmtShort(l.checkOut))} · ${l.nights} noche${l.nights > 1 ? 's' : ''}${l.checkInTime ? ` · check-in ${esc(l.checkInTime)}` : ''}${l.checkOutTime ? ` · check-out ${esc(l.checkOutTime)}` : ''}</p>
      ${l.notes ? `<p class="note-line">${esc(l.notes)}</p>` : ''}
      ${l.addressLocal ? `<p class="local">${esc(l.addressLocal)}</p>` : ''}
      <div class="row-actions"><a class="btn small" href="#/dia/${l.checkInDay}">Día de llegada</a>
        ${l.link ? extLink(l.link, 'Sitio del hotel') : ''}</div></article>`).join('');
}

export function pendientes() {
  const st = tripPhase();
  const open = pendingTasks(st.today);
  const doneList = D.tasks.filter((t) => taskState.get(t) === 'hecho');
  return `<header class="pagehead"><h1>📋 Pendientes</h1><p class="muted">Reservas, compras y trámites. Marcá los que ya resolviste.</p></header>
  <section class="card"><ul class="tasks">${open.map(taskRow).join('') || '<li class="muted">¡Todo listo! 🎉</li>'}</ul></section>
  ${doneList.length ? `<section class="card"><h3>Hechos (${doneList.length})</h3><ul class="tasks done">${doneList.map((t) => `<li class="task"><button class="act-done" data-act="toggle-task" data-id="${esc(t.id)}" aria-pressed="true">✓</button><div><b>${esc(t.title)}</b></div></li>`).join('')}</ul></section>` : ''}`;
}

export function enlaces() {
  const groups = {};
  D.links.forEach((l) => (groups[l.category || 'otros'] ||= []).push(l));
  const names = { transporte: '🚇 Transporte', 'trámite': '🛂 Trámites', fuente: '📚 Fuentes consultadas' };
  return `<header class="pagehead"><h1>🔗 Enlaces</h1><p class="muted">Requieren internet 🌐</p></header>` +
    Object.entries(groups).map(([k, arr]) => `<section class="card"><h3>${names[k] || cap(k)}</h3><ul class="links">${arr.map((l) => `<li>${extLink(l.url, l.title)}</li>`).join('')}</ul></section>`).join('');
}

export function ajustes() {
  const rates = { ...D.trip.currencies.rates, ...settings.get('rates', {}) };
  const sim = settings.get('simOffset', 0);
  const simDate = sim ? new Date(Date.now() + sim) : null;
  const loc = (d) => `${isoDate(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `<header class="pagehead"><h1>⚙️ Ajustes</h1></header>
  <section class="card"><h3>🗺 Mapa</h3>
    <label class="field">Capa de mapa<select data-change="set-provider">
      <option value="auto" ${settings.get('mapProvider', 'auto') === 'auto' ? 'selected' : ''}>Automática (según la ciudad)</option>
      ${Object.entries(D.trip.tileProviders).map(([k, p]) => `<option value="${k}" ${settings.get('mapProvider', 'auto') === k ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
    <p class="hint">En China continental se usa AutoNavi (Gaode), que funciona sin VPN. Fuera de China, OpenStreetMap. Ningún servicio de Google es necesario.</p></section>
  <section class="card"><h3>💱 Cotizaciones (por 1 ${esc(D.trip.currencies.base)})</h3>
    <p class="hint">${esc(D.trip.currencies.note || '')}</p>
    <form data-submit="save-rates" class="form two">${D.trip.currencies.list.filter((c) => c !== D.trip.currencies.base).map((c) => `<label class="field">${c}<input name="${c}" type="number" step="any" min="0" value="${rates[c]}"></label>`).join('')}
      <div class="row-actions"><button class="btn primary" type="submit">Guardar</button></div></form></section>
  <section class="card"><h3>🧪 Probar con otra fecha</h3>
    <p class="hint">Simula la fecha y hora para ver cómo se comporta la pantalla de inicio en cada momento del viaje (cuenta regresiva, día de salida, llegada…).</p>
    <label class="field">Fecha y hora simuladas<input type="datetime-local" id="sim-input" value="${simDate ? loc(simDate) : ''}"></label>
    <div class="row-actions"><button class="btn primary" data-act="sim-set">Aplicar</button><button class="btn" data-act="sim-clear">Volver a la fecha real</button>
      ${D.days.slice(0, 1).concat(D.days.filter((d) => d.cards.length)).map((d) => `<button class="btn small" data-act="sim-day" data-d="${d.date}">${esc(fmtShort(d.date))}</button>`).join('')}</div>
    ${simDate ? `<p class="note warn">Fecha simulada activa: ${esc(simDate.toLocaleString('es-AR'))}</p>` : ''}</section>
  <section class="card"><h3>💾 Datos del dispositivo</h3><p id="storage-info" class="muted">…</p>
    <p class="hint">Viaje: <b>${esc(D.trip.title)}</b> · datos en <code>${esc(DATA_BASE)}/</code>. Editá los JSON para cambiar el itinerario; lo que cargues en la app (fotos, gastos, códigos) queda en este dispositivo.</p>
    <div class="row-actions"><button class="btn" data-act="sw-refresh">Actualizar app y datos</button><button class="btn danger" data-act="wipe">Borrar datos locales</button></div></section>
  <p class="muted center">Travell · app web sin backend</p>`;
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
  'toggle-task': (el, _, app) => { const t = D.tasks.find((x) => x.id === el.dataset.id); taskState.set(t.id, taskState.get(t) === 'hecho' ? 'pendiente' : 'hecho'); app.rerender(); },
  'set-provider': (el) => { settings.set('mapProvider', el.value); toast('Listo'); },
  'save-rates': (form) => {
    const r = {}; new FormData(form).forEach((v, k) => { if (+v > 0) r[k] = +v; });
    settings.set('rates', r); toast('Cotizaciones guardadas');
  },
  'sim-set': (_, __, app) => { const v = document.getElementById('sim-input').value; if (v) { setSimulatedNow(v); toast('Fecha simulada'); app.rerender(); } },
  'sim-clear': (_, __, app) => { setSimulatedNow(null); toast('Fecha real'); app.rerender(); },
  'sim-day': (el, _, app) => { setSimulatedNow(`${el.dataset.d}T09:00`); app.rerender(); },
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
