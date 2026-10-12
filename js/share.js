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
