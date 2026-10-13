// Data model.
//  BASE  = what the static JSON files say (read-only).
//  cols  = records created/edited/deleted in the app ("overlay"), stored locally and optionally synced.
//  D / I = BASE + overlay merged, plus indexes. Views only read D / I.
import { setLocale } from './util.js';

const params = new URLSearchParams(location.search);
/** Folder with the trip's JSON files. `?data=trips/japon` loads another trip. */
export const DATA_BASE = (params.get('data') || 'data').replace(/\/$/, '');

const REQUIRED = ['trip', 'itinerary'];
const OPTIONAL = ['transport', 'lodging', 'documents', 'travelers', 'tasks', 'notes', 'requirements', 'resources', 'phrases', 'tickets', 'expenses', 'passports'];
/** Collections the user can create/edit in the app (merged over the JSON, which Claude edits through the MCP). */
export const EDITABLE = ['places', 'lodging', 'activities', 'tasks', 'travelers', 'resources', 'notes', 'tickets', 'expenses', 'passports'];
/** Collections that only live in the overlay. */
export const LOCAL_ONLY = ['positions', 'suggestions'];

export const BASE = {};
/** Kinds of notes: [icon, label]. */
export const NOTE_KINDS = { alerta: ['triangle-exclamation', 'Alerta'], recordatorio: ['bell', 'Recordatorio'], tip: ['lightbulb', 'Tip'] };
export const D = { trip: null, days: [], transport: [], lodging: [], places: [], documents: [], travelers: [], tasks: [], notes: [], requirements: [], resources: [], tickets: [], expenses: [], passports: [], phrases: { languages: [], groups: [], kanji: [] } };
export const I = {};

async function getJSON(name, required) {
  try {
    const r = await fetch(`${DATA_BASE}/${name}`);
    if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    if (required) throw e;
    return null;
  }
}

export async function loadData() {
  const [req, opt] = await Promise.all([
    Promise.all(REQUIRED.map((n) => getJSON(n + '.json', true))),
    Promise.all(OPTIONAL.map((n) => getJSON(n + '.json', false)))]);
  BASE.trip = req[0];
  BASE.days = req[1].days.sort((a, b) => a.date.localeCompare(b.date));
  OPTIONAL.forEach((n, i) => { BASE[n] = opt[i] || []; });
  // places can be split in several files listed in trip.json ("placeFiles"); later files extend / override earlier ones
  const files = BASE.trip.placeFiles || ['places.json'];
  const parts = await Promise.all(files.map((f) => getJSON(f, false)));
  const byId = new Map();
  parts.forEach((arr, k) => (arr || []).forEach((p) => byId.set(p.id, { ...p, file: files[k] })));
  BASE.places = [...byId.values()];
  setLocale(BASE.trip.locale);
  migrateLegacy();
  rebuild();
}

// ------------------------------------------------------------------ event bus
const handlers = {};
export const bus = {
  on(ev, fn) { (handlers[ev] ||= new Set()).add(fn); return () => handlers[ev].delete(fn); },
  emit(ev, data) { handlers[ev]?.forEach((f) => f(data)); },
};

// ------------------------------------------------------------------ key/value (localStorage), namespaced per trip
const ns = () => `travell:${BASE.trip.id}:`;
export const kv = {
  get(key, def) {
    try { const v = localStorage.getItem(ns() + key); return v == null ? def : JSON.parse(v); } catch { return def; }
  },
  set(key, val) {
    try { localStorage.setItem(ns() + key, JSON.stringify(val)); return true; } catch { return false; }
  },
  del(key) { try { localStorage.removeItem(ns() + key); } catch { /* ignore */ } },
};

export const settings = {
  get(key, def) { return kv.get('settings', {})[key] ?? def; },
  set(key, val) {
    const s = kv.get('settings', {}); s[key] = val; kv.set('settings', s); bus.emit('settings', key);
  },
};
/** Traveler id of whoever uses this device. */
export const me = () => settings.get('me', null);
// App colour (top bar): this phone's choice in Ajustes, else the trip's "brand" in trip.json
export const DEFAULT_BRAND = '#0b6e7f';
export const brandColor = () => settings.get('brand', null) || D.trip?.brand || DEFAULT_BRAND;

// ------------------------------------------------------------------ overlay collections
// Each record: { id, updatedAt, by, deleted?, ...fields }. Last write (updatedAt) wins when merging.
export const cols = {
  map: (name) => kv.get('col:' + name, {}),
  list: (name) => Object.values(kv.get('col:' + name, {})),
  live: (name) => Object.values(kv.get('col:' + name, {})).filter((r) => !r.deleted),
  put(name, rec, { rebuild: rb = true } = {}) {
    const m = cols.map(name);
    const r = { ...rec, updatedAt: Date.now(), by: me() };
    m[r.id] = r;
    kv.set('col:' + name, m);
    if (rb && EDITABLE.includes(name)) rebuild();
    bus.emit('local-change', name);
    return r;
  },
  del(name, id) { return cols.put(name, { id, deleted: true }); },
  /** Undo local edits/deletes of a record that comes from the JSON (synced like any other change). */
  reset(name, id) { return cols.put(name, { id, reset: true }); },
  /** Merge records coming from another device. Returns the records that changed. */
  merge(name, recs) {
    const m = cols.map(name), changed = [];
    for (const r of recs) {
      if (!r || !r.id) continue;
      const cur = m[r.id];
      if (!cur || (r.updatedAt || 0) > (cur.updatedAt || 0)) { m[r.id] = r; changed.push(r); }
    }
    if (changed.length) kv.set('col:' + name, m);
    return changed;
  },
};

