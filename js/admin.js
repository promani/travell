// Trip data changed on the server (admin API, ADMIN_API_KEY: only from outside the app) reaches every phone here:
// the server bumps a revision on each change and the app reloads the data when it sees a new one.
import { loadData } from './store.js';
import { relayBase } from './sync.js';

const base = () => relayBase() || location.origin;

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
