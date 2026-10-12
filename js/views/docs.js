// Documents: booking codes, visas, tickets, confirmations. Codes are shown big; files/screenshots are attached offline.
import { D, I, idb, docCodes } from '../store.js';
import { esc, uid, toast, openModal, copyText, download, closeModal, fmtShort } from '../util.js';
import { register, statusBadge, extLink } from '../ui.js';

export const TYPES = {
  pasaje: ['🎫', 'Pasajes y códigos'], visa: ['🛂', 'Visas y trámites'], entrada: ['🎟️', 'Entradas'],
  hotel: ['🏨', 'Hospedaje'], identidad: ['🪪', 'Identidad'], seguro: ['🛡️', 'Seguro'], otro: ['📄', 'Otros'],
};
const urls = [];
const url = (b) => { const u = URL.createObjectURL(b); urls.push(u); return u; };
const free = () => { while (urls.length) URL.revokeObjectURL(urls.pop()); };

function card(d) {
  const code = docCodes.get(d);
  const day = d.day && I.day[d.day];
  return `<article class="doc" data-doc="${esc(d.id)}">
    <header><h3>${TYPES[d.type]?.[0] || '📄'} ${esc(d.title)}</h3>${statusBadge(d.status)}</header>
    ${d.subtitle ? `<p class="muted">${esc(d.subtitle)}</p>` : ''}
    ${day ? `<p><a href="#/dia/${day.id}">Día ${day.n} · ${esc(fmtShort(day.date))}</a></p>` : ''}
    ${d.codeLabel !== null ? `<div class="codebox">
      <small>${esc(d.codeLabel || 'Código')}</small>
      ${code ? `<button class="code" data-act="doc-big" data-id="${esc(d.id)}" aria-label="Mostrar código en grande">${esc(code)}</button>
        <div class="row-actions"><button class="btn small" data-act="copy" data-text="${esc(code)}">Copiar</button><button class="btn small" data-act="doc-big" data-id="${esc(d.id)}">Pantalla completa</button><button class="btn small" data-act="doc-edit" data-id="${esc(d.id)}">Editar</button></div>`
        : `<button class="btn small" data-act="doc-edit" data-id="${esc(d.id)}">＋ Cargar código</button>`}
    </div>` : ''}
    <div class="attach" data-attach="${esc(d.id)}"></div>
    ${d.notes ? `<p class="note-line">${esc(d.notes)}</p>` : ''}
    <div class="row-actions">
      <label class="btn small">📎 Adjuntar PDF / captura<input type="file" accept="image/*,application/pdf" multiple hidden data-change="doc-attach" data-id="${esc(d.id)}"></label>
      ${d.file ? `<a class="btn small" href="${esc(d.file)}" target="_blank" rel="noopener">Abrir archivo</a>` : ''}
      ${d.url ? extLink(d.url, 'Más info') : ''}
    </div>
  </article>`;
}

export function render({ type }, ctx) {
  ctx.title = 'Documentos';
  ctx.cleanup(free);
  ctx.after(paintAttachments);
  const t = type && TYPES[type] ? type : '';
  const tabs = `<div class="chips"><a class="chip ${!t ? 'on' : ''}" href="#/docs">Todos</a>${Object.entries(TYPES).filter(([k]) => D.documents.some((d) => d.type === k)).map(([k, [ic, l]]) => `<a class="chip ${t === k ? 'on' : ''}" href="#/docs/${k}">${ic} ${esc(l)}</a>`).join('')}</div>`;
  const docs = D.documents.filter((d) => !t || d.type === t);
  let body;
  if (t) body = docs.map(card).join('');
  else body = Object.keys(TYPES).map((k) => { const g = docs.filter((d) => d.type === k); return g.length ? `<h2 class="grp">${TYPES[k][0]} ${esc(TYPES[k][1])}</h2>${g.map(card).join('')}` : ''; }).join('');
  return `<header class="pagehead"><h1>🎫 Documentos</h1><p class="muted">Códigos, visas, entradas y confirmaciones. Adjuntá PDFs o capturas (QR): quedan guardados en el dispositivo y se ven sin internet.</p><div class="row-actions"><a class="btn small" href="#/pasaportes">🛂 Pasaportes</a><a class="btn small" href="#/recursos">📚 Recursos</a></div></header>${tabs}${body || '<p class="muted">No hay documentos.</p>'}`;
}

