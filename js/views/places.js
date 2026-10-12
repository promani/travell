// Places ABM list: the JSON places (places.json + extra files) plus the ones loaded in the app.
import { D, I, cols, rebuild, me, bus } from '../store.js';
import { esc, toast, uid } from '../util.js';
import { register, cat } from '../ui.js';
import { exportAsJsonFile } from '../share.js';

let q = '', cityF = '', catF = '';

export function render(_, ctx) {
  ctx.title = 'Lugares';
  const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const list = D.places.filter((p) => (!cityF || p.cityId === cityF) && (!catF || p.category === catF)
    && (!q || norm(`${p.name} ${p.nameLocal} ${p.area} ${p.description}`).includes(norm(q))));
  const byCity = {};
  list.forEach((p) => (byCity[p.cityId] ||= []).push(p));
  const mineCount = cols.live('places').length;
  ctx.after(() => { const s = document.getElementById('place-q'); if (s && q) { s.focus(); s.setSelectionRange(q.length, q.length); } });
  return `<header class="pagehead"><h1>📍 Lugares</h1><p class="muted">${D.places.length} lugares: los del JSON (<code>${esc((D.trip.placeFiles || ['places.json']).join(', '))}</code>) más los que cargues acá.</p></header>
  <div class="row-actions"><button class="btn primary" data-act="place-new">＋ Agregar lugar</button>
    <label class="btn small">⬇ Importar JSON de lugares<input type="file" accept="application/json,.json" hidden data-change="places-import"></label>
    ${mineCount ? `<button class="btn small" data-act="places-export">⬆ Exportar mis lugares (${mineCount})</button>` : ''}</div>
  <div class="toolbar places-filter">
    <input id="place-q" type="search" placeholder="Buscar…" value="${esc(q)}" data-change="places-q" aria-label="Buscar">
    <select data-change="places-city" aria-label="Ciudad"><option value="">Todas las ciudades</option>${D.trip.cities.map((c) => `<option value="${c.id}" ${c.id === cityF ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
    <select data-change="places-cat" aria-label="Categoría"><option value="">Todas las categorías</option>${Object.entries(D.trip.categories).map(([k, c]) => `<option value="${k}" ${k === catF ? 'selected' : ''}>${c.icon} ${esc(c.label)}</option>`).join('')}</select>
  </div>
  ${Object.entries(byCity).map(([cid, arr]) => `<h3 class="grp">${esc(I.city[cid]?.name || 'Otros')} (${arr.length})</h3>
    <ul class="nearby card">${arr.sort((a, b) => a.name.localeCompare(b.name)).map((p) => { const c = cat(p.category); return `<li><a href="#/lugar/${esc(p.id)}"><span class="act-ic" style="--c:${c.color}">${c.icon}</span>
      <div><b>${esc(p.name)}</b><small>${esc(c.label)}${p.area ? ' · ' + esc(p.area) : ''}${p.source === 'app' ? ' · cargado en la app' : p.edited ? ' · editado' : ''}${p.source === 'sugerencia' || p.source === 'extra' ? ' · sugerencia' : ''}</small></div></a></li>`; }).join('')}</ul>`).join('') || '<p class="muted">No hay lugares con esos filtros.</p>'}
  <p class="hint">Para sumar lugares de forma permanente agregalos a un archivo JSON y listalo en <code>placeFiles</code> de <code>trip.json</code>; "Exportar mis lugares" te da el JSON listo para pegar.</p>`;
}

register({
  'places-q': (el, _, app) => { q = el.value; app.rerender(); },
  'places-city': (el, _, app) => { cityF = el.value; app.rerender(); },
  'places-cat': (el, _, app) => { catF = el.value; app.rerender(); },
  'places-export': () => exportAsJsonFile('places'),
  'places-import': async (el, _, app) => {
    const file = el.files[0]; el.value = '';
    if (!file) return;
    try {
      const arr = JSON.parse(await file.text());
      if (!Array.isArray(arr)) throw new Error();
      const ok = arr.filter((p) => p && p.name && Number.isFinite(+p.lat) && Number.isFinite(+p.lon))
        .map((p) => ({ ...p, id: p.id || uid('p-i-'), lat: +p.lat, lon: +p.lon, category: D.trip.categories[p.category] ? p.category : 'cultura', source: p.source || 'importado', updatedAt: Date.now(), by: me() }));
      cols.merge('places', ok); rebuild(); bus.emit('local-change', 'places');
      toast(`${ok.length} lugar${ok.length === 1 ? '' : 'es'} importado${ok.length === 1 ? '' : 's'}${arr.length > ok.length ? ` (${arr.length - ok.length} sin nombre o coordenadas)` : ''}`);
      app.rerender();
    } catch { toast('El archivo tiene que ser una lista JSON de lugares con name, lat y lon'); }
  },
});
