// Booking proof ("comprobante") attached to something already modeled: a transport (boarding pass), an activity
// (entry ticket), a lodging (booking confirmation) or a document that is not modeled anywhere else (visa, insurance).
// It holds a booking code, QR codes read with the camera, a link to the booking and attached files.
//   key = "<kind>:<id>"  (transport:t01, activity:A052, lodging:l03, doc:doc04, passport:<traveler>)
// Code / QRs / link live in the synced "tickets" collection; attached files live in IndexedDB ("files", docId = key)
// and are uploaded to R2 by upload.js.
import { D, I, cols, idb, kv, me } from './store.js';
import { esc, ic, uid, toast, openModal, closeModal, download, extLink } from './util.js';
import { scanCode, qrSvg } from './qr.js';
import { uploadSoon, removeRemote } from './upload.js';

export const ticketOf = (key) => { const r = cols.map('tickets')[key]; return r && !r.deleted ? r : null; };
const save = (key, patch) => cols.put('tickets', { ...(ticketOf(key) || { id: key }), ...patch });
const FORMAT = { qr_code: 'QR', aztec: 'Aztec', pdf417: 'PDF417', data_matrix: 'Data Matrix' };

/** Booking code of something: what was typed in the app, or what the JSON says. */
export const ticketCode = (key, fallback = '') => ticketOf(key)?.code ?? fallback ?? '';

/**
 * The proof box. Options: code (JSON value used until one is typed), codeLabel, noCode (the entity has its own field,
 * e.g. lodging.confirmation), noLink (same, lodging.bookingUrl), title (for dialogs).
 */
export function ticketBox(key, { code: jsonCode = '', codeLabel = 'Código de reserva', noCode = false, noLink = false, title = '' } = {}) {
  const t = ticketOf(key) || {}, code = noCode ? '' : ticketCode(key, jsonCode), qrs = t.qrs || [];
  const k = esc(key), lbl = esc(codeLabel), ttl = esc(title);
  return `<div class="ticket" data-ticket="${k}">
    ${code ? `<div class="codebox"><small>${lbl}</small>
      <button class="code" data-act="tk-big" data-key="${k}" data-label="${lbl}" data-title="${ttl}" aria-label="Mostrar código en grande">${esc(code)}</button></div>` : ''}
    ${qrs.length ? `<div class="qr-list">${qrs.map((q) => `<button class="btn small qr-btn" data-act="tk-qr" data-key="${k}" data-q="${esc(q.id)}" data-title="${ttl}">
      ${ic('qrcode')} ${esc(q.label || FORMAT[q.format] || 'QR')}</button>`).join('')}</div>` : ''}
    ${t.link && !noLink ? `<p class="ticket-link">${extLink(t.link, 'Ver la reserva')}</p>` : ''}
    <div class="attach" data-attach="${k}"></div>
    <div class="row-actions ticket-actions">
      ${noCode && noLink ? '' : `<button class="btn small" data-act="tk-edit" data-key="${k}" data-label="${lbl}" data-title="${ttl}" data-nocode="${noCode ? 1 : ''}" data-code="${esc(jsonCode || '')}">
        ${ic(code || t.link ? 'pen' : 'plus')} ${noCode ? 'Link' : code || t.link ? 'Código y link' : 'Cargar código o link'}</button>`}
      <button class="btn small" data-act="tk-scan" data-key="${k}" data-title="${ttl}">${ic('qrcode')} Escanear QR</button>
      <label class="btn small">${ic('paperclip')} Adjuntar<input type="file" accept="image/*,application/pdf" multiple hidden data-change="doc-attach" data-id="${k}"></label>
    </div></div>`;
}

/** Transports that need a ticket: booked or to buy (not a taxi on the spot), or that already have one. */
export const hasTicket = (t) => !!t.status || !!ticketOf(`transport:${t.id}`);
export const transportTicket = (t) => ticketBox(`transport:${t.id}`, { code: t.code, codeLabel: t.kind === 'vuelo' ? 'Código de reserva (PNR)' : 'Código de reserva', title: t.route });

// ------------------------------------------------------------------ attached files (shared by every view that shows a ticket box)
const urls = [];
export const blobUrl = (b) => { const u = URL.createObjectURL(b); urls.push(u); return u; };
export const freeUrls = () => { while (urls.length) URL.revokeObjectURL(urls.pop()); };

