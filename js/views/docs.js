// Documents: only what is not modeled anywhere else (visas, entry forms, insurance…). Tickets live in their transport,
// entries in their activity, bookings in their lodging and passports in each traveler. Each one has a proof box
// (code, QR, link, attached files; see ticket.js).
import { D, I } from '../store.js';
import { esc, ic, fmtShort } from '../util.js';
import { statusBadge, extLink } from '../ui.js';
import { ticketBox, paintAttachments, freeUrls } from '../ticket.js';

export const TYPES = {
  visa: ['passport', 'Visas y trámites'], seguro: ['shield-halved', 'Seguro'], otro: ['file-lines', 'Otros'],
};

function card(d) {
  const day = d.day && I.day[d.day];
  return `<article class="doc" data-doc="${esc(d.id)}">
    <header><h3>${ic(TYPES[d.type]?.[0] || 'file-lines')} ${esc(d.title)}</h3>${statusBadge(d.status)}</header>
    ${d.subtitle ? `<p class="muted">${esc(d.subtitle)}</p>` : ''}
    ${day ? `<p><a href="#/dia/${day.id}">Día ${day.n} · ${esc(fmtShort(day.date))}</a></p>` : ''}
    ${d.notes ? `<p class="note-line">${esc(d.notes)}</p>` : ''}
    ${ticketBox(`doc:${d.id}`, { code: d.code, codeLabel: d.codeLabel || 'Código', noCode: d.codeLabel === null, title: d.title })}
    ${d.file || d.url ? `<div class="row-actions">${d.file ? `<a class="btn small" href="${esc(d.file)}" target="_blank" rel="noopener">Abrir archivo</a>` : ''}${d.url ? extLink(d.url, 'Más info') : ''}</div>` : ''}
  </article>`;
}

export function render({ type }, ctx) {
  ctx.title = 'Documentos';
  ctx.cleanup(freeUrls);
  ctx.after(paintAttachments);
  const t = type && TYPES[type] ? type : '';
  const used = Object.keys(TYPES).filter((k) => D.documents.some((d) => d.type === k));
  const tabs = used.length > 1 ? `<div class="chips"><a class="chip ${!t ? 'on' : ''}" href="#/docs">Todos</a>${used.map((k) => `<a class="chip ${t === k ? 'on' : ''}" href="#/docs/${k}">${ic(TYPES[k][0])} ${esc(TYPES[k][1])}</a>`).join('')}</div>` : '';
  const docs = D.documents.filter((d) => !t || d.type === t);
  const body = t ? docs.map(card).join('')
    : Object.keys(TYPES).map((k) => { const g = docs.filter((d) => d.type === k); return g.length ? `<h2 class="grp">${ic(TYPES[k][0])} ${esc(TYPES[k][1])}</h2>${g.map(card).join('')}` : ''; }).join('');
  return `<header class="pagehead"><h1>${ic('file-lines')} Documentos</h1>
    <p class="muted">Visas, trámites de entrada, seguro y todo lo que no es un pasaje, una entrada ni un hotel. Cargá el código, escaneá el QR o adjuntá el PDF: se ve sin internet.</p>
    <div class="row-actions"><a class="btn small" href="#/transporte">${ic('ticket')} Pasajes</a><a class="btn small" href="#/alojamientos">${ic('hotel')} Alojamientos</a>
      <a class="btn small" href="#/viajeros">${ic('passport')} Pasaportes</a><a class="btn small" href="#/recursos">${ic('book')} Recursos</a></div></header>
  ${tabs}${body || '<p class="muted">No hay documentos.</p>'}`;
}
