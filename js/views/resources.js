// Resources: things you want at hand in a city (metro maps, guides, apps, phrases): a link and/or files attached offline.
import { D, I, cols, idb } from '../store.js';
import { esc, uid, toast, openModal, closeModal } from '../util.js';
import { register, extLink } from '../ui.js';
import { paintAttachments } from './docs.js';

export const KINDS = { mapa: ['🗺️', 'Mapa'], guia: ['📖', 'Guía'], app: ['📱', 'App'], traduccion: ['🈯', 'Traducción'], otro: ['📎', 'Otro'] };
const kind = (r) => KINDS[r.kind] || KINDS.otro;
const cityName = (id) => (id ? I.city[id]?.name || id : 'Todo el viaje');
const order = (r) => { const i = D.trip.cities.findIndex((c) => c.id === r.cityId); return i < 0 ? 999 : i; };

/** Resources that belong to a day's city (or to the day itself), for the day screen. */
export const resourcesForDay = (day) => D.resources.filter((r) => (r.dayId && r.dayId === day.id) || (day.cityId && r.cityId === day.cityId));

function card(r) {
  return `<article class="doc" data-res="${esc(r.id)}">
    <header><h3>${kind(r)[0]} ${esc(r.title)}</h3><span class="badge">${esc(cityName(r.cityId))}</span></header>
    ${r.notes ? `<p class="note-line">${esc(r.notes)}</p>` : ''}
    <div class="attach" data-attach="res:${esc(r.id)}"></div>
    <div class="row-actions">
      ${r.url ? extLink(r.url, 'Abrir enlace') : ''}
      <label class="btn small">📎 Adjuntar imagen / PDF<input type="file" accept="image/*,application/pdf" multiple hidden data-change="doc-attach" data-id="res:${esc(r.id)}"></label>
      <button class="btn small" data-act="res-edit" data-id="${esc(r.id)}">✏️ Editar</button>
    </div></article>`;
}

export function render({ city }, ctx) {
  ctx.title = 'Recursos';
  ctx.after(paintAttachments);
  const cities = [...new Set(D.resources.map((r) => r.cityId || ''))];
  const sel = city !== undefined && cities.includes(city) ? city : null;
  const list = D.resources.filter((r) => sel === null || (r.cityId || '') === sel).sort((a, b) => order(a) - order(b));
  const chips = cities.length > 1 ? `<div class="chips"><a class="chip ${sel === null ? 'on' : ''}" href="#/recursos">Todos</a>${cities.map((c) =>
    `<a class="chip ${sel === c ? 'on' : ''}" href="#/recursos?city=${esc(c)}">${esc(cityName(c))}</a>`).join('')}</div>` : '';
  return `<header class="pagehead"><h1>📚 Recursos</h1>
    <p class="muted">Mapas del metro, guías, apps y todo lo que quieras tener a mano. Adjuntá imágenes o PDFs: quedan guardados en este celular y se ven sin internet.</p></header>
  <div class="row-actions"><button class="btn primary" data-act="res-new">＋ Agregar recurso</button></div>
  ${chips}${list.map(card).join('') || '<p class="muted">Todavía no hay recursos.</p>'}`;
}

function openForm(r = {}) {
  const dlg = openModal(`<h3>${r.id ? 'Editar recurso' : 'Nuevo recurso'}</h3><form class="form" data-submit="res-save"><input type="hidden" name="id" value="${esc(r.id || '')}">
    <label class="field">Título<input name="title" value="${esc(r.title || '')}" placeholder="Mapa del metro de Shanghai" required autocomplete="off"></label>
    <label class="field">Tipo<select name="kind">${Object.entries(KINDS).map(([k, [ic, l]]) => `<option value="${k}" ${(r.kind || 'mapa') === k ? 'selected' : ''}>${ic} ${esc(l)}</option>`).join('')}</select></label>
    <label class="field">Ciudad<select name="cityId"><option value="">Todo el viaje</option>${D.trip.cities.map((c) => `<option value="${esc(c.id)}" ${r.cityId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
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
    cols.put('resources', { id, title: g('title'), kind: g('kind') || 'otro', cityId: g('cityId') || null, url: g('url') || null, notes: g('notes') || null });
    const files = [...form.querySelector('input[type=file]').files];
    if (files.length) {
      navigator.storage?.persist?.();
      try { for (const file of files) await idb.put('files', { id: uid('fi'), docId: `res:${id}`, name: file.name, type: file.type || 'application/octet-stream', blob: file, addedAt: Date.now() }); }
      catch { toast('No se pudo guardar el archivo'); }
    }
    closeModal(form); toast('Recurso guardado'); app.rerender();
  },
  'res-del': async (el, _, app) => {
    if (!confirm('¿Borrar este recurso y sus archivos adjuntos?')) return;
    const id = el.dataset.id;
    cols.del('resources', id);
    try { for (const f of (await idb.all('files')).filter((x) => x.docId === `res:${id}`)) await idb.del('files', f.id); } catch { /* ignore */ }
    closeModal(el); app.rerender();
  },
});
