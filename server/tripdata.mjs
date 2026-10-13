// Trip data = the JSON files in the repo (data/*.json) + the changes made through the admin API (server side).
// Those changes live in Redis (or a file in RELAY_DATA when there is no Redis) and are applied when the app asks for
// /data/<file>.json, so the app reads the result as if it were the file. The repo stays as the base; the changes sit
// on top of it until someone folds them into the repo (GET /v1/admin/changes lists them).
//
// Two writers, one validation: the admin API and the MCP server (server/mcp.mjs), the only way an AI touches the trip.
// Both go through trip.apply() behind ADMIN_API_KEY.
//
// A change: { op: 'put' | 'patch' | 'del', col, id, data?, label? }
//   put   = create or replace the whole record      patch = merge fields into the current record
//   del   = remove it                               label = human sentence shown before applying ("Crear hotel X")
// Stored changes are always full records ('put' or 'del'), so applying them never depends on order.
import fs from 'node:fs';
import path from 'node:path';
import { redis } from './redis.mjs';

/** What the admin API can change, and how each collection sits in the files. */
export const COLS = {
  trip: { kind: 'object', file: 'trip.json' },
  days: { kind: 'days', file: 'itinerary.json' },                  // day fields (title, summary, image…), not its activities
  activities: { kind: 'activities', file: 'itinerary.json' },      // inside days[].activities; the record carries dayId
  places: { kind: 'places' },                                       // spread over trip.placeFiles
  transport: { kind: 'array', file: 'transport.json', name: 'route' },
  lodging: { kind: 'array', file: 'lodging.json', name: 'name' },
  documents: { kind: 'array', file: 'documents.json', name: 'title' },
  travelers: { kind: 'array', file: 'travelers.json', name: 'name' },
  tasks: { kind: 'array', file: 'tasks.json', name: 'title' },
  notes: { kind: 'array', file: 'notes.json', name: 'title' },
  requirements: { kind: 'array', file: 'requirements.json', name: 'title' },
  resources: { kind: 'array', file: 'resources.json', name: 'title' },
  tickets: { kind: 'array', file: 'tickets.json' },                // booking code / link / QRs of something; id = "<kind>:<id>"
  expenses: { kind: 'array', file: 'expenses.json', name: 'desc' },
  passports: { kind: 'array', file: 'passports.json', name: 'number' },   // id = traveler id
};
/** What a ticket can belong to (its id is "<kind>:<id of that record>"). */
export const TICKET_KINDS = { transport: 'transport', activity: 'activities', lodging: 'lodging', doc: 'documents', passport: 'travelers' };
COLS.places.name = 'name'; COLS.activities.name = 'title';
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/, TIME = /^\d{2}:\d{2}$/;
const DAY_LOCKED = ['id', 'n', 'date', 'activities'];
const MAX_DATA = 64 * 1024;
const clone = (x) => JSON.parse(JSON.stringify(x));
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);

/** Every file the changes can touch (the app keeps loading the rest straight from disk). */
export function managedFiles(trip) {
  return [...new Set(['trip.json', 'itinerary.json', ...(trip.placeFiles || ['places.json']),
    ...Object.values(COLS).filter((c) => c.kind === 'array').map((c) => c.file)])];
}

export function readBase(dataDir) {
  const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8')); } catch { return null; } };
  const files = { 'trip.json': read('trip.json') };
  for (const f of managedFiles(files['trip.json'])) if (!(f in files)) files[f] = read(f);
  return files;
}

// ------------------------------------------------------------------ applying changes to the files
function placeFiles(files) { return (files['trip.json']?.placeFiles || ['places.json']).filter((f) => Array.isArray(files[f])); }

/** The current record (base + changes) or null. */
export function current(files, col, id) {
  const c = COLS[col];
  if (c.kind === 'object') return files[c.file];
  if (c.kind === 'days') return (files['itinerary.json']?.days || []).find((d) => d.id === id) || null;
  if (c.kind === 'activities') {
    for (const d of files['itinerary.json']?.days || []) { const a = (d.activities || []).find((x) => x.id === id); if (a) return { ...a, dayId: d.id }; }
    return null;
  }
  if (c.kind === 'places') { for (const f of placeFiles(files)) { const p = files[f].find((x) => x.id === id); if (p) return p; } return null; }
  return (files[c.file] || []).find((x) => x.id === id) || null;
}

