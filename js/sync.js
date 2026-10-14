// Optional group sync through a tiny relay (server/relay.mjs).
// Records are encrypted on the device with a key derived from the group code; the relay only stores ciphertext.
// Without a relay everything keeps working locally; sharing falls back to links and export/import files.
import { BASE, cols, kv, settings, me, bus, rebuild, EDITABLE, LOCAL_ONLY, I } from './store.js';
import { onPosition, startGps } from './geo.js';
import { haversine, toast } from './util.js';

export const SYNCED = [...EDITABLE, ...LOCAL_ONLY];
export const syncState = { lastOk: null, error: null, running: false };

const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
/** trip.json → sync.relayUrl: "same-origin" when the app is served by server/relay.mjs (e.g. the Docker image). */
export const defaultRelayUrl = () => { const u = BASE.trip?.sync?.relayUrl; return u === 'same-origin' ? location.origin : (u || ''); };
const cfg = () => ({ url: (settings.get('relayUrl', '') || defaultRelayUrl()).trim().replace(/\/+$/, ''), code: (settings.get('groupCode', '') || '').trim() });
export const relayBase = () => cfg().url;

export const syncConfigured = () => { const c = cfg(); return !!(c.url && c.code); };

let keyCache = { code: null, p: null };
function groupKey(code) {
  if (keyCache.code !== code) {
    keyCache = {
      code, p: (async () => {
        const salt = enc.encode('travell:' + BASE.trip.id);
        const raw = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveKey']);
        const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, raw,
          { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
        const h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(`travell-group:${BASE.trip.id}:${code}`)));
        const gid = [...h.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
        return { key, gid };
      })(),
    };
  }
  return keyCache.p;
}
async function seal(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj))));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return b64(out);
}
async function unseal(key, s) {
  const u = unb64(s);
  return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, key, u.slice(12))));
}

let running = null;
export function syncNow() {
  if (!syncConfigured() || !navigator.onLine || !crypto?.subtle) return Promise.resolve();
  if (running) return running;
  syncState.running = true; bus.emit('sync');
  running = (async () => {
    const { url, code } = cfg();
    const { key, gid } = await groupKey(code);
    const api = `${url}/v1/${gid}/records`;
    const pushedKey = 'sync:pushed:' + gid, cursorKey = 'sync:cursor:' + gid;
    const pushed = kv.get(pushedKey, {});

    // push what changed locally
    const out = [];
    for (const c of SYNCED) for (const r of cols.list(c)) if ((pushed[`${c}/${r.id}`] || 0) < (r.updatedAt || 0)) out.push({ c, r });
    for (let i = 0; i < out.length; i += 100) {
      const chunk = out.slice(i, i + 100);
      const records = await Promise.all(chunk.map(async ({ c, r }) => ({ c, id: String(r.id), u: r.updatedAt, d: await seal(key, r) })));
      const res = await fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ records }) });
      if (!res.ok) throw new Error(`relay ${res.status}`);
      chunk.forEach(({ c, r }) => { pushed[`${c}/${r.id}`] = r.updatedAt; });
      kv.set(pushedKey, pushed);
    }

    // pull what others changed
    let since = kv.get(cursorKey, 0);
    const changed = {};
    for (let guard = 0; guard < 50; guard++) {
      const res = await fetch(`${api}?since=${since}`);
      if (!res.ok) throw new Error(`relay ${res.status}`);
      const body = await res.json();
      const byCol = {};
      for (const rec of body.records || []) {
        if (!SYNCED.includes(rec.c)) continue;
        try { (byCol[rec.c] ||= []).push(await unseal(key, rec.d)); } catch { /* other group / corrupt: ignore */ }
      }
      for (const [c, recs] of Object.entries(byCol)) {
        const ch = cols.merge(c, recs);
        ch.forEach((r) => { pushed[`${c}/${r.id}`] = r.updatedAt; });
        if (ch.length) (changed[c] ||= []).push(...ch);
      }
      since = body.seq ?? since;
      if (!body.more) break;
    }
    kv.set(cursorKey, since); kv.set(pushedKey, pushed);

    if (Object.keys(changed).some((c) => EDITABLE.includes(c))) rebuild();
    if (changed.positions) bus.emit('positions');
    notifyAssignments(changed.tasks || []);
    if (Object.keys(changed).length) bus.emit('remote-change', Object.keys(changed));
    syncState.lastOk = Date.now(); syncState.error = null;
  })().catch((e) => { syncState.error = e.message || String(e); })
    .finally(() => { running = null; syncState.running = false; bus.emit('sync'); });
  return running;
}

function notifyAssignments(tasks) {
  const mine = tasks.filter((t) => !t.deleted && t.assignee && t.assignee === me() && t.by && t.by !== me() && t.status !== 'hecho');
  for (const t of mine) {
    const msg = `${I.traveler[t.by]?.name || 'Alguien'} te asignó: ${t.title}`;
    toast(msg, 5000);
    if ('Notification' in window && Notification.permission === 'granted') {
      navigator.serviceWorker?.getRegistration().then((r) => r?.showNotification('Nueva tarea', { body: msg, tag: 'task-' + t.id, icon: 'icons/icon-192.png' })).catch(() => null);
    }
  }
}

// ------------------------------------------------------------------ my position
export function shareMyPosition(pos, { force = false } = {}) {
  const id = me();
  if (!id || !pos) return false;
  const last = cols.map('positions')[id];
  if (!force && last && Date.now() - last.updatedAt < 120000 && haversine([last.lat, last.lon], [pos.lat, pos.lon]) < 50) return false;
  cols.put('positions', { id, lat: +pos.lat.toFixed(6), lon: +pos.lon.toFixed(6), acc: Math.round(pos.acc || 0) });
  bus.emit('positions');
  return true;
}

/** Link that, opened on another phone with this app, records where I am (no server needed). */
export function locationLink(pos) {
  const u = new URL(location.href);
  u.hash = `#/ubicacion?t=${encodeURIComponent(me())}&lat=${pos.lat.toFixed(5)}&lon=${pos.lon.toFixed(5)}&ts=${Date.now()}`;
  return u.toString();
}

export function otherPositions() {
  return cols.live('positions').filter((p) => p.id !== me() && I.traveler[p.id] && Number.isFinite(p.lat));
}

let debounce;
export function startSync() {
  onPosition((pos) => { if (pos && settings.get('shareLocation', false)) shareMyPosition(pos); });
  if (settings.get('shareLocation', false)) startGps();
  bus.on('local-change', () => { clearTimeout(debounce); debounce = setTimeout(syncNow, 2500); });
  window.addEventListener('online', () => syncNow());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 60000);
  syncNow();
}
