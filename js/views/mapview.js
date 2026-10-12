import { D, I, settings, bus } from '../store.js';
import { personItems } from './people.js';
import { openPlaceForm, openActivityForm } from './forms.js';
import { esc, ic, icon, fmtDist, openModal, toast, copyText, fmtShort } from '../util.js';
import { tripPhase } from '../tripstate.js';
import { cat, register, extLink } from '../ui.js';
import { computeNearby, isPoi } from '../nearby.js';
import { TripMap, providerForPoint, tileUrls, prefetchTiles } from '../map.js';
import { gps, onPosition, startGps, distance, externalMapUrl, googleMapUrl } from '../geo.js';

const S = { scope: 'near', cats: null, dayId: null, people: true };       // survives navigation within the session
let current = null;                                          // { map, refresh } of the open view

export function render(params, ctx) {
  const st = tripPhase();
  const allCats = [...new Set(D.places.map((p) => p.category))];
  if (!S.cats) S.cats = new Set(allCats.filter((c) => D.trip.poiCategories.includes(c)));
  if (params.day) { S.dayId = params.day; S.scope = 'day'; }
  if (!S.dayId) S.dayId = st.phase === 'during' ? st.day.id : D.days[0].id;
  if (params.focus && I.place[params.focus] && !S.cats.has(I.place[params.focus].category)) S.cats.add(I.place[params.focus].category);
  if (params.focus && S.scope === 'near' && !gps.pos) S.scope = 'all';
  if (params.person) S.people = true;

  ctx.title = 'Mapa';
  ctx.after(() => mount(ctx, st, params));
  return `<div class="mapview">
    <div class="toolbar">
      <div class="seg" role="tablist" aria-label="Qué mostrar">
        ${[['near', 'Cerca'], ['day', 'Día'], ['all', 'Todo']].map(([k, l]) => `<button role="tab" data-act="map-scope" data-scope="${k}" aria-selected="${S.scope === k}">${l}</button>`).join('')}
      </div>
      <select id="map-day" data-change="map-day" aria-label="Día" ${S.scope === 'day' ? '' : 'hidden'}>
        ${D.days.map((d) => `<option value="${d.id}" ${d.id === S.dayId ? 'selected' : ''}>Día ${d.n} · ${esc(fmtShort(d.date))} · ${esc(d.title)}</option>`).join('')}
      </select>
    </div>
    <div class="chips" id="catchips"><button class="chip ${S.people ? 'on' : ''}" style="--c:#1c7ed6" data-act="map-people">${ic('users')} Viajeros</button>${allCats.map((c) => `<button class="chip ${S.cats.has(c) ? 'on' : ''}" style="--c:${cat(c).color}" data-act="map-cat" data-cat="${c}">${icon(cat(c).icon)} ${esc(cat(c).label)}</button>`).join('')}</div>
    <div class="map map-full" id="bigmap" role="region" aria-label="Mapa"></div>
    <div class="map-tools">
      <button class="btn small" data-act="map-locate">${ic('location-dot')} Mi ubicación</button>
      <button class="btn small" data-act="map-provider" id="prov-btn">${ic('map')} Mapa: …</button>
      <button class="btn small" data-act="map-add">${ic('plus')} Lugar acá</button>
      <button class="btn small" data-act="map-offline">${ic('download')} Guardar zona offline</button>
    </div>
    <p class="hint" id="map-hint"></p>
    <ul class="nearby big" id="maplist"></ul>
  </div>`;
}

function itemsFor(st) {
  const cats = S.cats;
  let list = [], lodg = [], ref = null, usingGps = false;
  if (S.scope === 'near') {
    const nb = computeNearby(st, { categories: cats, limit: 60 });
    list = nb.list; ref = nb.ref; usingGps = nb.usingGps;
    lodg = nb.usingGps ? D.lodging.filter((l) => distance(nb.ref, [l.lat, l.lon]) < 8000) : D.lodging.filter((l) => l.cityId === nb.city.id).slice(0, 1);
  } else if (S.scope === 'day') {
    const day = I.day[S.dayId];
    const ids = [...new Set(day.activities.map((a) => a.placeId).filter(Boolean))];
    list = ids.map((id) => I.place[id]).filter((p) => p && cats.has(p.category)).map((place) => ({ place, dist: gps.pos ? distance([gps.pos.lat, gps.pos.lon], [place.lat, place.lon]) : null }));
    if (day.lodgingId) lodg = [I.lodging[day.lodgingId]];
    usingGps = !!gps.pos;
  } else {
    list = D.places.filter((p) => cats.has(p.category)).map((place) => ({ place, dist: gps.pos ? distance([gps.pos.lat, gps.pos.lon], [place.lat, place.lon]) : null }));
    if (gps.pos) list.sort((a, b) => a.dist - b.dist);
    lodg = D.lodging.slice();
    usingGps = !!gps.pos;
  }
  return { list, lodg: lodg.filter(Boolean), ref, usingGps };
}