export async function paintAttachments() {
  free();
  let files = [];
  try { files = await idb.all('files'); } catch { return; }
  document.querySelectorAll('[data-attach]').forEach((box) => {
    const mine = files.filter((f) => f.docId === box.dataset.attach).sort((a, b) => a.addedAt - b.addedAt);
    box.innerHTML = mine.map((f) => f.type.startsWith('image/')
      ? `<figure class="att"><button data-act="att-open" data-id="${f.id}" aria-label="Abrir ${esc(f.name)}"><img alt="${esc(f.name)}" src="${url(f.blob)}"></button><figcaption>${esc(f.name)} <button class="btn tiny danger" data-act="att-del" data-id="${f.id}">✕</button></figcaption></figure>`
      : `<div class="att file"><button class="btn small" data-act="att-open" data-id="${f.id}">📄 ${esc(f.name)}</button> <button class="btn tiny danger" data-act="att-del" data-id="${f.id}">✕</button></div>`).join('');
  });
}

register({
  'doc-big': async (el) => {
    const d = I.doc[el.dataset.id], code = docCodes.get(d);
    const files = (await idb.all('files')).filter((f) => f.docId === d.id && f.type.startsWith('image/'));
    openModal(`<h3>${esc(d.title)}</h3><small>${esc(d.codeLabel || 'Código')}</small>
      <div class="bigcode">${esc(code).split('').map((c) => `<span>${esc(c)}</span>`).join('')}</div>
      ${files.map((f) => `<img class="lightbox" alt="${esc(f.name)}" src="${url(f.blob)}">`).join('')}
      <div class="row-actions"><button class="btn" data-act="copy" data-text="${esc(code)}">Copiar</button><button class="btn" data-act="close-modal">Cerrar</button></div>`, { cls: 'wide bigmodal' });
  },
  'doc-edit': (el) => {
    const d = I.doc[el.dataset.id];
    const dlg = openModal(`<h3>${esc(d.title)}</h3><form class="form" data-submit="doc-save"><input type="hidden" name="id" value="${esc(d.id)}">
      <label class="field">${esc(d.codeLabel || 'Código')}<input name="code" value="${esc(docCodes.get(d))}" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>
      <div class="row-actions"><button class="btn primary" type="submit">Guardar</button><button class="btn" type="button" data-act="close-modal">Cancelar</button></div></form>`);
    dlg.querySelector('input[name=code]').focus();
  },
  'doc-save': (form, ev, app) => {
    const f = new FormData(form);
    docCodes.set(f.get('id'), f.get('code').trim()); closeModal(form); app.rerender();
  },
  'doc-attach': async (el, _, app) => {
    const files = [...el.files]; el.value = '';
    navigator.storage?.persist?.();
    try {
      for (const f of files) await idb.put('files', { id: uid('fi'), docId: el.dataset.id, name: f.name, type: f.type || 'application/octet-stream', blob: f, addedAt: Date.now() });
      toast(`${files.length} archivo${files.length > 1 ? 's' : ''} guardado${files.length > 1 ? 's' : ''}`);
    } catch { toast('No se pudo guardar el archivo'); }
    app.rerender();
  },
  'att-open': async (el) => {
    const f = (await idb.all('files')).find((x) => x.id === el.dataset.id);
    if (!f) return;
    if (f.type.startsWith('image/')) openModal(`<img class="lightbox" alt="${esc(f.name)}" src="${url(f.blob)}"><div class="row-actions"><button class="btn" data-act="close-modal">Cerrar</button></div>`, { cls: 'wide bigmodal' });
    else window.open(url(f.blob), '_blank') || download(f.name, f.blob);
  },
  'att-del': async (el, _, app) => {
    if (!confirm('¿Quitar este archivo?')) return;
    await idb.del('files', el.dataset.id); app.rerender();
  },
});
