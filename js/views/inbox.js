// "Compartido": what arrives from other apps (Android share sheet → manifest share_target → sw.js) or is pasted here
// by hand (iOS has no share target): a confirmation email, a PDF, a screenshot, a link. Each item waits in the inbox
// until it is saved where it belongs: the ticket of a transport / lodging / activity / document, or a new resource.
// The inbox lives in Cache Storage ("travell-inbox"), the only storage the service worker and the page both reach
// without knowing which trip is open.
// With the admin key, "Leer con IA" sends the item to the server (POST /v1/ai/extract): the AI says what it is and
// proposes changes to the trip (e.g. turn "Hotel a reservar" into the real hotel). Nothing changes until the person
// taps Aplicar; then the changes go through the admin API and the code / files are saved like a manual save.
import { D, I, cols, idb } from '../store.js';
import { esc, ic, uid, toast, fmtShort } from '../util.js';
import { register } from '../ui.js';
import { ticketOf, hasTicket } from '../ticket.js';
import { uploadSoon } from '../upload.js';
import { guessCode, guessTarget, firstUrl } from '../guess.js';
import { isAdmin, adminFetch, applyChanges, fileToBase64 } from '../admin.js';

const INBOX = 'travell-inbox';
const at = (path) => new URL(`inbox/${path}`, new URL('.', location.href)).href;   // same keys sw.js writes

async function readIndex() {
  try { return (await (await caches.open(INBOX)).match(at('index')))?.json() ?? []; } catch { return []; }
}
async function writeIndex(items) { await (await caches.open(INBOX)).put(at('index'), new Response(JSON.stringify(items), { headers: { 'content-type': 'application/json' } })); }
export const inboxCount = async () => (await readIndex()).length;

/** Same shape sw.js stores: { id, at, title, text, url, files: [{ path, name, type }] }. */
async function addToInbox({ title = '', text = '', url = '', files = [] }) {
  const c = await caches.open(INBOX), id = uid('in');
  const list = [];
  for (const [i, f] of files.entries()) {
    const path = `${id}/${i}`;
    await c.put(at(path), new Response(f, { headers: { 'content-type': f.type || 'application/octet-stream' } }));
    list.push({ path, name: f.name || `archivo-${i + 1}`, type: f.type || 'application/octet-stream' });
  }
  await writeIndex([...(await readIndex()), { id, at: Date.now(), title, text, url, files: list }]);
}
async function removeItem(item) {
  const c = await caches.open(INBOX);
  for (const f of item.files) await c.delete(at(f.path));
  await writeIndex((await readIndex()).filter((x) => x.id !== item.id));
}
async function blobOf(f) { const r = await (await caches.open(INBOX)).match(at(f.path)); return r ? new File([await r.blob()], f.name, { type: f.type }) : null; }

