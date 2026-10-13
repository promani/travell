// MCP server over the trip data, for a regular Claude session (Claude Code, Claude Desktop…).
// Streamable HTTP transport, stateless: POST /mcp with JSON-RPC, answered with plain JSON. Dependency-free.
// Same auth as the admin API (Authorization: Bearer $ADMIN_API_KEY); relay.mjs checks it before calling here.
//
// This is the only way an AI touches the trip: the app has no AI of its own. The person hands Claude a booking (PDF,
// screenshot, mail, link) in the Claude app; Claude reads it with its own tools and turns it into records here.
// Claude reads the trip, previews a batch of changes and applies it through trip.apply(): the same validation and the
// same Redis store as /v1/admin/changes, so the phones pick the changes up like any other admin change.
import { COLS, TICKET_KINDS, current, resolveBatch } from './tripdata.mjs';

const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const BY = 'claude (mcp)';
const json = (x) => ({ content: [{ type: 'text', text: JSON.stringify(x) }] });   // compact: tool results count against the context
const fail = (msg) => ({ content: [{ type: 'text', text: msg }], isError: true });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const colNames = Object.keys(COLS);

// ------------------------------------------------------------------ what Claude gets to know about the trip
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] != null && o[k] !== '').map((k) => [k, o[k]]));
const short = (s, n = 140) => (typeof s === 'string' && s.length > n ? s.slice(0, n) + '…' : s);

/** A compact view of the trip: what exists (ids!) and one sample record per collection (the shape). */
export function tripContext(files) {
  const trip = files['trip.json'], days = files['itinerary.json']?.days || [];
  const places = (trip.placeFiles || ['places.json']).flatMap((f) => files[f] || []);
  const list = (f) => files[f] || [];
  const sample = (arr) => (arr[0] ? Object.fromEntries(Object.entries(arr[0]).map(([k, v]) => [k, short(v, 80)])) : null);
  return {
    trip: { ...pick(trip, ['id', 'title', 'description', 'start', 'end', 'locale']), home: trip.home, cities: (trip.cities || []).map((c) => pick(c, ['id', 'name', 'tz'])), currencies: trip.currencies },
    travelers: list('travelers.json').map((t) => pick(t, ['id', 'name'])),
    days: days.map((d) => ({ ...pick(d, ['id', 'n', 'date', 'cityId', 'title']), activities: (d.activities || []).map((a) => pick(a, ['id', 'start', 'end', 'title', 'placeId', 'reservation', 'status'])) })),
    transport: list('transport.json').map((t) => pick(t, ['id', 'date', 'day', 'route', 'kind', 'service', 'depart', 'arrive', 'status', 'code'])),
    lodging: list('lodging.json').map((l) => pick(l, ['id', 'cityId', 'name', 'area', 'checkIn', 'checkOut', 'status', 'confirmation'])),
    documents: list('documents.json').map((d) => pick(d, ['id', 'type', 'title', 'status'])),
    tickets: list('tickets.json').map((t) => ({ ...pick(t, ['id', 'code', 'link']), qrs: t.qrs?.length || undefined })),
    passports: list('passports.json').map((p) => pick(p, ['id', 'expires'])),
    expenses: list('expenses.json').length,
    places: places.map((p) => pick(p, ['id', 'name', 'cityId', 'category'])),
    samples: {
      transport: sample(list('transport.json')), lodging: sample(list('lodging.json')), documents: sample(list('documents.json')),
      activities: days.find((d) => d.activities?.length) ? { ...sample(days.find((d) => d.activities?.length).activities), dayId: '<id del día>' } : null,
      places: sample(places), resources: sample(list('resources.json')), notes: sample(list('notes.json')), tasks: sample(list('tasks.json')),
      tickets: { id: 'transport:t01', code: 'QX7P2L', link: 'https://…', qrs: [{ id: 'qr-1', text: '<contenido del QR>', format: 'qr_code', label: 'Pehuén' }] },
      expenses: { id: 'ex-cena-bund', desc: 'Cena en el Bund', amount: 480, currency: 'CNY', paidBy: '<id de viajero>', split: { mode: 'equal', among: ['<ids de viajeros>'] }, category: 'comida', dayId: 'd04' },
      passports: { id: '<id de viajero>', fullName: 'APELLIDO NOMBRE', number: 'AAA123456', nationality: 'Argentina', birth: 'AAAA-MM-DD', issued: 'AAAA-MM-DD', expires: 'AAAA-MM-DD' },
    },
  };
}