/** Applies one stored change ({ op: 'put' | 'del', col, id, data }) to the files, in place. */
function applyOne(files, { op, col, id, data }) {
  const c = COLS[col];
  if (!c) return;
  if (c.kind === 'object') { if (op === 'put') files[c.file] = data; return; }
  if (c.kind === 'days') {
    const day = (files['itinerary.json']?.days || []).find((d) => d.id === id);
    if (day && op === 'put') { for (const k of Object.keys(day)) if (!DAY_LOCKED.includes(k)) delete day[k]; Object.assign(day, data, { id: day.id, n: day.n, date: day.date, activities: day.activities }); }
    return;
  }
  if (c.kind === 'activities') {
    const days = files['itinerary.json']?.days || [];
    let at = -1, from = null;
    for (const d of days) { const i = (d.activities || []).findIndex((x) => x.id === id); if (i >= 0) { at = i; from = d; d.activities.splice(i, 1); } }
    if (op === 'put') {
      const day = days.find((d) => d.id === data.dayId);
      if (!day) return;
      const { dayId, ...rec } = data;
      day.activities ||= [];
      day === from ? day.activities.splice(at, 0, rec) : day.activities.push(rec);   // keeps its place when only edited
    }
    return;
  }
  if (c.kind === 'places') {
    const list = placeFiles(files);
    let done = false;
    for (const f of list) {
      const i = files[f].findIndex((x) => x.id === id);
      if (i < 0) continue;
      if (op === 'put' && !done) { files[f][i] = data; done = true; } else files[f].splice(i, 1);
    }
    if (op === 'put' && !done && list.length) files[list[list.length - 1]].push(data);
    return;
  }
  const arr = files[c.file] ||= [];
  const i = arr.findIndex((x) => x.id === id);
  if (op === 'del') { if (i >= 0) arr.splice(i, 1); return; }
  i >= 0 ? (arr[i] = data) : arr.push(data);
}

/** Base files + stored changes → the files the app reads. Pure: the base is not modified. */
export function merge(base, records) {
  const files = clone(base);
  // the trip first: it says which files hold the places
  const list = Object.values(records || {}).sort((a, b) => (a.col === 'trip' ? -1 : 0) - (b.col === 'trip' ? -1 : 0));
  for (const r of list) applyOne(files, r);
  return files;
}

// ------------------------------------------------------------------ validation
/**
 * Checks one incoming change against the current files and turns it into the stored form.
 * Returns { record } or { error }. `record` is { op: 'put' | 'del', col, id, data, label }.
 */
