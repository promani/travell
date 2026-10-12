// Travelers: who am I, location permission & sharing, where the others are, the travelers ABM, and group sync settings.
import { D, I, cols, me, settings, bus } from '../store.js';
import { esc, toast, copyText, fmtDist, haversine } from '../util.js';
import { register, mapBox } from '../ui.js';
import { gps, startGps, currentPosition, permissionState, onPosition } from '../geo.js';
import { ago } from '../map.js';
import { syncNow, syncState, syncConfigured, shareMyPosition, locationLink, otherPositions, defaultRelayUrl } from '../sync.js';
import { exportShared, importShared } from '../share.js';

export function personItems() {
  return otherPositions().map((pos) => ({ kind: 'person', traveler: I.traveler[pos.id], pos }));
}

export async function permBanner(el) {
  if (!el) return;
  const st = await permissionState();
  if (st === 'granted' || settings.get('permAsked') === 'dismissed') { el.innerHTML = ''; return; }
  el.innerHTML = st === 'denied'
    ? `<div class="note warn"><b>📍 La ubicación está bloqueada</b><p>Habilitala en los permisos del sitio del navegador para ver lugares cercanos y compartir dónde estás.</p></div>`
    : `<div class="note perm"><b>📍 Activá tu ubicación</b><p>Para ordenar los lugares por cercanía, cargar lugares desde donde estás y mostrarle al grupo dónde estás (solo si lo activás).</p>
       <div class="row-actions"><button class="btn primary small" data-act="perm-ask">Permitir ubicación</button><button class="btn small" data-act="perm-dismiss">Ahora no</button></div></div>`;
}

export function whoAmICard() {
  if (me() && I.traveler[me()]) return '';
  return `<section class="card"><h3>👋 ¿Quién usa este celular?</h3><p class="hint">Sirve para tus tareas, para compartir tu ubicación y para sincronizar con el grupo.</p>
    <div class="row-actions">${D.travelers.map((t) => `<button class="btn" data-act="set-me" data-id="${esc(t.id)}"><span class="dot" style="--c:${esc(t.color)}"></span>${esc(t.name)}</button>`).join('')}
    <button class="btn" data-act="traveler-new">＋ Otro</button></div></section>`;
}

function syncStatus() {
  if (!syncConfigured()) return 'Sin configurar: todo queda en este celular.';
  if (syncState.running) return 'Sincronizando…';
  if (syncState.error) return `⚠️ Error: ${syncState.error}`;
  return syncState.lastOk ? `✔ Sincronizado ${ago(Date.now() - syncState.lastOk)}` : 'Configurado.';
}