const CHANGE_RULES = `Formato de cada cambio (es lo único que puede modificar el viaje):
{ "op": "put" | "patch" | "del", "col": "<colección>", "id": "<id>", "data": { ... }, "label": "<frase corta en castellano rioplatense>" }
- Colecciones: ${Object.keys(COLS).join(', ')}.
- "patch" agrega o cambia campos de un registro que ya existe (preferilo). "put" crea uno nuevo con todos sus campos. "del" lo borra.
- Respetá la forma de los registros de ejemplo (mismos nombres de campo). Fechas AAAA-MM-DD; horas HH:MM en la hora local del lugar.
- Las actividades llevan "dayId" con el id del día. Un id nuevo: corto, en minúsculas, con prefijo de la colección (ej. "l-hanting-bund", "t-mu746").
- tickets = el comprobante de algo que ya existe: código de reserva, link a la reserva y QRs (el texto que contiene el QR; la app lo dibuja). Su id es "<${Object.keys(TICKET_KINDS).join('|')}>:<id>" (ej. "transport:t01", "activity:A052", "doc:doc04"). El código de un hotel va en lodging.confirmation y su link en lodging.bookingUrl, no en tickets.
- expenses: gastos compartidos. amount en la moneda de currency, paidBy y split con ids de viajeros, category: comida | transporte | alojamiento | entradas | compras | otros.
- passports: id = id del viajero.
- Los archivos (PDF, capturas) no se suben por acá: guardá lo que dicen (código, horarios, link). La persona los adjunta desde la app si los quiere ver sin internet.
- "label" describe el cambio para que la persona lo confirme, ej. "Marcar el vuelo MU746 como reservado".
- No inventes datos: si algo no está en lo que te pasaron, no lo pongas.`;

const INSTRUCTIONS = `Datos del viaje de Travell (China y Japón 2026). La app de los viajeros lee estos datos: lo que apliques acá les llega a todos los celulares en unos minutos. La app no tiene IA propia: esta es la única forma de cargarle cosas con IA.
- Lo típico: te pasan una reserva o confirmación (PDF, captura, mail, link). Leela con tus propias herramientas (y buscá en internet lo que falte, ej. la dirección del hotel), y cargala acá: el transporte, hotel o actividad, y su código en tickets.
- Empezá por trip_overview (ids de todo) y get_day / get_records para ver registros completos antes de cambiarlos.
- Para cambiar algo: armá los cambios, mostralos con preview_changes y aplicalos con apply_changes solo cuando la persona lo confirme.
- Los cambios quedan encima de los JSON del repo; list_changes muestra lo que difiere del repo y revert_record vuelve un registro a como está en el repo.

${CHANGE_RULES}`;

const change = {
  type: 'object',
  properties: {
    op: { type: 'string', enum: ['put', 'patch', 'del'] },
    col: { type: 'string', enum: colNames },
    id: { type: 'string', description: 'id del registro ("trip" para la colección trip)' },
    data: { type: 'object', description: 'campos (patch: solo los que cambian; put: el registro completo)' },
    label: { type: 'string', description: 'frase corta que describe el cambio' },
  },
  required: ['op', 'col', 'id'],
};
const changes = { type: 'array', items: change, minItems: 1, maxItems: 100 };

const TOOLS = [
  { name: 'trip_overview', title: 'Resumen del viaje',
    description: 'El viaje en forma compacta: datos generales, viajeros, días, transportes, alojamientos, documentos, reservas (tickets) y pasaportes, con sus ids, más un registro de ejemplo por colección (la forma de los campos).',
    inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'get_day', title: 'Ver un día',
    description: 'Un día completo: sus campos, actividades, notas, transportes de esa fecha, el alojamiento de esa noche y los gastos del día.',
    inputSchema: { type: 'object', properties: { day: { type: 'string', description: 'id ("d05"), número ("5") o fecha ("2026-11-16")' } }, required: ['day'] },
    annotations: { readOnlyHint: true } },
  { name: 'get_records', title: 'Ver registros',
    description: `Registros completos de una colección (${colNames.join(', ')}), todos o los ids pedidos. En days sin ids no vienen las actividades (usá get_day o activities).`,
    inputSchema: { type: 'object', properties: { collection: { type: 'string', enum: colNames }, ids: { type: 'array', items: { type: 'string' } } }, required: ['collection'] },
    annotations: { readOnlyHint: true } },
  { name: 'preview_changes', title: 'Previsualizar cambios',
    description: 'Valida un lote de cambios sin guardar nada y muestra qué cambiaría en cada registro (antes → después). Usalo antes de apply_changes y mostrale el resultado a la persona.',
    inputSchema: { type: 'object', properties: { changes }, required: ['changes'] }, annotations: { readOnlyHint: true } },
  { name: 'apply_changes', title: 'Aplicar cambios',
    description: 'Guarda un lote de cambios (todo o nada) y les llega a todos los celulares. Solo después de que la persona confirme lo que mostró preview_changes.',
    inputSchema: { type: 'object', properties: { changes, note: { type: 'string', description: 'motivo, queda en el historial' } }, required: ['changes'] },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false } },
  { name: 'list_changes', title: 'Cambios sobre el repo',
    description: 'Lo que difiere de los JSON del repo (registro por registro) y el historial de los últimos cambios.',
    inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'revert_record', title: 'Volver al repo',
    description: 'Descarta los cambios guardados de un registro: vuelve a lo que dice el repo.',
    inputSchema: { type: 'object', properties: { collection: { type: 'string', enum: colNames }, id: { type: 'string' } }, required: ['collection', 'id'] },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true } },
];