function targets() {
  const acts = D.days.flatMap((d) => d.activities.filter((a) => a.reservation || ticketOf(`activity:${a.id}`)).map((a) => [`activity:${a.id}`, `${a.title} · día ${d.n}`, a.title]));
  return [
    ['Pasajes', D.transport.filter(hasTicket).map((t) => [`transport:${t.id}`, `${t.route}${t.service ? ' · ' + t.service : ''}`, `${t.route} ${t.service || ''} ${t.code || ''}`])],
    ['Alojamientos', D.lodging.map((l) => [`lodging:${l.id}`, `${l.name} · ${fmtShort(l.checkIn)}`, `${l.name} ${l.area || ''}`])],
    ['Entradas y reservas', acts],
    ['Documentos', D.documents.map((d) => [`doc:${d.id}`, d.title, d.title])],
  ].filter(([, opts]) => opts.length);
}
// ------------------------------------------------------------------ AI proposal
const proposals = new Map();   // inbox item id -> proposal from /v1/ai/extract
const KIND_IC = { vuelo: 'plane', tren: 'train', bus: 'bus', hotel: 'hotel', entrada: 'ticket', documento: 'file-lines', otro: 'inbox' };
function targetLabel(key, changes) {
  if (!key) return null;
  if (key === 'resource') return 'un recurso nuevo';
  const [kind, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
  const made = changes.find((c) => c.id === id && c.op === 'put');
  const rec = kind === 'transport' ? D.transport.find((t) => t.id === id) : kind === 'lodging' ? I.lodging[id] : kind === 'activity' ? I.activity[id] : I.doc[id];
  const name = rec ? rec.route || rec.name || rec.title : made ? made.data?.name || made.data?.route || made.data?.title || id : id;
  return `${{ transport: 'el pasaje', lodging: 'el alojamiento', activity: 'la actividad', doc: 'el documento' }[kind] || ''} “${name}”${made && !rec ? ' (nuevo)' : ''}`;
}
function proposalHtml(item, p) {
  const where = targetLabel(p.target.key, p.changes);
  return `<div class="ai-box">
    <p class="ai-head">${ic(KIND_IC[p.kind] || 'wand-magic-sparkles')} <b>${esc(p.summary || 'Esto encontró la IA')}</b></p>
    ${p.changes.length ? `<p class="hint">Cambios en el viaje (para todos):</p><ul class="ai-changes">${p.changes.map((c) => `<li>${ic(c.op === 'del' ? 'trash' : c.op === 'put' ? 'plus' : 'pen')} ${esc(c.label || `${c.op} ${c.col}/${c.id}`)}</li>`).join('')}</ul>` : '<p class="hint">No hace falta cambiar el viaje.</p>'}
    ${where ? `<p class="hint">Se guarda en ${esc(where)}${p.target.code ? ` con el código <b>${esc(p.target.code)}</b>` : ''}${item.files.length ? `, con ${item.files.length === 1 ? 'el archivo' : `los ${item.files.length} archivos`}` : ''}.</p>` : ''}
    ${p.warnings.map((w) => `<p class="hint warn-line">${ic('triangle-exclamation')} ${esc(w)}</p>`).join('')}
    <div class="row-actions"><button class="btn primary" data-act="inbox-ai-apply" data-id="${esc(item.id)}">${ic('check')} Aplicar</button>
      <button class="btn" data-act="inbox-ai-drop" data-id="${esc(item.id)}">No, lo hago a mano</button></div></div>`;
}

// ------------------------------------------------------------------ view
function itemCard(item) {
  const groups = targets(), sel = guessTarget(item, groups);
  const code = guessCode(`${item.title}\n${item.text}`), link = item.url || firstUrl(item.text);
  return `<article class="card" data-inbox="${esc(item.id)}">
    <div class="card-head"><h3>${ic('inbox')} ${esc(item.title || item.files[0]?.name || 'Sin título')}</h3><small class="muted">${esc(new Date(item.at).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</small></div>
    ${item.text ? `<details><summary>Texto (${item.text.length} caracteres)</summary><p class="note-line pre">${esc(item.text.slice(0, 4000))}</p></details>` : ''}
    ${item.files.length ? `<ul class="links">${item.files.map((f) => `<li>${ic(f.type.startsWith('image/') ? 'image' : 'file-lines')} ${esc(f.name)}</li>`).join('')}</ul>` : ''}
    ${proposals.has(item.id) ? proposalHtml(item, proposals.get(item.id)) : isAdmin() ? `<div class="row-actions" id="ai-${esc(item.id)}"><button class="btn primary" data-act="inbox-ai" data-id="${esc(item.id)}">${ic('wand-magic-sparkles')} Leer con IA</button><span class="hint">Dice qué es y lo guarda donde va (o lo crea).</span></div>` : ''}
    <details class="manual" ${proposals.has(item.id) || isAdmin() ? '' : 'open'}><summary>Guardar a mano</summary>
    <form class="form" data-submit="inbox-save"><input type="hidden" name="id" value="${esc(item.id)}">
      <label class="field">Guardar en<select name="key" required><option value="">Elegí dónde va…</option>
        ${groups.map(([g, opts]) => `<optgroup label="${esc(g)}">${opts.map(([k, l]) => `<option value="${esc(k)}" ${k === sel ? 'selected' : ''}>${esc(l)}</option>`).join('')}</optgroup>`).join('')}
        <option value="resource">Nuevo recurso (guía, mapa, enlace…)</option></select></label>
      <label class="field">Código de reserva<input name="code" value="${esc(code)}" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Opcional"></label>
      <label class="field">Link a la reserva<input name="link" type="url" value="${esc(link)}" placeholder="Opcional"></label>
      ${code || sel ? '<p class="hint">El código y el destino son una sugerencia a partir del texto: revisalos antes de guardar.</p>' : ''}
      <div class="row-actions"><button class="btn primary" type="submit">Guardar</button><button class="btn danger" type="button" data-act="inbox-del" data-id="${esc(item.id)}">Descartar</button></div></form></details>
  </article>`;
}

export function render(_, ctx) {
  ctx.title = 'Compartido';
  ctx.after(async () => {
    const el = document.getElementById('inbox'), items = await readIndex();
    // a shared .eml or .txt carries the email in a file: read it so the code and destination can be guessed
    for (const it of items) if (!it.text) {
      const f = it.files.find((x) => /^text\/|rfc822/.test(x.type) || /\.(eml|txt)$/i.test(x.name));
      if (f) it.text = (await (await blobOf(f))?.text() || '').slice(0, 20000);
    }
    if (el) el.innerHTML = items.length ? items.slice().reverse().map(itemCard).join('') : '<p class="muted">No hay nada pendiente.</p>';
  });
  return `<header class="pagehead"><h1>${ic('inbox')} Compartido</h1>
    <p class="muted">La bandeja de entrada de confirmaciones: mails de vuelos, hoteles y entradas, PDFs o capturas. Cada una queda acá hasta que la guardás en su pasaje, hotel o entrada (con el código y el archivo).</p>
    <ol class="steps"><li><b>Mandala:</b> en Android, Compartir → <b>Travell</b> desde Gmail o cualquier app (con la app instalada). En iPhone o la compu, pegala abajo.</li>
      <li><b>Guardala:</b> ${isAdmin() ? '“Leer con IA” dice qué es y propone dónde va, o crea el hotel o pasaje si no existe. También podés elegirlo a mano.' : 'elegí dónde va; el código y el destino se sugieren solos. Con la clave de administrador (Ajustes) la IA lo hace por vos.'}</li></ol></header>
  <div id="inbox"><p class="muted">…</p></div>
  <details class="card"><summary>${ic('paste')} Pegar una confirmación</summary>
    <form class="form" data-submit="inbox-add">
      <label class="field">Texto del mail<textarea name="text" rows="6" placeholder="Pegá el mail de confirmación"></textarea></label>
      <label class="field">Link (opcional)<input name="url" type="url" placeholder="https://…"></label>
      <label class="field">PDF o capturas (opcional)<input name="files" type="file" accept="image/*,application/pdf" multiple></label>
      <div class="row-actions"><button class="btn primary" type="submit">Agregar</button></div></form></details>`;
}

register({
  'inbox-add': async (form, _, app) => {
    const f = new FormData(form), text = (f.get('text') || '').toString().trim(), url = (f.get('url') || '').toString().trim();
    const files = [...form.querySelector('input[type=file]').files];
    if (!text && !url && !files.length) return toast('Pegá un texto, un link o elegí un archivo');
    await addToInbox({ title: text.split('\n').find((l) => l.trim())?.trim().slice(0, 80) || '', text, url, files });
    app.rerender();
  },
  'inbox-del': async (el, _, app) => {
    const item = (await readIndex()).find((x) => x.id === el.dataset.id);
    if (item && confirm('¿Descartar lo compartido?')) { await removeItem(item); app.rerender(); }
  },
  'inbox-ai': async (el, _, app) => {
    const item = (await readIndex()).find((x) => x.id === el.dataset.id);
    if (!item) return app.rerender();
    el.disabled = true; el.innerHTML = `${ic('spinner')} Leyendo…`;
    try {
      const files = [];
      for (const f of item.files) {
        const blob = await blobOf(f);
        if (blob && blob.size <= 8 * 1024 * 1024) files.push({ name: f.name, type: f.type, data: await fileToBase64(blob) });
      }
      proposals.set(item.id, await adminFetch('/v1/ai/extract', { method: 'POST', body: { title: item.title, text: item.text, url: item.url, files } }));
    } catch (e) { toast(e.status === 401 ? 'La clave de administrador no es válida' : `No se pudo leer: ${e.message}`); }
    app.rerender();
  },
  'inbox-ai-drop': (el, _, app) => { proposals.delete(el.dataset.id); app.rerender(); },
  'inbox-ai-apply': async (el, _, app) => {
    const item = (await readIndex()).find((x) => x.id === el.dataset.id), p = proposals.get(el.dataset.id);
    if (!item || !p) return app.rerender();
    el.disabled = true;
    try {
      if (p.changes.length) await applyChanges(p.changes, { note: `Compartido: ${item.title || item.files[0]?.name || ''}`.slice(0, 120) });
    } catch (e) { el.disabled = false; return toast(`No se aplicó: ${e.message}`); }
    proposals.delete(item.id);
    const key = p.target.key, gone = key && key !== 'resource' && !targetExists(key);
    if (key && !gone) { await saveTo(item, key, p.target.code.toUpperCase(), p.target.link); toast('Listo: guardado y viaje actualizado'); }
    else if (!item.files.length && !p.target.code) { await removeItem(item); toast('Viaje actualizado'); }
    else toast('Viaje actualizado. Elegí dónde guardar el archivo o el código');
    app.rerender();
  },
  'inbox-save': async (form, _, app) => {
    const f = new FormData(form), g = (k) => (f.get(k) || '').toString().trim();
    const item = (await readIndex()).find((x) => x.id === g('id'));
    if (!item) return app.rerender();
    const key = g('key');
    if (!key) return toast('Elegí dónde guardarlo');
    if (await saveTo(item, key, g('code').toUpperCase(), g('link'))) toast('Guardado');
    app.rerender();
  },
});

const targetExists = (key) => {
  const id = key.slice(key.indexOf(':') + 1);
  return key.startsWith('transport:') ? D.transport.some((t) => t.id === id) : key.startsWith('lodging:') ? !!I.lodging[id] : key.startsWith('activity:') ? !!I.activity[id] : !!I.doc[id];
};

/** Saves an inbox item where it belongs: code / link on the ticket (or the lodging), files attached. Returns true if done. */
async function saveTo(item, key, code, link) {
  if (key === 'resource') {
    const id = uid('r');
    cols.put('resources', { id, title: item.title || item.files[0]?.name || 'Recurso', kind: 'otro', cityId: null, url: link || null, notes: item.text || null });
    key = `res:${id}`;
  } else if (key.startsWith('lodging:')) {
    // only the fields we set: a full copy in the overlay would hide later changes to this hotel made on the server
    const id = key.slice(8), prev = cols.map('lodging')[id] || { id };
    if (code || link) cols.put('lodging', { ...prev, ...(code && { confirmation: code }), ...(link && { bookingUrl: link }) });
  } else {
    const doc = key.startsWith('doc:') ? I.doc[key.slice(4)] : null;
    const noCode = doc && doc.codeLabel === null;
    if ((code && !noCode) || link) cols.put('tickets', { ...(ticketOf(key) || { id: key }), ...(code && !noCode && { code }), ...(link && { link }) });
  }
  try {
    for (const file of item.files) {
      const blob = await blobOf(file);
      if (blob) await idb.put('files', { id: uid('fi'), docId: key, name: file.name, type: file.type, blob, addedAt: Date.now() });
    }
    if (item.files.length) { navigator.storage?.persist?.(); uploadSoon(); }
  } catch { toast('No se pudieron guardar los archivos'); return false; }
  await removeItem(item);
  return true;
}