export function render(_, ctx) {
  ctx.title = 'Viajeros';
  const mine = me(), sharing = settings.get('shareLocation', false);
  const myPos = gps.pos;
  ctx.after(() => permBanner(document.getElementById('perm')));
  ctx.cleanup(bus.on('sync', () => { const el = document.getElementById('sync-status'); if (el) el.textContent = syncStatus(); }));
  const rows = D.travelers.map((t) => {
    const pos = t.id === mine ? (myPos ? { ...myPos, updatedAt: Date.now() } : null) : cols.map('positions')[t.id];
    const dist = pos && myPos && t.id !== mine ? ` · a ${fmtDist(haversine([myPos.lat, myPos.lon], [pos.lat, pos.lon]))}` : '';
    const where = pos && !pos.deleted ? `${t.id === mine ? 'Tu ubicación actual' : `Ubicación ${ago(Date.now() - pos.updatedAt)}`}${dist}` : 'Sin ubicación';
    return `<li><span class="who big" style="--c:${esc(t.color || '#888')}">${esc(t.name.trim().slice(0, 2).toUpperCase())}</span>
      <div><b>${esc(t.name)}${t.id === mine ? ' (vos)' : ''}</b><small>${esc(where)}</small></div>
      ${pos && !pos.deleted && t.id !== mine ? `<a class="btn tiny" href="#/mapa?person=${esc(t.id)}">Mapa</a>` : ''}
      <a class="btn tiny" href="#/pasaportes" title="Pasaporte">🛂</a>
      <button class="btn tiny" data-act="traveler-edit" data-id="${esc(t.id)}">Editar</button></li>`;
  }).join('');

  return `<header class="pagehead"><h1>👥 Viajeros</h1></header>
  <div id="perm"></div>
  <section class="card"><h3>¿Quién sos en este celular?</h3>
    <select data-change="set-me-select" aria-label="Quién sos"><option value="">— Elegí —</option>${D.travelers.map((t) => `<option value="${esc(t.id)}" ${t.id === mine ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></section>

  <section class="card"><h3>📍 Dónde está cada uno</h3>
    ${mapBox(ctx, 'peoplemap', (m) => {
      const draw = () => { m.setItems(personItems()); const pts = personItems().map((p) => [p.pos.lat, p.pos.lon]); if (gps.pos) pts.push([gps.pos.lat, gps.pos.lon]); if (pts.length) m.fit(pts); };
      draw(); ctx.cleanup(bus.on('positions', draw)); ctx.cleanup(onPosition(() => {}));
    }, 'map-people')}
    <ul class="people">${rows}</ul>
    <div class="row-actions"><button class="btn small" data-act="traveler-new">＋ Agregar viajero</button></div></section>

  <section class="card"><h3>📡 Compartir mi ubicación</h3>
    <label class="check"><input type="checkbox" data-change="share-toggle" ${sharing ? 'checked' : ''} ${mine ? '' : 'disabled'}><span>Compartir mi ubicación con el grupo (se actualiza cada ~2 min mientras la app está abierta)</span></label>
    ${mine ? '' : '<p class="hint">Primero elegí quién sos.</p>'}
    <p class="hint">${syncConfigured() ? 'Se envía cifrada al grupo por la sincronización.' : 'Sin sincronización configurada, la ubicación solo llega a los demás si les mandás el link.'}</p>
    <div class="row-actions"><button class="btn small" data-act="share-link" ${mine ? '' : 'disabled'}>📤 Mandar mi ubicación por link</button></div></section>

  <section class="card"><h3>🔄 Sincronizar con el grupo</h3>
    <p class="hint">Opcional. Con un <b>relay</b> (servidor mínimo incluido en <code>server/relay.mjs</code>) los celulares comparten tareas, lugares, gastos, viajeros y ubicaciones. Los datos viajan <b>cifrados</b> con el código del grupo: el servidor no puede leerlos. Todos tienen que usar el mismo código.</p>
    <form class="form" data-submit="sync-save">
      <label class="field">URL del relay<input name="relayUrl" type="url" placeholder="https://mi-relay.example.com" value="${esc(settings.get('relayUrl', '') || defaultRelayUrl())}"></label>
      <label class="field">Código del grupo (secreto)<input name="groupCode" autocomplete="off" spellcheck="false" placeholder="una frase larga que compartan" value="${esc(settings.get('groupCode', ''))}"></label>
      <div class="row-actions"><button class="btn primary" type="submit">Guardar y sincronizar</button><button class="btn" type="button" data-act="sync-now">Sincronizar ahora</button></div>
    </form>
    <p class="hint" id="sync-status">${esc(syncStatus())}</p>
    <h4>Sin servidor</h4>
    <p class="hint">Exportá un archivo con todo lo cargado en la app (tareas, lugares, gastos, viajeros…) y que el resto lo importe.</p>
    <div class="row-actions"><button class="btn small" data-act="share-export">⬆ Exportar datos</button>
      <label class="btn small">⬇ Importar datos<input type="file" accept="application/json,.json" hidden data-change="share-import"></label></div></section>`;
}

register({
  'set-me': (el, _, app) => { settings.set('me', el.dataset.id); toast(`Hola, ${I.traveler[el.dataset.id].name}`); app.rerender(); },
  'set-me-select': (el, _, app) => { settings.set('me', el.value || null); app.rerender(); },
  'perm-ask': async (_, __, app) => {
    try { await currentPosition(); startGps(); toast('Ubicación activada'); } catch (e) { toast(e.code === 1 ? 'Permiso denegado' : 'No se pudo obtener la ubicación'); }
    settings.set('permAsked', 'asked'); app.rerender();
  },
  'perm-dismiss': (el) => { settings.set('permAsked', 'dismissed'); el.closest('.note')?.remove(); },
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