export function resolveChange(files, ch) {
  if (!isObj(ch)) return { error: 'el cambio no es un objeto' };
  const { op, col, id } = ch;
  const c = COLS[col];
  if (!c) return { error: `colección desconocida: ${col}` };
  if (!['put', 'patch', 'del'].includes(op)) return { error: `operación desconocida: ${op}` };
  const rid = c.kind === 'object' ? 'trip' : id;
  if (typeof rid !== 'string' || !ID.test(rid)) return { error: `id inválido: ${id}` };
  const label = typeof ch.label === 'string' ? ch.label.slice(0, 200) : '';
  const cur = current(files, col, rid);
  if (op === 'del') {
    if (c.kind === 'object' || c.kind === 'days') return { error: `no se puede borrar ${col}` };
    if (!cur) return { error: `${col}/${rid} no existe` };
    return { record: { op: 'del', col, id: rid, data: null, label } };
  }
  if (!isObj(ch.data)) return { error: 'falta data' };
  if (JSON.stringify(ch.data).length > MAX_DATA) return { error: 'data demasiado grande' };
  if (op === 'patch' && !cur) return { error: `${col}/${rid} no existe (usá put para crearlo)` };
  let data = op === 'patch' ? { ...clone(cur), ...clone(ch.data) } : clone(ch.data);
  if (c.kind === 'object') { if (op === 'put') data = { ...clone(cur), ...data }; data.id = cur?.id; }
  else data.id = rid;
  if (c.kind === 'days') {
    if (!cur) return { error: `el día ${rid} no existe` };
    for (const k of DAY_LOCKED) { if (k in ch.data && k !== 'id' && JSON.stringify(ch.data[k]) !== JSON.stringify(cur[k])) return { error: `no se puede cambiar ${k} de un día (las actividades se cambian en activities)` }; }
    for (const k of DAY_LOCKED) delete data[k];
  }
  if (c.kind === 'activities') {
    data.dayId ||= cur?.dayId;
    if (!(files['itinerary.json']?.days || []).some((d) => d.id === data.dayId)) return { error: `actividad ${rid}: el día ${data.dayId} no existe` };
    for (const k of ['start', 'end']) if (data[k] != null && data[k] !== '' && !TIME.test(data[k])) return { error: `actividad ${rid}: ${k} tiene que ser HH:MM` };
  }
  if (c.name && !cur && !(typeof data[c.name] === 'string' && data[c.name].trim())) return { error: `${col}/${rid}: falta ${c.name}` };
  for (const k of ['date', 'checkIn', 'checkOut']) if (data[k] != null && data[k] !== '' && !DATE.test(data[k])) return { error: `${col}/${rid}: ${k} tiene que ser AAAA-MM-DD` };
  if (col === 'lodging' && data.checkIn && data.checkOut && data.checkOut <= data.checkIn) return { error: `alojamiento ${rid}: el check-out tiene que ser después del check-in` };
  if (col === 'places') for (const k of ['lat', 'lon']) if (data[k] != null && !Number.isFinite(data[k])) return { error: `lugar ${rid}: ${k} tiene que ser un número` };
  if (col === 'tickets') {
    const [kind, ref] = [rid.slice(0, rid.indexOf(':')), rid.slice(rid.indexOf(':') + 1)];
    if (!TICKET_KINDS[kind] || !ref) return { error: `ticket ${rid}: el id tiene que ser <${Object.keys(TICKET_KINDS).join('|')}>:<id>` };
    if (!current(files, TICKET_KINDS[kind], ref)) return { error: `ticket ${rid}: ${TICKET_KINDS[kind]}/${ref} no existe` };
    if (data.qrs != null && !(Array.isArray(data.qrs) && data.qrs.every((q) => isObj(q) && typeof q.text === 'string' && q.text))) return { error: `ticket ${rid}: qrs es una lista de { id, text, format, label }` };
  }
  if (col === 'expenses') {
    const who = new Set((files['travelers.json'] || []).map((t) => t.id));
    if (!(Number.isFinite(data.amount) && data.amount >= 0)) return { error: `gasto ${rid}: amount tiene que ser un número` };
    if (typeof data.currency !== 'string' || !data.currency) return { error: `gasto ${rid}: falta currency` };
    if (!who.has(data.paidBy)) return { error: `gasto ${rid}: paidBy tiene que ser el id de un viajero` };
    const sp = data.split;
    const ok = isObj(sp) && (sp.mode === 'equal' ? Array.isArray(sp.among) && sp.among.length && sp.among.every((t) => who.has(t))
      : sp.mode === 'exact' && isObj(sp.shares) && Object.keys(sp.shares).length && Object.entries(sp.shares).every(([t, v]) => who.has(t) && Number.isFinite(v)));
    if (!ok) return { error: `gasto ${rid}: split es { mode: "equal", among: [ids] } o { mode: "exact", shares: { id: monto } }` };
    if (data.dayId && !(files['itinerary.json']?.days || []).some((d) => d.id === data.dayId)) return { error: `gasto ${rid}: el día ${data.dayId} no existe` };
  }
  if (col === 'passports' && !(files['travelers.json'] || []).some((t) => t.id === rid)) return { error: `pasaporte ${rid}: el id tiene que ser el de un viajero` };
  for (const k of ['birth', 'issued', 'expires']) if (col === 'passports' && data[k] != null && data[k] !== '' && !DATE.test(data[k])) return { error: `pasaporte ${rid}: ${k} tiene que ser AAAA-MM-DD` };
  return { record: { op: 'put', col, id: rid, data, label } };
}