function findDay(files, q) {
  const s = String(q || '').trim(), days = files['itinerary.json']?.days || [];
  return days.find((d) => d.id === s || d.date === s || String(d.n) === s.replace(/^d(ía|ia)?\s*/i, '')) || null;
}

function records(files, col, ids) {
  const c = COLS[col];
  if (c.kind === 'object') return files[c.file];
  let all;
  if (c.kind === 'days') all = (files['itinerary.json']?.days || []).map((d) => (ids?.length ? d : { ...d, activities: undefined }));
  else if (c.kind === 'activities') all = (files['itinerary.json']?.days || []).flatMap((d) => (d.activities || []).map((a) => ({ ...a, dayId: d.id })));
  else if (c.kind === 'places') all = (files['trip.json']?.placeFiles || ['places.json']).flatMap((f) => files[f] || []);
  else all = files[c.file] || [];
  return ids?.length ? all.filter((r) => ids.includes(r.id)) : all;
}

/** What a resolved batch would do to each record: created, deleted, or the fields that change. */
function diff(files, recs) {
  return recs.map(({ op, col, id, data, label }) => {
    const before = current(files, col, id), out = { col, id, label };
    if (op === 'del') return { ...out, action: 'borrar', before };
    if (!before) return { ...out, action: 'crear', after: data };
    const fields = {};
    for (const k of new Set([...Object.keys(before), ...Object.keys(data)])) {
      if (col === 'days' && k === 'activities') continue;
      if (!same(before[k], data[k])) fields[k] = { before: before[k] ?? null, after: data[k] ?? null };
    }
    return { ...out, action: Object.keys(fields).length ? 'modificar' : 'sin cambios', fields };
  });
}

async function call(trip, name, args = {}) {
  const files = await trip.files();
  switch (name) {
    case 'trip_overview': return json(tripContext(files));
    case 'get_day': {
      const day = findDay(files, args.day);
      if (!day) return fail(`no encontré el día "${args.day}"`);
      return json({
        ...day,
        notes: (files['notes.json'] || []).filter((n) => (n.days || []).includes(day.id)),
        transport: (files['transport.json'] || []).filter((t) => t.day === day.id || t.date === day.date),
        lodging: (files['lodging.json'] || []).filter((l) => l.id === day.lodgingId || (l.checkIn <= day.date && day.date < l.checkOut)),
        expenses: (files['expenses.json'] || []).filter((e) => e.dayId === day.id),
      });
    }
    case 'get_records':
      if (!COLS[args.collection]) return fail(`colección desconocida: ${args.collection}`);
      return json(records(files, args.collection, args.ids));
    case 'preview_changes': {
      const res = resolveBatch(files, args.changes);
      if (res.error) return fail(`No pasa la validación${res.index >= 0 ? ` (cambio ${res.index + 1})` : ''}: ${res.error}`);
      return json({ ok: true, changes: diff(files, res.records) });
    }
    case 'apply_changes': {
      const out = await trip.apply(args.changes, { by: BY, note: args.note || '' });
      if (out.error) return fail(`No se aplicó nada${out.index >= 0 ? ` (falla el cambio ${out.index + 1})` : ''}: ${out.error}`);
      return json(out);
    }
    case 'list_changes': return json(await trip.changes());
    case 'revert_record': {
      const out = await trip.revert(args.collection, args.id, { by: BY });
      return out.error ? fail(out.error) : json(out);
    }
    default: return null;
  }
}

/** One JSON-RPC message → its response (or null for a notification). */
async function handle(trip, msg) {
  const reply = (result) => ({ jsonrpc: '2.0', id: msg.id, result });
  const error = (code, message) => ({ jsonrpc: '2.0', id: msg?.id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return error(-32600, 'invalid request');
  if (msg.id === undefined) return null;                                   // notifications/initialized and friends
  const p = msg.params || {};
  switch (msg.method) {
    case 'initialize':
      return reply({
        protocolVersion: VERSIONS.includes(p.protocolVersion) ? p.protocolVersion : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'travell', title: 'Travell', version: '1.0.0' },
        instructions: INSTRUCTIONS,
      });
    case 'ping': return reply({});
    case 'tools/list': return reply({ tools: TOOLS });
    case 'tools/call': {
      try {
        const out = await call(trip, p.name, p.arguments || {});
        return out ? reply(out) : error(-32602, `herramienta desconocida: ${p.name}`);
      } catch (e) { return reply(fail(`Error: ${e.message}`)); }
    }
    default: return error(-32601, `método desconocido: ${msg.method}`);
  }
}

/** Body of a POST /mcp (one message or a batch). Returns the response body, or null when there is nothing to answer. */
export async function mcp(trip, body) {
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handle(trip, m)))).filter(Boolean);
    return out.length ? out : null;
  }
  return handle(trip, body);
}
