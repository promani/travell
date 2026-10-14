// Resources: everything you want at hand, by city — links (metro maps, apps, procedures, sources) and/or files attached
// offline (screenshots, PDFs). The old "Enlaces" section lives here too: a link is just a resource with a URL.
import { D, I, cols, idb } from '../store.js';
import { esc, ic, uid, toast, openModal, closeModal } from '../util.js';
import { register, extLink } from '../ui.js';
import { paintAttachments } from '../ticket.js';
import { uploadSoon, removeRemote } from '../upload.js';
import { platformOf } from './reels.js';

export const KINDS = {
  mapa: ['map', 'Mapa'], guia: ['book-open', 'Guía'], app: ['mobile-screen', 'App'], traduccion: ['language', 'Traducción'],
  tramite: ['passport', 'Trámite'], reel: ['clapperboard', 'Reel'], enlace: ['link', 'Enlace'], fuente: ['book', 'Fuente consultada'], otro: ['paperclip', 'Otro'],
};
const kind = (r) => KINDS[r.kind] || KINDS.otro;
const cityName = (id) => (id ? I.city[id]?.name || id : 'Todo el viaje');
const order = (id) => { if (!id) return -1; const i = D.trip.cities.findIndex((c) => c.id === id); return i < 0 ? 999 : i; };
const isSource = (r) => r.kind === 'fuente';
const isReel = (r) => r.kind === 'reel';   // they have their own screen (#/reels)

/** Resources that belong to a day's city (or to the day itself), for the day screen. Sources stay in "Recursos". */
export const resourcesForDay = (day) => D.resources.filter((r) => !isSource(r) && ((r.dayId && r.dayId === day.id) || (day.cityId && r.cityId === day.cityId)));

/** A resource as a list row: the title opens the link; files attached on this phone show underneath. */
export function resRow(r, { actions = true } = {}) {
  const day = r.dayId && I.day[r.dayId];
  const label = isReel(r) && platformOf(r.url) ? `Reel de ${platformOf(r.url)}` : kind(r)[1];
  const meta = [label, day ? `Día ${day.n}` : ''].filter(Boolean).join(' · ');
  return `<li class="res"><span class="o-ic">${ic(kind(r)[0])}</span>
    <div><b>${r.url ? extLink(r.url, r.title) : esc(r.title)}</b><small>${esc(meta)}</small>
      ${r.notes ? `<small class="note-line">${esc(r.notes)}</small>` : ''}<div class="attach" data-attach="res:${esc(r.id)}"></div></div>
    ${actions ? `<span class="res-acts"><label class="icon-btn sm" title="Adjuntar imagen o PDF">${ic('paperclip')}<input type="file" accept="image/*,application/pdf" multiple hidden data-change="doc-attach" data-id="res:${esc(r.id)}"></label>
      <button class="icon-btn sm" data-act="res-edit" data-id="${esc(r.id)}" aria-label="Editar">${ic('pen')}</button></span>` : ''}</li>`;
}

export function render({ city }, ctx) {
  ctx.title = 'Recursos';
  ctx.after(paintAttachments);
  const main = D.resources.filter((r) => !isSource(r) && !isReel(r)), reels = D.resources.filter(isReel), sources = D.resources.filter(isSource);
  const cities = [...new Set(main.map((r) => r.cityId || ''))].sort((a, b) => order(a) - order(b));
  const sel = city !== undefined && cities.includes(city) ? city : null;
  const chips = cities.length > 1 ? `<div class="chips"><a class="chip ${sel === null ? 'on' : ''}" href="#/recursos">Todos</a>${cities.map((c) =>
    `<a class="chip ${sel === c ? 'on' : ''}" href="#/recursos?city=${esc(c)}">${esc(cityName(c))}</a>`).join('')}</div>` : '';
  const groups = cities.filter((c) => sel === null || c === sel).map((c) => `<section class="card"><h3>${esc(cityName(c))}</h3>
    <ul class="res-list">${main.filter((r) => (r.cityId || '') === c).map((r) => resRow(r)).join('')}</ul></section>`).join('');
  const src = sel === null && sources.length ? `<details class="card src"><summary>${ic('book')} Fuentes consultadas <span class="badge">${sources.length}</span></summary>
    <ul class="res-list">${sources.map((r) => resRow(r)).join('')}</ul></details>` : '';
  const loose = reels.filter((r) => !r.dayId || !I.day[r.dayId]).length;
  const reelsLink = sel === null ? `<a class="card tg-home${loose ? ' due' : ''}" href="#/reels">${ic('clapperboard')}<div><b>Reels</b>
    <small>${reels.length ? `${reels.length} de Instagram o TikTok${loose ? ` · ${loose} sin día` : ''}` : 'Guardá reels de Instagram o TikTok para cada día'}</small></div><em>›</em></a>` : '';
  return `<header class="pagehead"><h1>${ic('book')} Recursos</h1>
    <p class="muted">Enlaces, mapas del metro, apps y guías por ciudad. Adjuntá capturas o PDFs para tenerlos sin internet.</p>
    <div class="row-actions"><button class="btn primary small" data-act="res-new">${ic('plus')} Agregar recurso</button><a class="btn small" href="#/cheatsheet">${ic('language')} Cheat sheet</a></div></header>
  ${chips}${reelsLink}${groups || '<p class="muted">Todavía no hay recursos.</p>'}${src}`;
}