function mount(ctx, st, params) {
  const el = document.getElementById('bigmap');
  if (!el) return;
  const city = computeNearby(st).city;
  const map = new TripMap(el, { center: city.center, zoom: city.zoom, onPlace: (p) => highlight(p.id) });
  ctx.cleanup(() => { map.destroy(); current = null; });
  let focusId = params.focus || null, firstFit = true;

  const refresh = (fit) => {
    const r = itemsFor(st);
    map.setItems([...r.list.map((x) => ({ kind: 'poi', place: x.place, active: x.place.id === focusId })), ...r.lodg.map((l) => ({ kind: 'lodging', lodging: l })),
      ...(S.people ? personItems() : [])]);
    if (fit || firstFit) {
      firstFit = false;
      if (r.list.length || r.lodg.length) {
        const extra = r.usingGps && gps.pos && S.scope === 'near' ? [[gps.pos.lat, gps.pos.lon]] : [];
        map.fit(extra);
      } else map.setView(city.center[0], city.center[1], city.zoom);
    }
    document.getElementById('maplist').innerHTML = r.list.slice(0, 80).map(({ place, dist }) => {
      const c = cat(place.category);
      return `<li class="${place.id === focusId ? 'active' : ''}"><a href="#/lugar/${esc(place.id)}" data-place="${esc(place.id)}" data-act="focus-place"><span class="act-ic" style="--c:${c.color}">${icon(c.icon)}</span>
        <div><b>${esc(place.name)}</b><small>${esc(c.label)}${place.area ? ' · ' + esc(place.area) : ''}${place.approx ? ' · ubicación aproximada' : ''}</small></div>
        <em>${dist != null && r.usingGps ? fmtDist(dist) : ''}</em></a></li>`;
    }).join('') || '<li class="muted">No hay lugares con estos filtros.</li>';
    const hint = document.getElementById('map-hint');
    if (hint) hint.textContent = S.scope === 'near' && !r.usingGps ? 'Sin GPS: se muestra la ciudad del día. Tocá “Mi ubicación” para ordenar por distancia.' : `${r.list.length} lugares`;
  };
  const highlight = (id) => { focusId = id; refresh(false); map.openPlace(id); document.querySelector(`[data-place="${id}"]`)?.scrollIntoView({ block: 'nearest' }); };
  const provLabel = () => { const b = document.getElementById('prov-btn'); if (b) b.innerHTML = `${ic('map')} Mapa: ${esc(map.mode === 'auto' ? 'auto' : D.trip.tileProviders[map.mode].name.split(' ')[0])} (${esc(D.trip.tileProviders[map.providerId].name.split(' ')[0])})`; };

  current = { map, refresh, highlight, provLabel };
  el.addEventListener('providerchange', provLabel);
  refresh(true); provLabel();
  if (focusId && I.place[focusId]) setTimeout(() => map.openPlace(focusId), 250);
  const person = params.person && personItems().find((x) => x.traveler.id === params.person);
  if (person) setTimeout(() => map.setView(person.pos.lat, person.pos.lon, 16), 200);
  ctx.cleanup(onPosition(() => refresh(false)));
  ctx.cleanup(bus.on('positions', () => refresh(false)));
}

function nearestCityId(lat, lon) {
  let best = null, bd = Infinity;
  for (const c of D.trip.cities) { const d = distance([lat, lon], c.center); if (d < bd) { bd = d; best = c.id; } }
  return best;
}

function placeUrls() {
  return current ? current.map.items.filter((i) => i.kind === 'poi' || i.kind === 'lodging') : [];
}

