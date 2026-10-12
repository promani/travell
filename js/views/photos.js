// Photos live in IndexedDB on the device (works offline). Each is anchored to a day.
import { D, I, idb } from '../store.js';
import { uploadSoon, removeRemote } from '../upload.js';
import { esc, ic, uid, toast, openModal, download, fmtShort, cap } from '../util.js';
import { tripPhase } from '../tripstate.js';
import { register } from '../ui.js';

let filterDay = null;

async function shrink(file) {
  const bmp = await createImageBitmap(file);                       // applies EXIF orientation
  const make = (max, q) => {
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise((res) => c.toBlob(res, 'image/jpeg', q));
  };
  const out = { full: await make(1800, 0.85), thumb: await make(360, 0.72), w: bmp.width, h: bmp.height };
  bmp.close?.();
  return out;
}

async function addFiles(files, dayId) {
  navigator.storage?.persist?.();
  let n = 0;
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    const id = uid('ph');
    try {
      const { full, thumb, w, h } = await shrink(f);
      await idb.put('photos', { id, dayId: dayId || null, caption: '', takenAt: f.lastModified || Date.now(), addedAt: Date.now(), w, h, thumb });
      await idb.put('photoFull', { id, blob: full });
    } catch {                                   // e.g. HEIC the browser can't decode: keep the original untouched
      await idb.put('photos', { id, dayId: dayId || null, caption: '', takenAt: f.lastModified || Date.now(), addedAt: Date.now(), thumb: null });
      await idb.put('photoFull', { id, blob: f });
    }
    n++;
  }
  return n;
}

const urls = [];
const url = (blob) => { const u = URL.createObjectURL(blob); urls.push(u); return u; };
const freeUrls = () => { while (urls.length) URL.revokeObjectURL(urls.pop()); };

export async function thumbsFor(dayId, el, ctx) {
  if (!el) return;
  try {
    const all = (await idb.all('photos')).filter((p) => p.dayId === dayId).sort((a, b) => a.takenAt - b.takenAt);
    el.innerHTML = all.length
      ? all.slice(0, 8).map((p) => `<a href="#/fotos?day=${dayId}"><img alt="${esc(p.caption || 'Foto')}" src="${url(p.thumb || (new Blob()))}"></a>`).join('') + (all.length > 8 ? `<a class="more" href="#/fotos?day=${dayId}">+${all.length - 8}</a>` : '')
      : '<p class="muted">Todavía no hay fotos de este día.</p>';
  } catch { el.innerHTML = '<p class="muted">Fotos no disponibles en este navegador.</p>'; }
  ctx?.cleanup(freeUrls);
}

export function render(params, ctx) {
  const st = tripPhase();
  filterDay = params.day || filterDay;
  const target = filterDay || (st.phase === 'during' ? st.day.id : '');
  ctx.title = 'Fotos';
  ctx.after(() => paint(ctx));
  ctx.cleanup(freeUrls);
  return `<header class="pagehead"><h1>${ic('camera')} Fotos</h1><p class="muted">Se guardan en este dispositivo (funcionan sin internet) y quedan asociadas a un día.</p></header>
    <section class="card">
      <label class="field">Guardar en el día
        <select id="photo-day" data-change="photo-day"><option value="">Sin día</option>
          ${D.days.map((d) => `<option value="${d.id}" ${d.id === target ? 'selected' : ''}>Día ${d.n} · ${esc(fmtShort(d.date))} · ${esc(d.title)}</option>`).join('')}</select></label>
      <div class="row-actions">
        <label class="btn primary">${ic('plus')} Elegir fotos<input type="file" accept="image/*" multiple hidden data-change="photo-files"></label>
        <label class="btn">${ic('camera')} Sacar foto<input type="file" accept="image/*" capture="environment" hidden data-change="photo-files"></label>
      </div>
    </section>
    <div class="chips" id="photo-filter"></div>
    <div id="gallery" class="gallery"><p class="muted">Cargando…</p></div>`;
}

