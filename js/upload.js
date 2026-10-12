// Uploads every photo and attached file to R2 through the relay (PUT /v1/files/...), unencrypted.
// The local IndexedDB copy stays the one the app shows, so everything keeps working offline; this is the cloud copy.
// A record is uploaded once: on success it gets `remote: { key, at }`. Whatever is still missing is retried when the
// app starts, comes back to the foreground, recovers the connection, or right after adding files.
import { BASE, idb, kv, bus } from './store.js';
import { relayBase } from './sync.js';

const STORES = { photoFull: 'photos', files: 'files' };   // IndexedDB store -> folder in the bucket
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf' };
const RETRY_MS = 60000;

export const uploads = { pending: 0, done: 0, running: false, error: null };
let timer = null;

const rand = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
const fileUrl = (key) => `${relayBase()}/v1/files/${key}`;

/** Remote key: <trip>/<photos|files>/<local id>-<128 random bits>.<ext>. The random part makes the URL unguessable. */
function remoteKey(store, rec) {
  const type = rec.blob?.type || rec.type || '';
  return `${BASE.trip.id}/${STORES[store]}/${rec.id.replace(/[^A-Za-z0-9_-]/g, '')}-${rand()}.${EXT[type] || 'bin'}`;
}
const contentType = (blob, ext) => (ext === 'bin' ? 'application/octet-stream' : blob.type);

async function counts() {
  let pending = 0, done = 0;
  for (const s of Object.keys(STORES)) for (const r of await idb.all(s)) r.remote ? done++ : pending++;
  Object.assign(uploads, { pending, done });
  bus.emit('uploads', uploads);
}

async function uploadOne(store, rec) {
  const key = remoteKey(store, rec);
  const res = await fetch(fileUrl(key), { method: 'PUT', headers: { 'content-type': contentType(rec.blob, key.split('.').pop()) }, body: rec.blob });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const cur = await idb.get(store, rec.id);
  if (cur) await idb.put(store, { ...cur, remote: { key, at: Date.now() } });
  else removeRemote({ remote: { key } });                  // deleted locally while uploading
}

/** Uploads everything that is not in R2 yet, one file at a time. Safe to call often. */
export async function uploadPending() {
  clearTimeout(timer);
  if (uploads.running || !relayBase() || !navigator.onLine) return;
  uploads.running = true; uploads.error = null;
  try {
    await flushDeletes();
    for (const store of Object.keys(STORES)) {
      for (const rec of await idb.all(store)) {
        if (rec.remote || !rec.blob) continue;
        await uploadOne(store, rec);
        await counts();
      }
    }
  } catch (e) {
    uploads.error = e.message;
    timer = setTimeout(uploadPending, RETRY_MS);
  } finally {
    uploads.running = false;
    await counts().catch(() => null);
  }
}
export const uploadSoon = () => { clearTimeout(timer); timer = setTimeout(uploadPending, 1500); };

/** Deletes the cloud copy of a record that was removed locally; if offline, it is retried later. */
export function removeRemote(rec) {
  if (!rec?.remote?.key) return;
  kv.set('r2:deletes', [...new Set([...kv.get('r2:deletes', []), rec.remote.key])]);
  flushDeletes().catch(() => null);
}
async function flushDeletes() {
  if (!relayBase() || !navigator.onLine) return;
  for (const key of kv.get('r2:deletes', [])) {
    const res = await fetch(fileUrl(key), { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    kv.set('r2:deletes', kv.get('r2:deletes', []).filter((k) => k !== key));
  }
}

export function startUploads() {
  uploadPending();
  window.addEventListener('online', () => uploadPending());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') uploadPending(); });
}
