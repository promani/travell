// Passports: data of each traveler (number, dates) + photos of the passport page, big mode for immigration, validity warning.
import { D, I, cols, me, idb } from '../store.js';
import { esc, ic, toast, openModal, closeModal, fmtDate, copyText } from '../util.js';
import { register } from '../ui.js';
import { passportOf, passportStatus } from '../passport.js';
import { paintAttachments } from './docs.js';

const LEVEL = { ok: 'ok', short: 'warn', expired: 'now', missing: 'warn' };
const tripEnd = () => D.days[D.days.length - 1].date;
const date = (iso) => (iso ? esc(fmtDate(iso, { day: 'numeric', month: 'short', year: 'numeric' })) : '—');
const urls = [];
const url = (b) => { const u = URL.createObjectURL(b); urls.push(u); return u; };
const free = () => { while (urls.length) URL.revokeObjectURL(urls.pop()); };

function fields(p) {
  return [['Nombre completo', esc(p.fullName || '—')], ['Nacionalidad', esc(p.nationality || '—')], ['Nacimiento', date(p.birth)],
    ['Emisión', date(p.issued)], ['Vencimiento', date(p.expires)]];
}

function card(t) {
  const p = passportOf(t.id), st = passportStatus(p, tripEnd());
  return `<article class="doc" data-passport="${esc(t.id)}">
    <header><h3>${ic('passport')} ${esc(t.name)}${t.id === me() ? ' <small>(vos)</small>' : ''}</h3><span class="badge ${LEVEL[st.level]}">${st.level === 'ok' ? ic('check') + ' ' : ''}${esc(st.level === 'missing' ? st.text : st.level === 'ok' ? 'Vigente' : st.level === 'expired' ? 'Vence antes de volver' : 'Vence pronto')}</span></header>
    ${p?.number ? `<div class="codebox"><small>Número de pasaporte</small>
      <button class="code" data-act="pass-big" data-id="${esc(t.id)}" aria-label="Mostrar en grande">${esc(p.number)}</button>
      <dl class="kv">${fields(p).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
      ${st.level !== 'ok' ? `<p class="note warn">${esc(st.text)}</p>` : ''}</div>` : `<p class="muted">Todavía no cargaste el pasaporte de ${esc(t.name)}.</p>`}
    <div class="attach" data-attach="passport:${esc(t.id)}"></div>
    <div class="row-actions">
      <button class="btn small ${p?.number ? '' : 'primary'}" data-act="pass-edit" data-id="${esc(t.id)}">${p?.number ? `${ic('pen')} Editar` : `${ic('plus')} Cargar pasaporte`}</button>
      ${p?.number ? `<button class="btn small" data-act="pass-big" data-id="${esc(t.id)}">Pantalla completa</button><button class="btn small" data-act="copy" data-text="${esc(p.number)}">Copiar número</button>` : ''}
      <label class="btn small">${ic('paperclip')} Foto / escaneo<input type="file" accept="image/*,application/pdf" multiple hidden data-change="doc-attach" data-id="passport:${esc(t.id)}"></label>
    </div></article>`;
}

export function render(_, ctx) {
  ctx.title = 'Pasaportes';
  ctx.cleanup(free);
  ctx.after(paintAttachments);
  return `<header class="pagehead"><h1>${ic('passport')} Pasaportes</h1>
    <p class="muted">Datos y foto del pasaporte de cada viajero, para tenerlos a mano sin internet (migraciones, reservas, formularios de visa).</p></header>
  <p class="hint">Los datos se guardan en este celular. Si sincronizás con el grupo, viajan <b>cifrados</b> con el código del grupo y los ven todos los viajeros. Las fotos quedan solo en el dispositivo donde las adjuntes.</p>
  ${D.travelers.map(card).join('')}
  <div class="row-actions"><button class="btn small" data-act="traveler-new">${ic('plus')} Agregar viajero</button></div>`;
}

register({
  'pass-edit': (el) => {
    const t = I.traveler[el.dataset.id], p = passportOf(t.id) || {};
    const inp = (label, name, v, attrs = '') => `<label class="field">${label}<input name="${name}" value="${esc(v ?? '')}" ${attrs}></label>`;
    const dlg = openModal(`<h3>${ic('passport')} Pasaporte de ${esc(t.name)}</h3><form class="form" data-submit="pass-save"><input type="hidden" name="id" value="${esc(t.id)}">
      ${inp('Nombre completo (como figura en el pasaporte)', 'fullName', p.fullName, 'autocomplete="off" autocapitalize="characters"')}
      ${inp('Número de pasaporte', 'number', p.number, 'autocomplete="off" autocapitalize="characters" spellcheck="false" required')}
      ${inp('Nacionalidad', 'nationality', p.nationality || 'Argentina', 'autocomplete="off"')}
      ${inp('Fecha de nacimiento', 'birth', p.birth, 'type="date"')}
      ${inp('Fecha de emisión', 'issued', p.issued, 'type="date"')}
      ${inp('Fecha de vencimiento', 'expires', p.expires, 'type="date"')}
      <div class="row-actions"><button class="btn primary" type="submit">Guardar</button><button class="btn" type="button" data-act="close-modal">Cancelar</button>
        ${p.number ? `<button class="btn danger" type="button" data-act="pass-del" data-id="${esc(t.id)}">Borrar datos</button>` : ''}</div></form>`);
    dlg.querySelector('input[name=number]').focus();
  },
  'pass-save': (form, _, app) => {
    const f = new FormData(form), g = (k) => (f.get(k) ?? '').toString().trim();
    const number = g('number').toUpperCase().replace(/\s+/g, '');
    if (!number) return toast('Falta el número de pasaporte');
    cols.put('passports', { id: g('id'), fullName: g('fullName').toUpperCase(), number, nationality: g('nationality'), birth: g('birth'), issued: g('issued'), expires: g('expires') });
    closeModal(form); toast('Pasaporte guardado'); app.rerender();
  },
  'pass-del': (el, _, app) => {
    if (!confirm('¿Borrar los datos del pasaporte? (las fotos adjuntas no se borran)')) return;
    cols.del('passports', el.dataset.id); closeModal(el); app.rerender();
  },
  'pass-big': async (el) => {
    const t = I.traveler[el.dataset.id], p = passportOf(t.id);
    if (!p) return;
    free();
    const files = (await idb.all('files')).filter((f) => f.docId === `passport:${t.id}` && f.type.startsWith('image/'));
    openModal(`<h3>${ic('passport')} ${esc(t.name)}</h3><small>Número de pasaporte</small>
      <div class="bigcode">${esc(p.number).split('').map((c) => `<span>${esc(c)}</span>`).join('')}</div>
      <dl class="kv big">${fields(p).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
      ${files.map((f) => `<img class="lightbox" alt="${esc(f.name)}" src="${url(f.blob)}">`).join('')}
      <div class="row-actions"><button class="btn" data-act="copy" data-text="${esc(p.number)}">Copiar número</button><button class="btn" data-act="close-modal">Cerrar</button></div>`, { cls: 'wide bigmodal', onClose: free });
  },
});