/**
 * Validates a whole batch in order (a later change sees the earlier ones). All or nothing:
 * returns { records } or { error, index }.
 */
export function resolveBatch(files, changes) {
  if (!Array.isArray(changes) || !changes.length) return { error: 'no hay cambios', index: -1 };
  if (changes.length > 100) return { error: 'demasiados cambios (máximo 100)', index: -1 };
  const work = clone(files), records = [];
  for (const [i, ch] of changes.entries()) {
    const r = resolveChange(work, ch);
    if (r.error) return { error: r.error, index: i };
    applyOne(work, r.record);
    records.push(r.record);
  }
  return { records };
}

// ------------------------------------------------------------------ storage of the changes
/** { rev, records: { "col/id": { op, col, id, data, at, by, label } }, log: [{ rev, at, by, note, changes }] } */
export function changeStore({ tripId, redisUrl, prefix, dir }) {
  const key = `${prefix || 'travell:'}trip:${tripId}:changes`;
  if (redisUrl) {
    const r = redis(redisUrl);
    return { kind: 'redis', load: async () => JSON.parse((await r.get(key)) || 'null'), save: (doc) => r.set(key, JSON.stringify(doc)) };
  }
  const file = path.join(dir, `changes-${tripId}.json`);
  return {
    kind: 'file',
    load: async () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } },
    save: async (doc) => { fs.writeFileSync(file + '.tmp', JSON.stringify(doc)); fs.renameSync(file + '.tmp', file); },
  };
}

/** The live trip: base files from disk + the stored changes, with a serialized writer. */
export function tripData({ dataDir, store, log = console.log }) {
  let doc = null, loading = null, queue = Promise.resolve(), cache = { rev: -1, files: null };
  const empty = () => ({ rev: 0, records: {}, log: [] });
  const ensure = async () => { if (doc) return doc; loading ||= store.load().then((d) => (doc = d || empty())).catch((e) => { loading = null; throw e; }); return loading; };
  const files = async () => {
    const d = await ensure();
    if (cache.rev !== d.rev || !cache.files) cache = { rev: d.rev, files: merge(readBase(dataDir), d.records) };
    return cache.files;
  };
  const write = (fn) => (queue = queue.then(async () => {
    const d = await ensure();
    const next = clone(d), out = fn(next);
    if (out?.error) return out;
    next.rev = d.rev + 1;
    await store.save(next);
    doc = next;
    return out;
  }));
  return {
    kind: store.kind,
    files,
    rev: async () => (await ensure()).rev,
    changes: async () => { const d = await ensure(); return { rev: d.rev, records: Object.values(d.records), log: d.log }; },
    /** Validates and stores a batch. Returns { rev, applied } or { error, index }. */
    async apply(changes, { by = 'admin', note = '' } = {}) {
      const res = resolveBatch(await files(), changes);
      if (res.error) return res;
      const at = Date.now();
      const out = await write((d) => {
        for (const r of res.records) d.records[`${r.col}/${r.id}`] = { ...r, at, by };
        d.log = [{ rev: d.rev + 1, at, by, note: String(note).slice(0, 200), changes: res.records.map(({ op, col, id, label }) => ({ op, col, id, label })) }, ...(d.log || [])].slice(0, 200);
        return { applied: res.records.map(({ op, col, id, label }) => ({ op, col, id, label })) };
      });
      if (out.error) return out;
      log(`trip: ${out.applied.length} change(s) by ${by}${note ? ` (${note})` : ''}`);
      return { rev: doc.rev, ...out };
    },
    /** Drops the stored change of one record: it goes back to what the repo says. */
    async revert(col, id, { by = 'admin' } = {}) {
      const out = await write((d) => {
        const k = `${col}/${id}`;
        if (!d.records[k]) return { error: 'ese registro no tiene cambios' };
        delete d.records[k];
        d.log = [{ rev: d.rev + 1, at: Date.now(), by, note: 'restaurado al repo', changes: [{ op: 'revert', col, id, label: '' }] }, ...(d.log || [])].slice(0, 200);
        return {};
      });
      return out.error ? out : { rev: doc.rev };
    },
  };
}