async function paint(ctx) {
  freeUrls();
  const box = document.getElementById('gallery'); if (!box) return;
  let all;
  try { all = await idb.all('photos'); } catch { box.innerHTML = '<p class="muted">Este navegador no permite guardar fotos.</p>'; return; }
  const counts = {};
  all.forEach((p) => { counts[p.dayId || ''] = (counts[p.dayId || ''] || 0) + 1; });
  const f = document.getElementById('photo-filter');
  if (f) f.innerHTML = `<button class="chip ${!filterDay ? 'on' : ''}" data-act="photo-filter" data-day="">Todas (${all.length})</button>` +
    Object.keys(counts).sort().map((k) => `<button class="chip ${filterDay === k ? 'on' : ''}" data-act="photo-filter" data-day="${k}">${k ? `Día ${I.day[k].n}` : 'Sin día'} (${counts[k]})</button>`).join('');
  const shown = all.filter((p) => !filterDay || (p.dayId || '') === filterDay).sort((a, b) => (a.dayId || 'z').localeCompare(b.dayId || 'z') || a.takenAt - b.takenAt);
  if (!shown.length) { box.innerHTML = `<p class="muted center">Todavía no hay fotos. Sumá la primera ${ic('hand-point-up')}</p>`; return; }
  const groups = {};
  shown.forEach((p) => (groups[p.dayId || ''] ||= []).push(p));
  box.innerHTML = Object.entries(groups).map(([k, arr]) => `<h3 class="grp">${k ? `Día ${I.day[k].n} · ${esc(cap(I.day[k].title))}` : 'Sin día'}</h3>
    <div class="thumbs grid">${arr.map((p) => `<button data-act="photo-open" data-id="${p.id}" aria-label="${esc(p.caption || 'Abrir foto')}"><img loading="lazy" alt="${esc(p.caption || '')}" src="${url(p.thumb || new Blob())}"></button>`).join('')}</div>`).join('');
}

register({
  'photo-filter': (el, _, app) => { filterDay = el.dataset.day || null; paint(); },
  'photo-day': () => {},
  'photo-files': async (el, _, app) => {
    const dayId = document.getElementById('photo-day')?.value || null;
    const files = [...el.files]; el.value = '';
    if (!files.length) return;
    toast(`Guardando ${files.length} foto${files.length > 1 ? 's' : ''}…`);
    try { const n = await addFiles(files, dayId); toast(`${n} foto${n === 1 ? '' : 's'} guardada${n === 1 ? '' : 's'}`); uploadSoon(); }
    catch { toast('No se pudo guardar (¿poco espacio?)'); }
    filterDay = dayId; app.rerender();
  },
  'photo-open': async (el, _, app) => {
    const rec = (await idb.all('photos')).find((p) => p.id === el.dataset.id);
    const full = await idb.get('photoFull', el.dataset.id);
    if (!rec || !full) return;
    const u = url(full.blob);
    const dlg = openModal(`<img class="lightbox" src="${u}" alt="">
      <input class="caption" placeholder="Agregar descripción" value="${esc(rec.caption || '')}" aria-label="Descripción">
      <label class="field">Día <select class="pday"><option value="">Sin día</option>${D.days.map((d) => `<option value="${d.id}" ${d.id === rec.dayId ? 'selected' : ''}>Día ${d.n} · ${esc(d.title)}</option>`).join('')}</select></label>
      <div class="row-actions"><button class="btn" data-x="dl">${ic('download')} Descargar</button><button class="btn danger" data-x="del">Eliminar</button><button class="btn" data-act="close-modal">Cerrar</button></div>`, { cls: 'wide',
      onClose: () => paint() });
    dlg.querySelector('.caption').onchange = async (e) => { rec.caption = e.target.value; await idb.put('photos', rec); };
    dlg.querySelector('.pday').onchange = async (e) => { rec.dayId = e.target.value || null; await idb.put('photos', rec); };
    dlg.querySelector('[data-x="dl"]').onclick = () => download(`foto-${rec.id}.jpg`, full.blob);
    dlg.querySelector('[data-x="del"]').onclick = async () => {
      if (!confirm('¿Eliminar esta foto?')) return;
      removeRemote(await idb.get('photoFull', rec.id));
      await idb.del('photos', rec.id); await idb.del('photoFull', rec.id); dlg.close();
    };
  },
});