register({
  'map-people': (el) => { S.people = !S.people; el.classList.toggle('on', S.people); current?.refresh(false); },
  'map-add': () => {
    if (!current) return openPlaceForm();
    const c = current.map.map.getCenter();
    const [lat, lon] = gps.pos && current.map.map.getBounds().contains(current.map.proj(gps.pos.lat, gps.pos.lon)) ? [gps.pos.lat, gps.pos.lon] : current.map.unproj(c.lat, c.lng);
    openPlaceForm({ lat, lon, cityId: nearestCityId(lat, lon) });
  },
  'map-scope': (el, _, app) => { S.scope = el.dataset.scope; app.rerender(); },
  'map-day': (el, _, app) => { S.dayId = el.value; S.scope = 'day'; app.rerender(); },
  'map-cat': (el) => {
    const c = el.dataset.cat; S.cats.has(c) ? S.cats.delete(c) : S.cats.add(c);
    el.classList.toggle('on', S.cats.has(c)); current?.refresh(true);
  },
  'focus-place': (el, ev) => { if (current) { ev.preventDefault(); current.highlight(el.dataset.place); document.getElementById('bigmap')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); } },
  'map-locate': () => { startGps(); if (!('geolocation' in navigator)) toast('Este dispositivo no tiene GPS'); else if (current?.map.user) current.map.locate(); else toast('Buscando tu ubicación…'); },
  'map-provider': () => {
    if (!current) return;
    const ids = ['auto', ...Object.keys(D.trip.tileProviders)];
    const next = ids[(ids.indexOf(current.map.mode) + 1) % ids.length];
    settings.set('mapProvider', next); current.map.setMode(next); current.provLabel();
  },
  'map-offline': () => {
    if (!current) return;
    const items = placeUrls();
    if (!items.length) return toast('No hay puntos para guardar');
    const groups = {};
    items.forEach((i) => {
      const [lat, lon] = i.kind === 'poi' ? [i.place.lat, i.place.lon] : [i.lodging.lat, i.lodging.lon];
      (groups[providerForPoint(lat, lon)] ||= []).push([lat, lon]);
    });
    const jobs = Object.entries(groups).map(([pid, pts]) => ({ pid, urls: tileUrls(pid, pts) }));
    const total = jobs.reduce((n, j) => n + j.urls.length, 0);
    const dlg = openModal(`<h3>Guardar mapa offline</h3>
      <p>Se descargarán unas <b>${total}</b> teselas (~${Math.max(1, Math.round(total * 0.02))} MB) del área de los puntos que ves ahora, para usar el mapa sin internet.</p>
      <p class="hint">Hacelo con wifi. Los servidores de mapas tienen límites de uso: no lo repitas innecesariamente.</p>
      <progress id="pf" value="0" max="${total}" hidden></progress>
      <div class="row-actions"><button class="btn primary" id="pf-go">Descargar</button><button class="btn" data-act="close-modal">Cancelar</button></div>`);
    dlg.querySelector('#pf-go').onclick = async (e) => {
      e.target.disabled = true; const bar = dlg.querySelector('#pf'); bar.hidden = false;
      let done = 0, ok = 0;
      for (const j of jobs) ok += await prefetchTiles(j.urls, (n) => { bar.value = done + n; }), done += j.urls.length;
      toast(ok ? `Listo: ${ok} teselas guardadas` : 'No se pudo descargar (¿sin internet?)'); dlg.close();
    };
  },
});

// ------------------------------------------------------------------ single place
export function renderPlace({ id }, ctx) {
  const p = I.place[id];
  if (!p) return '<p class="muted">Lugar no encontrado.</p>';
  const c = cat(p.category);
  const provider = providerForPoint(p.lat, p.lon);
  ctx.title = p.name;
  const days = (p.days || []).map((d) => I.day[d]).filter(Boolean);
  return `<article class="card place">
    <div class="place-head"><span class="act-ic big" style="--c:${c.color}">${icon(c.icon)}</span><div><h1>${esc(p.name)}</h1>
      ${p.nameLocal ? `<div class="local">${esc(p.nameLocal)} <button class="btn tiny" data-act="copy" data-text="${esc(p.nameLocal)}">Copiar</button></div>` : ''}
      <small>${esc(c.label)}${p.area ? ' · ' + esc(p.area) : ''}${p.source === 'sugerencia' ? ' · sugerencia' : ''}</small></div></div>
    ${p.description ? `<p>${esc(p.description)}</p>` : ''}
    ${p.cost ? `<p>${ic('credit-card')} ${esc(p.cost)}</p>` : ''}
    ${p.approx ? '<p class="note warn">La ubicación es aproximada; verificala antes de ir.</p>' : ''}
    ${days.length ? `<p>En el itinerario: ${days.map((d) => `<a href="#/dia/${d.id}">Día ${d.n} · ${esc(fmtShort(d.date))}</a>`).join(', ')}</p>` : ''}
    <div class="row-actions"><a class="btn primary" href="#/mapa?focus=${esc(p.id)}">${ic('map')} Ver en el mapa</a>
      <a class="btn" href="${externalMapUrl(p.lat, p.lon, p.name, provider)}" target="_blank" rel="noopener">Abrir en app de mapas ${ic('globe')}</a>
      ${provider !== 'gaode' ? `<a class="btn" href="${googleMapUrl(p.lat, p.lon)}" target="_blank" rel="noopener">Google Maps ${ic('globe')}</a>` : ''}
      ${p.link ? extLink(p.link, 'Más info') : ''}</div>
    <div class="row-actions"><button class="btn small" data-act="place-edit" data-id="${esc(p.id)}">${ic('pen')} Editar</button>
      <button class="btn small danger" data-act="place-del" data-id="${esc(p.id)}">Borrar</button>
      <button class="btn small" data-act="act-new-place" data-id="${esc(p.id)}">${ic('plus')} Agregar al itinerario</button></div>
    <p class="hint">${p.source === 'app' ? 'Cargado en la app' : p.edited ? 'Del JSON, editado en la app' : `Del archivo ${esc(p.file || 'places.json')}`}${Number.isFinite(p.lat) ? ` · ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}` : ''}</p>
  </article>`;
}

register({
  copy: (el) => copyText(el.dataset.text),
  'act-new-place': (el) => {
    const p = I.place[el.dataset.id];
    const st = tripPhase();
    const day = D.days.find((d) => d.cityId === p.cityId && (st.phase !== 'during' || d.date >= st.today)) || D.days.find((d) => d.cityId === p.cityId);
    openActivityForm({ dayId: day?.id, title: p.name, placeId: p.id, category: p.category, area: p.area });
  },
});