export async function paintAttachments() {
  freeUrls();
  let files = [];
  try { files = await idb.all('files'); } catch { return; }
  document.querySelectorAll('[data-attach]').forEach((box) => {
    const mine = files.filter((f) => f.docId === box.dataset.attach).sort((a, b) => a.addedAt - b.addedAt);
    box.innerHTML = mine.map((f) => f.type.startsWith('image/')
      ? `<figure class="att"><button data-act="att-open" data-id="${f.id}" aria-label="Abrir ${esc(f.name)}"><img alt="${esc(f.name)}" src="${blobUrl(f.blob)}"></button><figcaption>${esc(f.name)} <button class="btn tiny danger" data-act="att-del" data-id="${f.id}" aria-label="Quitar archivo">${ic('xmark')}</button></figcaption></figure>`
      : `<div class="att file"><button class="btn small" data-act="att-open" data-id="${f.id}">${ic('file-lines')} ${esc(f.name)}</button> <button class="btn tiny danger" data-act="att-del" data-id="${f.id}" aria-label="Quitar archivo">${ic('xmark')}</button></div>`).join('');
  });
}
const imagesOf = async (key) => (await idb.all('files')).filter((f) => f.docId === key && f.type.startsWith('image/'));
async function addFile(key, blob, name) {
  await idb.put('files', { id: uid('fi'), docId: key, name, type: blob.type || 'application/octet-stream', blob, addedAt: Date.now() });
}