function migrateLegacy() {
  const old = kv.get('expenses', null);                     // v1 kept expenses as an array
  if (Array.isArray(old)) {
    const m = cols.map('expenses');
    old.forEach((e) => { m[e.id] ||= { ...e, updatedAt: e.updatedAt || e.createdAt || Date.now() }; });
    kv.set('col:expenses', m); kv.del('expenses');
  }
  const ts = kv.get('tasks', null);                         // v1 kept task status as a map
  if (ts && typeof ts === 'object') {
    const m = cols.map('tasks');
    for (const [id, status] of Object.entries(ts)) {
      const base = BASE.tasks.find((t) => t.id === id);
      if (base && !m[id]) m[id] = { ...base, status, updatedAt: Date.now() };
    }
    kv.set('col:tasks', m); kv.del('tasks');
  }
}

function merged(base, name) {
  const m = new Map((base || []).map((x) => [x.id, x]));
  for (const r of cols.list(name)) {
    if (r.reset) continue;                     // "restaurar original": back to the JSON version
    if (r.deleted) m.delete(r.id);
    else m.set(r.id, { ...(m.get(r.id) || {}), ...r, edited: m.has(r.id) });
  }
  return [...m.values()];
}

/**
 * Travelers the app saved before travelers.json had the real names (the example "Yo" / "Viajero2" renamed in the app,
 * or someone added with "Soy otra persona"). One with the same name as a traveler of the file is folded into it: its
 * expenses, tasks, passport and "who am I" move to the real id. Then the old record is deleted (synced like any edit).
 */
function foldTravelers() {
  const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const real = new Map((BASE.travelers || []).map((t) => [norm(t.name), t.id]));
  const ids = new Set((BASE.travelers || []).map((t) => t.id));
  const alias = {};
  for (const r of cols.list('travelers')) {
    if (r.deleted || ids.has(r.id)) continue;
    if (real.has(norm(r.name))) alias[r.id] = real.get(norm(r.name));
  }
  const olds = Object.keys(alias);
  if (!olds.length) return;
  const to = (id) => alias[id] || id;
  const quiet = { rebuild: false };
  for (const e of cols.live('expenses')) {
    const s = e.split || {};
    const touched = olds.includes(e.paidBy) || (s.among || []).some((x) => alias[x]) || Object.keys(s.shares || {}).some((x) => alias[x]);
    if (!touched) continue;
    const shares = s.shares && Object.fromEntries(Object.entries(s.shares).map(([k, v]) => [to(k), v]));
    cols.put('expenses', { ...e, paidBy: to(e.paidBy), split: { ...s, ...(s.among && { among: [...new Set(s.among.map(to))] }), ...(shares && { shares }) } }, quiet);
  }
  for (const t of cols.live('tasks')) {
    if (alias[t.assignee] || alias[t.createdBy]) cols.put('tasks', { ...t, assignee: to(t.assignee), createdBy: to(t.createdBy) }, quiet);
  }
  const passports = cols.map('passports');
  for (const old of olds) {
    const p = passports[old];
    if (p && !p.deleted) {
      if (!passports[alias[old]] || passports[alias[old]].deleted) cols.put('passports', { ...p, id: alias[old] }, quiet);
      cols.put('passports', { id: old, deleted: true }, quiet);
    }
    cols.put('travelers', { id: old, deleted: true }, quiet);
  }
  if (alias[me()]) settings.set('me', alias[me()]);
}

const minutes = (hhmm) => { const x = /^(\d{1,2}):(\d{2})/.exec(hhmm || ''); return x ? +x[1] * 60 + +x[2] : null; };

/** Overlay records that change or hide something from the JSON files. */
export function overriddenBase() {
  const baseActs = BASE.days.flatMap((d) => d.activities);
  const base = { places: BASE.places, lodging: BASE.lodging, tasks: BASE.tasks, travelers: BASE.travelers, resources: BASE.resources, notes: BASE.notes, activities: baseActs, tickets: BASE.tickets, expenses: BASE.expenses, passports: BASE.passports };
  const out = [];
  for (const [name, arr] of Object.entries(base)) {
    const ids = new Map(arr.map((x) => [x.id, x]));
    for (const r of cols.list(name)) if (ids.has(r.id) && !r.reset) out.push({ col: name, id: r.id, deleted: !!r.deleted, title: ids.get(r.id).name || ids.get(r.id).title || ids.get(r.id).desc || r.id });
  }
  return out;
}

