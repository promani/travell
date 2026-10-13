// Admin API + AI from the app. Only on a phone that has the ADMIN_API_KEY (Ajustes → Administración): that key is
// what the server checks before changing the trip data or calling the AI. See server/tripdata.mjs and server/ai.mjs.
import { settings, loadData } from './store.js';
import { relayBase } from './sync.js';

export const adminKey = () => (settings.get('adminKey', '') || '').trim();
export const isAdmin = () => !!adminKey();
const base = () => relayBase() || location.origin;

export async function adminFetch(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${base()}${path}`, {
    method, cache: 'no-store',
    headers: { authorization: `Bearer ${adminKey()}`, ...(body && { 'content-type': 'application/json' }) },
    body: body && JSON.stringify(body),
  });
  let out = null;
  try { out = await res.json(); } catch { /* empty */ }
  if (!res.ok) { const e = new Error(out?.error || `HTTP ${res.status}`); e.status = res.status; e.index = out?.index; throw e; }
  return out;
}

/** Applies a batch of changes to the trip (all or nothing) and reloads the data. */
export async function applyChanges(changes, { note = '', by = '' } = {}) {
  const out = await adminFetch('/v1/admin/changes', { method: 'POST', body: { changes, note, by } });
  await reloadTrip(out.rev);
  return out;
}

// ------------------------------------------------------------------ keeping the trip data fresh
// The server bumps a revision whenever the admin changes something; every phone checks it and reloads the data.
let knownRev = null;
const listeners = new Set();
export const onTripReload = (fn) => (listeners.add(fn), () => listeners.delete(fn));

export async function reloadTrip(rev = null) {
  await loadData();
  if (rev != null) knownRev = rev;
  listeners.forEach((f) => f());
}

export async function checkTripRev() {
  if (!navigator.onLine) return;
  try {
    const res = await fetch(`${base()}/v1/trip/rev`, { cache: 'no-store' });
    if (!res.ok) return;
    const { rev } = await res.json();
    if (knownRev === null) knownRev = rev;
    else if (rev !== knownRev) await reloadTrip(rev);
  } catch { /* offline or no server: keep what we have */ }
}

export const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] || '');
  r.onerror = () => reject(r.error);
  r.readAsDataURL(file);
});