const travelerOptions = (cur) => `<option value="">Para todos / sin nombre</option>${D.travelers.map((t) => `<option value="${esc(t.name)}" ${t.name === cur ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}`;

export const ticketActions = {
  'tk-edit': (el) => {
    const { key, label, title, nocode, code } = el.dataset, t = ticketOf(key) || {};
    const dlg = openModal(`<h3>${esc(title || 'Reserva')}</h3><form class="form" data-submit="tk-save"><input type="hidden" name="key" value="${esc(key)}">
      ${nocode ? '' : `<label class="field">${esc(label)}<input name="code" value="${esc(ticketCode(key, code))}" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>`}
      <label class="field">Link a la reserva o al pasaje<input name="link" type="url" placeholder="https://" value="${esc(t.link || '')}"></label>
      <p class="hint">Por ejemplo la reserva en la web o app de la aerolínea, Booking, Trip.com o el mail de confirmación.</p>
      <div class="row-actions"><button class="btn primary" type="submit">Guardar</button><button class="btn" type="button" data-act="close-modal">Cancelar</button></div></form>`);
    dlg.querySelector('input')?.focus();
  },
  'tk-save': (form, _, app) => {
    const f = new FormData(form), patch = { link: (f.get('link') || '').toString().trim() || null };
    if (f.has('code')) patch.code = f.get('code').toString().trim().toUpperCase();
    save(f.get('key'), patch); closeModal(form); app.rerender();
  },
  'tk-scan': async (el) => {
    const { key, title } = el.dataset;
    const r = await scanCode({ title: title ? `QR · ${title}` : 'Escanear QR' });
    if (!r) return;
    const preview = r.format === 'qr_code' ? await qrSvg(r.text).catch(() => '') : '';
    const mine = I.traveler[me()]?.name || '';
    openModal(`<h3>${ic('qrcode')} Código leído</h3>
      ${preview ? `<div class="qr-big small">${preview}</div>` : `<p class="hint">Es un código ${esc(FORMAT[r.format] || r.format)}: se guarda la foto para mostrarla.</p>`}
      <p class="qr-text">${esc(r.text.length > 140 ? r.text.slice(0, 137) + '…' : r.text)}</p>
      <form class="form" data-submit="tk-qr-save"><label class="field">¿De quién es?<select name="label">${travelerOptions(mine)}</select></label>
        <div class="row-actions"><button class="btn primary" type="submit">Guardar</button><button class="btn" type="button" data-act="close-modal">Descartar</button></div></form>`);
    pendingScan = { key, r };
  },
  'tk-qr-save': async (form, _, app) => {
    if (!pendingScan) return;
    const { key, r } = pendingScan; pendingScan = null;
    const label = new FormData(form).get('label') || '';
    const q = { id: uid('qr'), text: r.text, format: r.format, label, addedAt: Date.now() };
    if (r.image) { q.fileId = uid('fi'); await idb.put('files', { id: q.fileId, docId: key, name: `codigo-${label || 'scan'}.jpg`, type: 'image/jpeg', blob: r.image, addedAt: Date.now() }); uploadSoon(); }
    save(key, { qrs: [...(ticketOf(key)?.qrs || []), q] });
    closeModal(form); toast('Código guardado: se muestra sin internet'); app.rerender();
  },
  'tk-qr': async (el) => {
    const { key, q: qid, title } = el.dataset, q = (ticketOf(key)?.qrs || []).find((x) => x.id === qid);
    if (!q) return;
    let img = '';
    if (q.format === 'qr_code') img = `<div class="qr-big">${await qrSvg(q.text)}</div>`;
    else if (q.fileId) { const f = await idb.get('files', q.fileId); if (f) img = `<img class="lightbox" alt="Código" src="${blobUrl(f.blob)}">`; }
    openModal(`<h3>${esc(title || 'Código')}${q.label ? ` · ${esc(q.label)}` : ''}</h3>${img}
      <p class="hint center">${ic('sun')} Subí el brillo de la pantalla para que lo lea el escáner.</p>
      <details><summary>Contenido del código</summary><p class="qr-text">${esc(q.text)}</p></details>
      <div class="row-actions"><button class="btn" data-act="copy" data-text="${esc(q.text)}">Copiar</button>
        <button class="btn danger" data-act="tk-qr-del" data-key="${esc(key)}" data-q="${esc(q.id)}">Quitar</button><button class="btn" data-act="close-modal">Cerrar</button></div>`, { cls: 'wide bigmodal qr-modal' });
  },
  'tk-qr-del': async (el, _, app) => {
    if (!confirm('¿Quitar este código?')) return;
    const { key, q: qid } = el.dataset, t = ticketOf(key), q = t?.qrs?.find((x) => x.id === qid);
    if (q?.fileId) { removeRemote(await idb.get('files', q.fileId)); await idb.del('files', q.fileId); }
    save(key, { qrs: (t?.qrs || []).filter((x) => x.id !== qid) });
    closeModal(el); app.rerender();
  },
  'tk-big': async (el) => {
    const { key, label, title } = el.dataset, code = el.textContent.trim();
    const files = await imagesOf(key);
    openModal(`<h3>${esc(title || 'Reserva')}</h3><small>${esc(label || 'Código')}</small>
      <div class="bigcode">${esc(code).split('').map((c) => `<span>${esc(c)}</span>`).join('')}</div>
      ${files.map((f) => `<img class="lightbox" alt="${esc(f.name)}" src="${blobUrl(f.blob)}">`).join('')}
      <div class="row-actions"><button class="btn" data-act="copy" data-text="${esc(code)}">Copiar</button><button class="btn" data-act="close-modal">Cerrar</button></div>`, { cls: 'wide bigmodal' });
  },
  'doc-attach': async (el, _, app) => {
    const files = [...el.files]; el.value = '';
    navigator.storage?.persist?.();
    try {
      for (const f of files) await addFile(el.dataset.id, f, f.name);
      toast(`${files.length} archivo${files.length > 1 ? 's' : ''} guardado${files.length > 1 ? 's' : ''}`);
      uploadSoon();
    } catch { toast('No se pudo guardar el archivo'); }
    app.rerender();
  },
  'att-open': async (el) => {
    const f = await idb.get('files', el.dataset.id);
    if (!f) return;
    if (f.type.startsWith('image/')) openModal(`<img class="lightbox" alt="${esc(f.name)}" src="${blobUrl(f.blob)}"><div class="row-actions"><button class="btn" data-act="close-modal">Cerrar</button></div>`, { cls: 'wide bigmodal' });
    else window.open(blobUrl(f.blob), '_blank') || download(f.name, f.blob);
  },
  'att-del': async (el, _, app) => {
    if (!confirm('¿Quitar este archivo?')) return;
    removeRemote(await idb.get('files', el.dataset.id));
    await idb.del('files', el.dataset.id); app.rerender();
  },
};
let pendingScan = null;

// ------------------------------------------------------------------ one-time move of the old "documents"
// Until 2026-10 tickets, entries, hotel bookings and the passport were documents (documents.json). They now belong to
// the transport / activity / lodging / traveler they describe; codes typed on a device and attached files move along.
const MOVED = {
  doc01: 'transport:t01', doc02: 'transport:t21', doc03: 'transport:t04', doc07: 'lodging:l03', doc08: 'lodging:l05',
  doc09: 'activity:A052', doc10: 'activity:A047', doc11: 'activity:A106', doc12: 'activity:A016', doc13: 'passport',
};
export async function migrateDocuments() {
  if (kv.get('migrated:documents', false)) return;
  const target = (docId) => {
    const t = MOVED[docId] || (I.doc[docId] ? `doc:${docId}` : null);
    return t === 'passport' ? `passport:${me() || D.travelers[0]?.id}` : t;
  };
  for (const [docId, code] of Object.entries(kv.get('docCodes', {}))) {
    const to = target(docId);
    if (!code || !to) continue;
    const [kind, id] = to.split(':');
    if (kind === 'lodging') { if (!I.lodging[id]?.confirmation) cols.put('lodging', { id, confirmation: code }); }
    else if (kind === 'passport') { if (!cols.map('passports')[id]?.number) cols.put('passports', { id, number: code.toUpperCase() }); }
    else if (!ticketOf(to)?.code) save(to, { code });
  }
  try {
    for (const f of await idb.all('files')) {
      const to = target(f.docId);
      if (to && to !== f.docId) await idb.put('files', { ...f, docId: to });
    }
  } catch { /* no IndexedDB: nothing to move */ }
  kv.set('migrated:documents', true);
}
