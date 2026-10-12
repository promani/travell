// Data loading (static JSON), per-trip local state (localStorage), blobs (IndexedDB) and the app clock.
import { setLocale } from './util.js';

const params = new URLSearchParams(location.search);
/** Folder with the trip's JSON files. `?data=trips/japon` loads another trip. */
export const DATA_BASE = (params.get('data') || 'data').replace(/\/$/, '');

const REQUIRED = ['trip', 'itinerary'];
const OPTIONAL = ['transport', 'lodging', 'places', 'documents', 'travelers', 'tasks', 'notes', 'links'];

export const D = { trip: null, days: [], transport: [], lodging: [], places: [], documents: [], travelers: [], tasks: [], notes: [], links: [] };
export const I = { day: {}, dayByDate: {}, place: {}, lodging: {}, transport: {}, doc: {}, traveler: {}, city: {}, activity: {}, activityDay: {} };

async function getJSON(name, required) {
  try {
    const r = await fetch(`${DATA_BASE}/${name}.json`);
    if (!r.ok) throw new Error(`${name}.json: HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    if (required) throw e;
    return null;
  }
}

export async function loadData() {
  const [req, opt] = await Promise.all([
    Promise.all(REQUIRED.map((n) => getJSON(n, true))),
    Promise.all(OPTIONAL.map((n) => getJSON(n, false)))]);
  D.trip = req[0];
  D.days = req[1].days;
  OPTIONAL.forEach((n, i) => { D[n] = opt[i] || []; });
  setLocale(D.trip.locale);

  D.days.sort((a, b) => a.date.localeCompare(b.date));
  D.days.forEach((d) => {
    I.day[d.id] = d; I.dayByDate[d.date] = d;
    d.activities.forEach((a) => { a.dayId = d.id; I.activity[a.id] = a; });
  });
  D.places.forEach((p) => { I.place[p.id] = p; });
  D.lodging.forEach((l) => { I.lodging[l.id] = l; });
  D.transport.forEach((t) => { I.transport[t.id] = t; });
  D.documents.forEach((x) => { I.doc[x.id] = x; });
  D.travelers.forEach((t) => { I.traveler[t.id] = t; });
  D.trip.cities.forEach((c) => { I.city[c.id] = c; });
}

// ------------------------------------------------------------------ event bus
const handlers = {};
export const bus = {
  on(ev, fn) { (handlers[ev] ||= new Set()).add(fn); return () => handlers[ev].delete(fn); },
  emit(ev, data) { handlers[ev]?.forEach((f) => f(data)); },
};

// ------------------------------------------------------------------ key/value (localStorage), namespaced per trip
const ns = () => `travell:${D.trip.id}:`;
export const kv = {
  get(key, def) {
    try { const v = localStorage.getItem(ns() + key); return v == null ? def : JSON.parse(v); } catch { return def; }
  },
  set(key, val) {
    try { localStorage.setItem(ns() + key, JSON.stringify(val)); return true; } catch { return false; }
  },
};

export const settings = {
  get(key, def) { return kv.get('settings', {})[key] ?? def; },
  set(key, val) {
    const s = kv.get('settings', {}); s[key] = val; kv.set('settings', s); bus.emit('settings', key);
  },
};

// ------------------------------------------------------------------ clock (with a "simulate date" option for testing)
export function now() {
  const off = settings.get('simOffset', 0);
  return new Date(Date.now() + off);
}
export function setSimulatedNow(localISO) {      // "2026-11-12T18:00" or null to go back to real time
  settings.set('simOffset', localISO ? new Date(localISO).getTime() - Date.now() : 0);
}

// ------------------------------------------------------------------ done-checks for activities, task status
export const done = {
  all: () => kv.get('done', {}),
  has: (id) => !!kv.get('done', {})[id],
  toggle(id) { const m = kv.get('done', {}); if (m[id]) delete m[id]; else m[id] = Date.now(); kv.set('done', m); return !!m[id]; },
};
export const taskState = {
  get: (t) => kv.get('tasks', {})[t.id] ?? t.status,
  set(id, v) { const m = kv.get('tasks', {}); m[id] = v; kv.set('tasks', m); },
};
export const docCodes = {       // codes / notes typed in the app override the JSON (which is just the starting point)
  get: (doc) => kv.get('docCodes', {})[doc.id] ?? doc.code ?? '',
  set(id, v) { const m = kv.get('docCodes', {}); m[id] = v; kv.set('docCodes', m); },
};
export const checks = {          // departure checklists
  has: (key) => !!kv.get('checks', {})[key],
  toggle(key) { const m = kv.get('checks', {}); if (m[key]) delete m[key]; else m[key] = 1; kv.set('checks', m); return !!m[key]; },
};

// ------------------------------------------------------------------ IndexedDB for photos and attached files
let dbp;
function openDB() {
  dbp ||= new Promise((resolve, reject) => {
    const req = indexedDB.open('travell-' + D.trip.id, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('photos', { keyPath: 'id' });      // metadata + small thumbnail
      db.createObjectStore('photoFull', { keyPath: 'id' });   // full-size blob
      db.createObjectStore('files', { keyPath: 'id' });       // documents attached to a doc
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}
async function tx(store, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const out = fn(t.objectStore(store));
    t.oncomplete = () => resolve(out?.result);
    t.onerror = t.onabort = () => reject(t.error);
  });
}
export const idb = {
  put: (store, rec) => tx(store, 'readwrite', (s) => s.put(rec)),
  get: (store, id) => tx(store, 'readonly', (s) => s.get(id)),
  all: (store) => tx(store, 'readonly', (s) => s.getAll()),
  del: (store, id) => tx(store, 'readwrite', (s) => s.delete(id)),
};
