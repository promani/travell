// Share everything created in the app as a file (no server needed): export, and import that merges by id (newest wins).
import { D, cols, rebuild, bus, EDITABLE } from './store.js';
import { download, toast } from './util.js';
import { SYNCED } from './sync.js';

export async function exportShared(only = null) {
  const names = only || SYNCED;
  const collections = Object.fromEntries(names.map((n) => [n, cols.list(n)]));
  const data = { app: 'travell', version: 2, tripId: D.trip.id, exportedAt: new Date().toISOString(), collections };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const file = new File([blob], `travell-${D.trip.id}-${only ? only.join('-') : 'datos'}.json`, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Datos del viaje' }); return; } catch { /* cancelled */ } }
  download(file.name, blob);
}

export async function importShared(file) {
  const data = JSON.parse(await file.text());
  if (data.tripId !== D.trip.id) throw new Error('El archivo es de otro viaje');
  const collections = data.collections || (Array.isArray(data.expenses) ? { expenses: data.expenses } : null);   // v1 files only had expenses
  if (!collections) throw new Error('Archivo inválido');
  let n = 0;
  for (const [name, recs] of Object.entries(collections)) {
    if (!SYNCED.includes(name) || !Array.isArray(recs)) continue;
    n += cols.merge(name, recs.map((r) => ({ ...r, updatedAt: r.updatedAt || r.createdAt || 1 }))).length;
  }
  rebuild(); bus.emit('positions'); bus.emit('local-change', 'import');
  toast(`Importado: ${n} registro${n === 1 ? '' : 's'} nuevo${n === 1 ? '' : 's'} o actualizado${n === 1 ? '' : 's'}`);
  return n;
}

/** Records created/edited in the app, in the same shape as the JSON files (to paste them into data/). */
export function exportAsJsonFile(name) {
  const recs = cols.live(name).map(({ updatedAt, by, edited, file, ...r }) => r);
  download(`${name}-app.json`, new Blob([JSON.stringify(recs, null, 2) + '\n'], { type: 'application/json' }));
}
export { EDITABLE };

// ------------------------------------------------------------------ full backup (everything on this device, photos included)
import { idb, BASE } from './store.js';

const toDataURL = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
const fromDataURL = async (s) => (await fetch(s)).blob();
const prefix = () => `travell:${BASE.trip.id}:`;

export async function exportBackup(onProgress) {
  const kv = {};
  for (const k of Object.keys(localStorage)) if (k.startsWith(prefix())) kv[k.slice(prefix().length)] = localStorage.getItem(k);
  const stores = {};
  for (const s of ['photos', 'photoFull', 'files']) {
    let rows = [];
    try { rows = await idb.all(s); } catch { /* no IndexedDB */ }
    stores[s] = [];
    for (const r of rows) {
      const o = { ...r };
      for (const f of ['blob', 'thumb']) if (o[f] instanceof Blob) o[f] = { dataURL: await toDataURL(o[f]) };
      stores[s].push(o);
      onProgress?.(s, stores[s].length, rows.length);
    }
  }
  const data = { app: 'travell', kind: 'backup', version: 2, tripId: BASE.trip.id, exportedAt: new Date().toISOString(), kv, stores };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const name = `travell-respaldo-${BASE.trip.id}-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Respaldo del viaje' }); return blob.size; } catch { /* cancelled: download instead */ } }
  download(name, blob);
  return blob.size;
}

/** Merges a backup into this device: records by id (newest wins), marks and codes added, photos/files added. Local settings win. */
export async function importBackup(file) {
  const data = JSON.parse(await file.text());
  if (data.kind !== 'backup' || data.tripId !== BASE.trip.id) throw new Error('No es un respaldo de este viaje');
  const P = prefix();
  for (const [k, raw] of Object.entries(data.kv || {})) {
    let v; try { v = JSON.parse(raw); } catch { continue; }
    if (k.startsWith('col:')) { cols.merge(k.slice(4), Object.values(v || {})); continue; }
    if (k.startsWith('sync:')) continue;                         // cursors belong to each device
    const cur = (() => { try { return JSON.parse(localStorage.getItem(P + k)); } catch { return null; } })();
    const merged = k === 'settings' ? { ...v, ...(cur || {}) } : (v && typeof v === 'object' && !Array.isArray(v) ? { ...(cur || {}), ...v } : v);
    localStorage.setItem(P + k, JSON.stringify(merged));
  }
  let n = 0;
  for (const [s, rows] of Object.entries(data.stores || {})) {
    for (const r of rows || []) {
      const o = { ...r };
      for (const f of ['blob', 'thumb']) if (o[f]?.dataURL) o[f] = await fromDataURL(o[f].dataURL);
      await idb.put(s, o); if (s !== 'photoFull') n++;
    }
  }
  rebuild(); bus.emit('positions'); bus.emit('local-change', 'backup');
  return n;
}
