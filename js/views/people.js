// Travelers: who am I, location permission & sharing, where the others are, the travelers ABM, and group sync settings.
import { D, I, cols, me, settings, bus } from '../store.js';
import { esc, ic, toast, copyText, fmtDist, haversine } from '../util.js';
import { register, mapBox } from '../ui.js';
import { gps, startGps, currentPosition, permissionState, onPosition } from '../geo.js';
import { ago } from '../map.js';
import { syncNow, syncState, syncConfigured, shareMyPosition, locationLink, otherPositions, defaultRelayUrl } from '../sync.js';
import { exportShared, importShared } from '../share.js';
import { passportCards } from './passports.js';
import { paintAttachments, freeUrls } from '../ticket.js';

export function personItems() {
  return otherPositions().map((pos) => ({ kind: 'person', traveler: I.traveler[pos.id], pos }));
}

export async function permBanner(el) {
  if (!el) return;
  const st = await permissionState();
  if (st === 'granted') { el.innerHTML = ''; return; }
  el.innerHTML = st === 'denied'
    ? `<div class="note warn"><b>${ic('location-dot')} La ubicación está bloqueada</b><p>Habilitala en los permisos del sitio del navegador para ver lugares cercanos y compartir dónde estás.</p></div>`
    : `<div class="note perm"><b>${ic('location-dot')} Activá tu ubicación</b><p>Para ordenar los lugares por cercanía, cargar lugares desde donde estás y mostrarle al grupo dónde estás (solo si lo activás).</p>
       <div class="row-actions"><button class="btn primary small" data-act="perm-ask">Permitir</button></div></div>`;
}

/** True while this phone doesn't know who uses it: the app then shows the onboarding instead of any screen. */
export const needsMe = () => !(me() && I.traveler[me()]);

/** First run: pick who uses this phone. Every screen waits for this (see route() in main.js). */
export function onboarding(_, ctx) {
  ctx.title = 'Bienvenida';
  const initials = (t) => esc(t.name.trim().slice(0, 2).toUpperCase());
  return `<section class="onboard">
    <h1>¿Quién usa este celular?</h1>
    <p class="muted">Así la app te muestra tus tareas, comparte tu ubicación con el grupo (si la activás) y sabe de quién son los gastos que cargás.</p>
    <ul class="onboard-list">${D.travelers.map((t) => `<li><button class="onboard-pick" data-act="set-me" data-id="${esc(t.id)}">
      <span class="who big" style="--c:${esc(t.color || '#888')}">${initials(t)}</span><b>${esc(t.name)}</b><em>${ic('chevron-right')}</em></button></li>`).join('')}</ul>
    <p class="hint">Queda guardado solo en este celular. Lo podés cambiar después en Más → Viajeros.</p>
  </section>`;
}

/** Everything still missing on this phone (permissions). Shown in "Más", never on the home screen. */
export async function pendingSetup() {
  const items = [];
  const loc = await permissionState();
  if (loc === 'denied') items.push({ ic: 'location-dot', title: 'Ubicación bloqueada', text: 'Habilitala en los permisos del sitio del navegador para ver lugares cercanos y compartir dónde estás.' });
  else if (loc !== 'granted') items.push({ ic: 'location-dot', title: 'Ubicación', text: 'Para ordenar lugares por cercanía y mostrarle al grupo dónde estás (solo si lo activás).',
    actions: '<button class="btn small primary" data-act="perm-ask">Permitir</button>' });
  if (!syncConfigured()) items.push({ ic: 'arrows-rotate', title: 'Sincronizar con el grupo', text: 'Sin el código del grupo no ves lo que cargan los demás: tiempos del Juego del día, tareas, gastos, ubicaciones.',
    actions: '<a class="btn small primary" href="#/viajeros#sync">Activar</a>' });
  if (syncConfigured() && 'Notification' in window && Notification.permission === 'default') {
    items.push({ ic: 'bell', title: 'Avisos', text: 'Para enterarte cuando alguien del grupo te asigna una tarea.',
      actions: '<button class="btn small primary" data-act="notif-ask">Permitir</button>' });
  }
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) {
      items.push({ ic: 'floppy-disk', title: 'Guardado permanente', text: 'Evita que el navegador borre fotos y documentos si falta espacio.',
        actions: '<button class="btn small primary" data-act="persist-ask">Activar</button>' });
    }
  } catch { /* not supported */ }
  return items;
}

