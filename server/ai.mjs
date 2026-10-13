// AI on the server (Kimi / Moonshot, OpenAI-compatible API). The keys never reach the browser.
//
//   KIMI_API_KEY, KIMI_MODEL (e.g. kimi-k2.6), KIMI_BASE_URL (default https://api.moonshot.ai/v1)
//
// The AI never writes anything. It returns a proposal: a list of changes in the admin API format (see tripdata.mjs),
// each with a human label. The server dry-runs them through the same validation the admin API uses, the app shows
// them, and only when the person confirms does the app post them to /v1/admin/changes.
//
// Today: extract() reads a shared confirmation (mail, PDF, screenshot) and proposes where it goes.
// Next: an agent ("cambiá el día 5 por esto") reuses the same pieces: tripContext() + chat() + resolveBatch().
import { COLS, resolveBatch } from './tripdata.mjs';

export function kimiFromEnv(env = process.env) {
  if (!env.KIMI_API_KEY) return null;
  return kimi({ apiKey: env.KIMI_API_KEY, model: env.KIMI_MODEL || 'kimi-k2.6', baseUrl: (env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1').replace(/\/+$/, '') });
}

export function kimi({ apiKey, model, baseUrl, fetchImpl = fetch }) {
  const auth = { authorization: `Bearer ${apiKey}` };
  async function call(pathname, init, timeout = 120000) {
    const res = await fetchImpl(`${baseUrl}${pathname}`, { ...init, headers: { ...auth, ...init.headers }, signal: AbortSignal.timeout(timeout) });
    const text = await res.text();
    if (!res.ok) throw new Error(`kimi ${pathname}: HTTP ${res.status} ${text.slice(0, 300)}`);
    return text;
  }
  return {
    model,
    /** Chat completion. With json: true the answer is parsed as a JSON object. */
    async chat(messages, { json = false } = {}) {
      const body = { model, messages, ...(json && { response_format: { type: 'json_object' } }) };
      const out = JSON.parse(await call('/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
      const content = out.choices?.[0]?.message?.content || '';
      if (!json) return content;
      try { return JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { throw new Error('la IA no devolvió JSON válido'); }
    },
    /** Text of a PDF or image (OCR), through Moonshot's file-extract. The uploaded file is deleted afterwards. */
    async fileText(buffer, name, type) {
      const form = new FormData();
      form.append('file', new Blob([buffer], { type: type || 'application/octet-stream' }), name || 'archivo');
      form.append('purpose', 'file-extract');
      const { id } = JSON.parse(await call('/files', { method: 'POST', body: form }));
      try {
        const raw = await call(`/files/${id}/content`, { method: 'GET' });
        try { return JSON.parse(raw).content || ''; } catch { return raw; }
      } finally { call(`/files/${id}`, { method: 'DELETE' }).catch(() => null); }
    },
  };
}

// ------------------------------------------------------------------ what the AI knows about the trip
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] != null && o[k] !== '').map((k) => [k, o[k]]));
const short = (s, n = 140) => (typeof s === 'string' && s.length > n ? s.slice(0, n) + '…' : s);

/** A compact view of the trip for the prompt: what exists (ids!) and one sample record per collection (the shape). */
export function tripContext(files) {
  const trip = files['trip.json'], days = files['itinerary.json']?.days || [];
  const places = (trip.placeFiles || ['places.json']).flatMap((f) => files[f] || []);
  const list = (f) => files[f] || [];
  const sample = (arr) => (arr[0] ? Object.fromEntries(Object.entries(arr[0]).map(([k, v]) => [k, short(v, 80)])) : null);
  return {
    trip: { ...pick(trip, ['id', 'title', 'description', 'start', 'end', 'locale']), home: trip.home, cities: (trip.cities || []).map((c) => pick(c, ['id', 'name', 'tz'])) },
    days: days.map((d) => ({ ...pick(d, ['id', 'n', 'date', 'cityId', 'title']), activities: (d.activities || []).map((a) => pick(a, ['id', 'start', 'end', 'title', 'placeId', 'reservation', 'status'])) })),
    transport: list('transport.json').map((t) => pick(t, ['id', 'date', 'day', 'route', 'kind', 'service', 'depart', 'arrive', 'status', 'code'])),
    lodging: list('lodging.json').map((l) => pick(l, ['id', 'cityId', 'name', 'area', 'checkIn', 'checkOut', 'status', 'confirmation'])),
    documents: list('documents.json').map((d) => pick(d, ['id', 'type', 'title', 'status'])),
    places: places.map((p) => pick(p, ['id', 'name', 'cityId', 'category'])),
    samples: {
      transport: sample(list('transport.json')), lodging: sample(list('lodging.json')), documents: sample(list('documents.json')),
      activities: days.find((d) => d.activities?.length) ? { ...sample(days.find((d) => d.activities?.length).activities), dayId: '<id del día>' } : null,
      places: sample(places), resources: sample(list('resources.json')),
    },
  };
}

export const CHANGE_RULES = `Formato de cada cambio (es lo único que puede modificar el viaje):
{ "op": "put" | "patch" | "del", "col": "<colección>", "id": "<id>", "data": { ... }, "label": "<frase corta en castellano rioplatense>" }
- Colecciones: ${Object.keys(COLS).join(', ')}.
- "patch" agrega o cambia campos de un registro que ya existe (preferilo). "put" crea uno nuevo con todos sus campos. "del" lo borra.
- Respetá la forma de los registros de ejemplo (mismos nombres de campo). Fechas AAAA-MM-DD; horas HH:MM en la hora local del lugar.
- Las actividades llevan "dayId" con el id del día. Un id nuevo: corto, en minúsculas, con prefijo de la colección (ej. "l-hanting-bund", "t-mu746").
- "label" describe el cambio para que la persona lo confirme, ej. "Marcar el vuelo MU746 como reservado".
- No inventes datos: si algo no está en el texto, no lo pongas.`;

/**
 * Reads a shared confirmation and proposes what to do with it.
 * item: { title, text, url, files: [{ name, type, data: Buffer }] }
 * Returns { kind, summary, target: { key, code, link }, changes, warnings, model }.
 */
export async function extract(ai, files, item) {
  let text = [item.title, item.text, item.url && `Link: ${item.url}`].filter(Boolean).join('\n\n');
  for (const f of item.files || []) {
    try { text += `\n\n--- Archivo: ${f.name} ---\n${await ai.fileText(f.data, f.name, f.type)}`; }
    catch (e) { text += `\n\n--- Archivo: ${f.name} (no se pudo leer: ${e.message}) ---`; }
  }
  text = text.slice(0, 60000);
  if (!text.trim()) throw new Error('no hay texto para leer');
  const ctx = tripContext(files);
  const system = `Sos el asistente de una app de viaje. Te pasan algo que la persona compartió (un mail de confirmación, un PDF, una captura o un link) y tenés que decir qué es y dónde va dentro del viaje.

Datos actuales del viaje (JSON):
${JSON.stringify(ctx)}

${CHANGE_RULES}

Respondé SOLO un objeto JSON con esta forma:
{
  "kind": "vuelo" | "tren" | "bus" | "hotel" | "entrada" | "documento" | "otro",
  "summary": "<una o dos frases: qué es, para cuándo y qué proponés>",
  "target": { "key": "transport:<id>" | "lodging:<id>" | "activity:<id>" | "doc:<id>" | "resource" | null, "code": "<código de reserva o null>", "link": "<link para ver la reserva o null>" },
  "changes": [ <cambios> ]
}
- target.key es dónde se guarda el archivo y el código: el registro que corresponde (existente, o el que creás en "changes"). "resource" si es material útil que no es una reserva. null si no corresponde a nada.
- Si ya existe el registro (mismo vuelo, mismo hotel por fechas y ciudad, misma entrada), usalo y proponé "patch" con lo que el texto confirma (status "reservado", horarios, nombre real del hotel, dirección…). Un alojamiento "a reservar" que coincide en ciudad y fechas es el mismo: actualizalo.
- Si no existe, proponé "put" para crearlo.
- El código va en target.code, no en "changes" (se guarda aparte, cifrado en el celular).
- Si no hace falta cambiar nada, "changes": [].`;
  const out = await ai.chat([{ role: 'system', content: system }, { role: 'user', content: text }], { json: true });
  const proposed = Array.isArray(out.changes) ? out.changes : [];
  // keep only what would pass the admin API, and say why the rest was dropped
  const changes = [], warnings = [];
  for (const ch of proposed) {
    const res = resolveBatch(files, [...changes, ch]);
    if (res.error) warnings.push(`Se descartó "${ch?.label || `${ch?.op} ${ch?.col}/${ch?.id}`}": ${res.error}`);
    else changes.push(ch);
  }
  const t = out.target || {};
  return {
    kind: String(out.kind || 'otro'), summary: String(out.summary || ''),
    target: { key: typeof t.key === 'string' && /^(transport|lodging|activity|doc):[\w.:-]+$|^resource$/.test(t.key) ? t.key : null, code: t.code ? String(t.code).trim().slice(0, 60) : '', link: t.link ? String(t.link).trim().slice(0, 500) : '' },
    changes, warnings, model: ai.model,
  };
}