/** Recompute D and I from BASE + overlay. Cheap enough to run after every edit. */
export function rebuild() {
  D.trip = BASE.trip;
  for (const k of ['transport', 'documents', 'requirements']) D[k] = BASE[k];
  // notes: tips, reminders and alerts per day. Older files used level warn / info instead of kind.
  D.notes = merged(BASE.notes, 'notes').map((n) => ({ ...n, kind: NOTE_KINDS[n.kind] ? n.kind : n.level === 'warn' ? 'alerta' : 'tip', days: n.days || [] }));
  D.phrases = { languages: [], groups: [], kanji: [], ...(Array.isArray(BASE.phrases) ? {} : BASE.phrases) };
  // the travelers are the ones in travelers.json; the app does not add, rename or remove them
  foldTravelers();
  D.travelers = BASE.travelers || [];
  D.places = merged(BASE.places, 'places');
  D.tasks = merged(BASE.tasks, 'tasks');
  D.resources = merged(BASE.resources, 'resources');
  D.tickets = merged(BASE.tickets, 'tickets');
  D.expenses = merged(BASE.expenses, 'expenses');
  D.passports = merged(BASE.passports, 'passports');
  D.lodging = merged(BASE.lodging, 'lodging').filter((l) => l.checkIn && l.checkOut).sort((a, b) => a.checkIn.localeCompare(b.checkIn));

  const dayByDate = Object.fromEntries(BASE.days.map((d) => [d.date, d]));
  D.lodging.forEach((l) => {
    l.nights = Math.max(0, Math.round((new Date(l.checkOut) - new Date(l.checkIn)) / 86400000));
    l.checkInDay = dayByDate[l.checkIn]?.id || null;
    l.checkOutDay = dayByDate[l.checkOut]?.id || null;
  });

  // activities: base ones (in file order) + app ones, ordered by start time
  const baseActs = BASE.days.flatMap((d) => d.activities.map((a) => ({ ...a, dayId: d.id })));
  const acts = merged(baseActs, 'activities');
  D.days = BASE.days.map((d) => {
    let key = -1;
    const list = acts.filter((a) => a.dayId === d.id).map((a) => {
      const m = minutes(a.start);
      if (m != null) key = m;
      return { a, k: m ?? key };
    }).sort((x, y) => x.k - y.k).map((x) => x.a);
    // the night's lodging: whichever covers this date (booked ones first)
    const l = D.lodging.filter((x) => x.checkIn <= d.date && d.date < x.checkOut).sort((x, y) => (y.status === 'reservado') - (x.status === 'reservado'))[0];
    return { ...d, activities: list, lodgingId: l ? l.id : null };
  });

  for (const k of ['day', 'dayByDate', 'place', 'lodging', 'transport', 'doc', 'traveler', 'city', 'activity', 'task', 'resource', 'note', 'ticket', 'passport']) I[k] = {};
  D.days.forEach((d) => { I.day[d.id] = d; I.dayByDate[d.date] = d; d.activities.forEach((a) => { I.activity[a.id] = a; }); });
  D.places.forEach((p) => { I.place[p.id] = p; p.days = []; });
  D.days.forEach((d) => d.activities.forEach((a) => { const p = I.place[a.placeId]; if (p && !p.days.includes(d.id)) p.days.push(d.id); }));
  D.lodging.forEach((x) => { I.lodging[x.id] = x; });
  D.transport.forEach((x) => { I.transport[x.id] = x; });
  D.documents.forEach((x) => { I.doc[x.id] = x; });
  D.travelers.forEach((x) => { I.traveler[x.id] = x; });
  D.tasks.forEach((x) => { I.task[x.id] = x; });
  D.resources.forEach((x) => { I.resource[x.id] = x; });
  D.notes.forEach((x) => { I.note[x.id] = x; });
  D.tickets.forEach((x) => { I.ticket[x.id] = x; });
  D.passports.forEach((x) => { I.passport[x.id] = x; });
  D.trip.cities.forEach((c) => { I.city[c.id] = c; });
  bus.emit('data');
}

// ------------------------------------------------------------------ clock (with a "simulate date" option for testing)
export function now() {
  const off = settings.get('simOffset', 0);
  return new Date(Date.now() + off);
}
export function setSimulatedNow(when) {      // a Date (see tripstate.localInstant), "2026-11-12T18:00" (device zone) or null for real time
  settings.set('simOffset', when ? new Date(when).getTime() - Date.now() : 0);
}

// ------------------------------------------------------------------ small per-device marks
export const done = {
  has: (id) => !!kv.get('done', {})[id],
  toggle(id) { const m = kv.get('done', {}); if (m[id]) delete m[id]; else m[id] = Date.now(); kv.set('done', m); return !!m[id]; },
};
export const checks = {          // departure checklists
  has: (key) => !!kv.get('checks', {})[key],
  toggle(key) { const m = kv.get('checks', {}); if (m[key]) delete m[key]; else m[key] = 1; kv.set('checks', m); return !!m[key]; },
};

// ------------------------------------------------------------------ IndexedDB for photos and attached files
let dbp;
function openDB() {
  dbp ||= new Promise((resolve, reject) => {
    const req = indexedDB.open('travell-' + BASE.trip.id, 1);
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
