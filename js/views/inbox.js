// "Compartido": what arrives from other apps (Android share sheet → manifest share_target → sw.js) or is pasted here
// by hand (iOS has no share target): a confirmation email, a PDF, a screenshot, a link. Each item waits in the inbox
// until it is saved where it belongs: the ticket of a transport / lodging / activity / document, or a new resource.
// The inbox lives in Cache Storage ("travell-inbox"), the only storage the service worker and the page both reach
// without knowing which trip is open.
import { D, I, cols, idb } from '../store.js';
import { esc, ic, uid, toast, fmtShort } from '../util.js';
import { register } from '../ui.js';
import { ticketOf, hasTicket } from '../ticket.js';
import { uploadSoon } from '../upload.js';
import { guessCode, guessTarget, firstUrl } from '../guess.js';

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
// ------------------------------------------------------------------ view
function itemCard(item) {
  const groups = targets(), sel = guessTarget(item, groups);
  const code = guessCode(`${item.title}\n${item.text}`), link = item.url || firstUrl(item.text);
  return `<article class="card" data-inbox="${esc(item.id)}">
    <div class="card-head"><h3>${ic('inbox')} ${esc(item.title || item.files[0]?.name || 'Sin título')}</h3><small class="muted">${esc(new Date(item.at).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</small></div>
    ${item.text ? `<details><summary>Texto (${item.text.length} caracteres)</summary><p class="note-line pre">${esc(item.text.slice(0, 4000))}</p></details>` : ''}
    ${item.files.length ? `<ul class="links">${item.files.map((f) => `<li>${ic(f.type.startsWith('image/') ? 'image' : 'file-lines')} ${esc(f.name)}</li>`).join('')}</ul>` : ''}
    <form class="form" data-submit="inbox-save"><input type="hidden" name="id" value="${esc(item.id)}">
      <label class="field">Guardar en<select name="key" required><option value="">Elegí dónde va…</option>
        ${groups.map(([g, opts]) => `<optgroup label="${esc(g)}">${opts.map(([k, l]) => `<option value="${esc(k)}" ${k === sel ? 'selected' : ''}>${esc(l)}</option>`).join('')}</optgroup>`).join('')}
        <option value="resource">Nuevo recurso (guía, mapa, enlace…)</option></select></label>
      <label class="field">Código de reserva<input name="code" value="${esc(code)}" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Opcional"></label>
      <label class="field">Link a la reserva<input name="link" type="url" value="${esc(link)}" placeholder="Opcional"></label>
      ${code || sel ? '<p class="hint">El código y el destino son una sugerencia a partir del texto: revisalos antes de guardar.</p>' : ''}
      <div class="row-actions"><button class="btn primary" type="submit">Guardar</button><button class="btn danger" type="button" data-act="inbox-del" data-id="${esc(item.id)}">Descartar</button></div></form>
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
    <p class="muted">Confirmaciones de vuelos, hoteles y entradas para guardar donde corresponden. En Android, compartí el mail o el PDF a <b>Travell</b> desde cualquier app (con la app instalada). En iPhone, o desde la compu, pegalo acá.</p></header>
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
  'inbox-save': async (form, _, app) => {
    const f = new FormData(form), g = (k) => (f.get(k) || '').toString().trim();
    const item = (await readIndex()).find((x) => x.id === g('id'));
    if (!item) return app.rerender();
    let key = g('key');
    const code = g('code').toUpperCase(), link = g('link');
    if (!key) return toast('Elegí dónde guardarlo');
    if (key === 'resource') {
      const id = uid('r');
      cols.put('resources', { id, title: item.title || item.files[0]?.name || 'Recurso', kind: 'otro', cityId: null, url: link || null, notes: item.text || null });
      key = `res:${id}`;
    } else if (key.startsWith('lodging:')) {
      const { edited, ...l } = I.lodging[key.slice(8)];
      cols.put('lodging', { ...l, ...(code && { confirmation: code }), ...(link && { bookingUrl: link }) });
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
    } catch { return toast('No se pudieron guardar los archivos'); }
    await removeItem(item);
    toast('Guardado'); app.rerender();
  },
});