export async function setupCard(el) {
  if (!el) return;
  const items = await pendingSetup();
  el.innerHTML = items.length ? `<section class="card"><h3>${ic('wrench')} Falta configurar</h3><ul class="setup">${items.map((it) => `<li><span class="o-ic">${ic(it.ic)}</span>
    <div><b>${esc(it.title)}</b><small>${esc(it.text)}</small></div>${it.actions ? `<span class="setup-act">${it.actions}</span>` : ''}</li>`).join('')}</ul></section>` : '';
}

function syncStatus() {
  if (!syncConfigured()) return 'Sin configurar: todo queda en este celular.';
  if (syncState.running) return 'Sincronizando…';
  if (syncState.error) return `Error: ${syncState.error}`;
  return syncState.lastOk ? `Sincronizado ${ago(Date.now() - syncState.lastOk)}` : 'Configurado.';
}

export function render(_, ctx) {
  ctx.title = 'Viajeros';
  const mine = me(), sharing = settings.get('shareLocation', false);
  const myPos = gps.pos;
  ctx.after(() => permBanner(document.getElementById('perm')));
  ctx.after(paintAttachments);
  ctx.cleanup(freeUrls);
  ctx.cleanup(bus.on('sync', () => { const el = document.getElementById('sync-status'); if (el) el.textContent = syncStatus(); }));
  const rows = D.travelers.map((t) => {
    const pos = t.id === mine ? (myPos ? { ...myPos, updatedAt: Date.now() } : null) : cols.map('positions')[t.id];
    const dist = pos && myPos && t.id !== mine ? ` · a ${fmtDist(haversine([myPos.lat, myPos.lon], [pos.lat, pos.lon]))}` : '';
    const where = pos && !pos.deleted ? `${t.id === mine ? 'Tu ubicación actual' : `Ubicación ${ago(Date.now() - pos.updatedAt)}`}${dist}` : 'Sin ubicación';
    return `<li><span class="who big" style="--c:${esc(t.color || '#888')}">${esc(t.name.trim().slice(0, 2).toUpperCase())}</span>
      <div><b>${esc(t.name)}${t.id === mine ? ' (vos)' : ''}</b><small>${esc(where)}</small></div>
      ${pos && !pos.deleted && t.id !== mine ? `<a class="btn tiny" href="#/mapa?person=${esc(t.id)}">Mapa</a>` : ''}</li>`;
  }).join('');

  return `<header class="pagehead"><h1>${ic('users')} Viajeros</h1></header>
  <div id="perm"></div>
  <section class="card" id="quien"><h3>¿Quién sos en este celular?</h3>
    <select data-change="set-me-select" aria-label="Quién sos"><option value="">— Elegí —</option>${D.travelers.map((t) => `<option value="${esc(t.id)}" ${t.id === mine ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></section>

  <section class="card"><h3>${ic('location-dot')} Dónde está cada uno</h3>
    ${mapBox(ctx, 'peoplemap', (m) => {
      const draw = () => { m.setItems(personItems()); const pts = personItems().map((p) => [p.pos.lat, p.pos.lon]); if (gps.pos) pts.push([gps.pos.lat, gps.pos.lon]); if (pts.length) m.fit(pts); };
      draw(); ctx.cleanup(bus.on('positions', draw)); ctx.cleanup(onPosition(() => {}));
    }, 'map-people')}
    <ul class="people">${rows}</ul></section>

  <h2 class="grp">${ic('passport')} Pasaportes</h2>
  ${passportCards()}

  <section class="card"><h3>${ic('tower-broadcast')} Compartir mi ubicación</h3>
    <label class="check"><input type="checkbox" data-change="share-toggle" ${sharing ? 'checked' : ''} ${mine ? '' : 'disabled'}><span>Compartir mi ubicación con el grupo (se actualiza cada ~2 min mientras la app está abierta)</span></label>
    ${mine ? '' : '<p class="hint">Primero elegí quién sos.</p>'}
    <p class="hint">${syncConfigured() ? 'Se envía cifrada al grupo por la sincronización.' : 'Sin sincronización configurada, la ubicación solo llega a los demás si les mandás el link.'}</p>
    <div class="row-actions"><button class="btn small" data-act="share-link" ${mine ? '' : 'disabled'}>${ic('share-from-square')} Mandar mi ubicación por link</button></div></section>

  <section class="card" id="sync"><h3>${ic('arrows-rotate')} Sincronizar con el grupo</h3>
    <p class="hint">Opcional. Con un <b>relay</b> (servidor mínimo incluido en <code>server/relay.mjs</code>) los celulares comparten tareas, lugares, gastos, viajeros y ubicaciones. Los datos viajan <b>cifrados</b> con el código del grupo: el servidor no puede leerlos. Todos tienen que usar el mismo código.</p>
    <form class="form" data-submit="sync-save">
      <label class="field">URL del relay<input name="relayUrl" type="url" placeholder="https://mi-relay.example.com" value="${esc(settings.get('relayUrl', '') || defaultRelayUrl())}"></label>
      <label class="field">Código del grupo (secreto)<input name="groupCode" autocomplete="off" spellcheck="false" placeholder="una frase larga que compartan" value="${esc(settings.get('groupCode', ''))}"></label>
      <div class="row-actions"><button class="btn primary" type="submit">Guardar y sincronizar</button><button class="btn" type="button" data-act="sync-now">Sincronizar ahora</button></div>
    </form>
    <p class="hint" id="sync-status">${esc(syncStatus())}</p>
    <h4>Sin servidor</h4>
    <p class="hint">Exportá un archivo con todo lo cargado en la app (tareas, lugares, gastos, viajeros…) y que el resto lo importe.</p>
    <div class="row-actions"><button class="btn small" data-act="share-export">${ic('file-export')} Exportar datos</button>
      <label class="btn small">${ic('file-import')} Importar datos<input type="file" accept="application/json,.json" hidden data-change="share-import"></label></div></section>`;
}

register({
  'set-me': (el, _, app) => { settings.set('me', el.dataset.id); toast(`Hola, ${I.traveler[el.dataset.id].name}`); app.rerender(); },
  'set-me-select': (el, _, app) => { settings.set('me', el.value || null); app.rerender(); },
  'perm-ask': async (_, __, app) => {
    try { await currentPosition(); startGps(); toast('Ubicación activada'); } catch (e) { toast(e.code === 1 ? 'Permiso denegado' : 'No se pudo obtener la ubicación'); }
    settings.set('permAsked', 'asked'); app.rerender();
  },
  'notif-ask': async (_, __, app) => { try { await Notification.requestPermission(); } catch { /* ignore */ } app.rerender(); },
  'persist-ask': async (_, __, app) => {
    const ok = await navigator.storage?.persist?.().catch(() => false);
    toast(ok ? 'Listo: los datos quedan guardados' : 'El navegador no lo permitió. Instalá la app en la pantalla de inicio y probá de nuevo.');
    app.rerender();
  },
  'share-toggle': async (el, _, app) => {
    settings.set('shareLocation', el.checked);
    if (el.checked) {
      try { const p = await currentPosition(); startGps(); shareMyPosition(p, { force: true }); syncNow(); toast('Compartiendo tu ubicación'); }
      catch { toast('Necesito permiso de ubicación'); settings.set('shareLocation', false); app.rerender(); }
    } else {
      cols.del('positions', me()); syncNow(); toast('Dejaste de compartir tu ubicación');
    }
  },
  'share-link': async () => {
    let p = gps.pos;
    try { p = p || await currentPosition(); } catch { return toast('Necesito permiso de ubicación'); }
    const link = locationLink(p);
    const text = `${I.traveler[me()]?.name || 'Yo'} está acá (abrilo con la app del viaje): ${link}`;
    if (navigator.share) { try { await navigator.share({ title: 'Mi ubicación', text, url: link }); return; } catch { /* cancelled */ } }
    copyText(link);
  },
  'sync-save': (form) => {
    const f = new FormData(form);
    settings.set('relayUrl', (f.get('relayUrl') || '').trim()); settings.set('groupCode', (f.get('groupCode') || '').trim());
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => null);
    if (!syncConfigured()) return toast('Guardado: sin URL o código no se sincroniza');
    syncNow().then(() => toast(syncState.error ? `No se pudo sincronizar: ${syncState.error}` : 'Sincronizado'));
  },
  'sync-now': () => syncNow().then(() => toast(syncState.error ? `Error: ${syncState.error}` : syncConfigured() ? 'Sincronizado' : 'Configurá el relay primero')),
  'share-export': () => exportShared(),
  'share-import': async (el, _, app) => {
    const file = el.files[0]; el.value = '';
    if (!file) return;
    try { await importShared(file); app.rerender(); } catch (e) { toast(e.message || 'Archivo inválido'); }
  },
});