function openForm(r = {}) {
  const dlg = openModal(`<h3>${r.id ? 'Editar recurso' : 'Nuevo recurso'}</h3><form class="form" data-submit="res-save"><input type="hidden" name="id" value="${esc(r.id || '')}">
    <label class="field">Título<input name="title" value="${esc(r.title || '')}" placeholder="Mapa del metro de Shanghai" required autocomplete="off"></label>
    <label class="field">Tipo<select name="kind">${Object.entries(KINDS).map(([k, [, l]]) => `<option value="${k}" ${(r.kind || 'enlace') === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
    <label class="field">Ciudad<select name="cityId"><option value="">Todo el viaje</option>${D.trip.cities.map((c) => `<option value="${esc(c.id)}" ${r.cityId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
    <label class="field">Día (opcional)<select name="dayId"><option value="">Ninguno</option>${D.days.map((d) => `<option value="${esc(d.id)}" ${r.dayId === d.id ? 'selected' : ''}>Día ${d.n} · ${esc(d.title)}</option>`).join('')}</select></label>
    <label class="field">Enlace (opcional)<input name="url" type="url" value="${esc(r.url || '')}" placeholder="https://…"></label>
    <label class="field">Notas (opcional)<textarea name="notes" rows="3">${esc(r.notes || '')}</textarea></label>
    <label class="field">Imágenes o PDFs (opcional)<input name="files" type="file" accept="image/*,application/pdf" multiple></label>
    <div class="row-actions"><button class="btn primary" type="submit">Guardar</button><button class="btn" type="button" data-act="close-modal">Cancelar</button>
      ${r.id ? `<button class="btn danger" type="button" data-act="res-del" data-id="${esc(r.id)}">Borrar</button>` : ''}</div></form>`);
  dlg.querySelector('input[name=title]').focus();
}

register({
  'res-new': () => openForm({ cityId: location.hash.match(/city=([^&]+)/)?.[1] || '' }),
  'res-edit': (el) => openForm(I.resource[el.dataset.id]),
  'res-save': async (form, _, app) => {
    const f = new FormData(form), g = (k) => (f.get(k) ?? '').toString().trim();
    if (!g('title')) return toast('Falta el título');
    const id = g('id') || uid('r');
    const { edited, ...prev } = I.resource[id] || {};   // keep fields the form doesn't show
    cols.put('resources', { ...prev, id, title: g('title'), kind: g('kind') || 'otro', cityId: g('cityId') || null, dayId: g('dayId') || null, url: g('url') || null, notes: g('notes') || null });
    const files = [...form.querySelector('input[type=file]').files];
    if (files.length) {
      navigator.storage?.persist?.();
      try { for (const file of files) await idb.put('files', { id: uid('fi'), docId: `res:${id}`, name: file.name, type: file.type || 'application/octet-stream', blob: file, addedAt: Date.now() }); uploadSoon(); }
      catch { toast('No se pudo guardar el archivo'); }
    }
    closeModal(form); toast('Recurso guardado'); app.rerender();
  },
  'res-del': async (el, _, app) => {
    if (!confirm('¿Borrar este recurso y sus archivos adjuntos?')) return;
    const id = el.dataset.id;
    cols.del('resources', id);
    try { for (const f of (await idb.all('files')).filter((x) => x.docId === `res:${id}`)) { removeRemote(f); await idb.del('files', f.id); } } catch { /* ignore */ }
    closeModal(el); app.rerender();
  },
});
