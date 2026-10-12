// Boot, hash router, event delegation, clock tick. Everything is static: no backend.
import { loadData, D, I, now, checks, cols, bus, me } from './store.js';
import { esc, $, $$, closeModal, openModal, toast, fmtDuration } from './util.js';
import { actions } from './ui.js';
import { tripPhase } from './tripstate.js';
import * as home from './views/home.js';
import * as day from './views/day.js';
import * as mapview from './views/mapview.js';
import * as photos from './views/photos.js';
import * as expenses from './views/expenses.js';
import * as docs from './views/docs.js';
import * as more from './views/more.js';
import * as tasks from './views/tasks.js';
import * as people from './views/people.js';
import * as places from './views/places.js';
import * as search from './views/search.js';
import * as phrases from './views/phrases.js';
import * as passports from './views/passports.js';
import * as resources from './views/resources.js';
import { paintSimBar } from './views/sim.js';
import './views/forms.js';
import { startSync } from './sync.js';
import { refreshWeather } from './weather.js';

const main = $('#app');
let active = null, renderedToday = null;

const ROUTES = {
  '': (p, c) => home.render(p, c), inicio: (p, c) => home.render(p, c),
  dia: (p, c) => day.render(p, c), mapa: (p, c) => mapview.render(p, c), lugar: (p, c) => mapview.renderPlace(p, c),
  fotos: (p, c) => photos.render(p, c), gastos: (p, c) => expenses.render(p, c), docs: (p, c) => docs.render(p, c),
  mas: (p, c) => more.menu(p, c), itinerario: () => more.itinerary(), transporte: () => more.transport(),
  alojamientos: () => more.lodging(), frases: (p, c) => phrases.render(p, c),
  enlaces: () => { setTimeout(() => location.replace('#/recursos'), 0); return ''; },   // the old "Enlaces" section is now part of Recursos
  tareas: (p, c) => tasks.render(p, c), pendientes: (p, c) => tasks.render(p, c),
  viajeros: (p, c) => people.render(p, c), lugares: (p, c) => places.render(p, c),
  pasaportes: (p, c) => passports.render(p, c), recursos: (p, c) => resources.render(p, c),
  ubicacion: (p) => receiveLocation(p), buscar: (p, c) => search.render(p, c),
  ajustes: (p, c) => { c.after(more.storageInfo); return more.ajustes(); },
};
const NAV_GROUP = { '': 'inicio', inicio: 'inicio', dia: 'dia', itinerario: 'dia', mapa: 'mapa', lugar: 'mapa', lugares: 'mapa', fotos: 'fotos', gastos: 'gastos', tareas: 'tareas', pendientes: 'tareas' };

/** "#/ubicacion?t=<traveler>&lat=..&lon=..&ts=.." — a location shared by link (works without any server). */
function receiveLocation(p) {
  const tr = I.traveler[p.t], lat = +p.lat, lon = +p.lon, ts = +p.ts || Date.now();
  if (!tr || !Number.isFinite(lat) || !Number.isFinite(lon)) return '<div class="card"><p>Link de ubicación inválido.</p></div>';
  if (tr.id !== me()) { cols.merge('positions', [{ id: tr.id, lat, lon, acc: 0, updatedAt: ts, via: 'link' }]); bus.emit('positions'); }
  setTimeout(() => { location.hash = `#/mapa?person=${encodeURIComponent(tr.id)}`; }, 0);
  return `<div class="card"><p>Ubicación de ${esc(tr.name)} guardada.</p></div>`;
}

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs = ''] = raw.split('?');
  const [name = '', arg] = path.split('/');
  const q = Object.fromEntries(new URLSearchParams(qs));
  const params = { ...q };
  if (name === 'dia' || name === 'lugar') params.id = arg;
  if (name === 'docs') params.type = arg;
  return { name, params };
}

function cleanup() { if (active) { active.cleanups.forEach((f) => { try { f(); } catch { /* ignore */ } }); active = null; } }

function route({ keepScroll = false } = {}) {
  const y = window.scrollY;
  cleanup();
  const { name, params } = parseHash();
  const view = ROUTES[name] || ROUTES[''];
  const ctx = { afters: [], cleanups: [], title: null, after(f) { this.afters.push(f); }, cleanup(f) { this.cleanups.push(f); } };
  active = ctx;
  try { main.innerHTML = view(params, ctx); }
  catch (e) { console.error(e); main.innerHTML = `<div class="card"><h3>Ups</h3><p>No se pudo mostrar esta pantalla.</p><pre>${esc(e.message)}</pre></div>`; }
  ctx.afters.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
  document.title = `${ctx.title ? ctx.title + ' · ' : ''}${D.trip.title}`;
  renderedToday = tripPhase().today;
  paintSimBar($('#sim-bar'));
  const group = NAV_GROUP[name] || 'mas';
  $$('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.nav === group));
  const dn = $('#nav [data-nav=dia]'); if (dn) dn.href = `#/dia/${(tripPhase().day || D.days[0]).id}`;
  window.scrollTo(0, keepScroll ? y : 0);
  showPictures();
  people.pendingSetup().then((items) => $('#nav [data-nav=mas]')?.classList.toggle('pending', items.length > 0)).catch(() => null);
  tick();
}
// Hero / day pictures: show them only once they really loaded. The image host can be unreachable (offline, or
// blocked off the published domain): then the hero keeps its gradient and the day banner stays hidden.
const pictureOk = new Map();   // url -> true | false
function showPictures() {
  $$('[style*="--hero-img"]').forEach((el) => {
    const url = el.style.getPropertyValue('--hero-img').match(/url\(['"]?(.*?)['"]?\)/)?.[1];
    if (!url) return;
    const done = (ok) => { pictureOk.set(url, ok); el.classList.toggle('img-ok', ok); };
    if (pictureOk.has(url)) return done(pictureOk.get(url));
    const im = new Image();
    im.onload = () => done(true); im.onerror = () => done(false);
    im.src = url;
  });
}
const app = { rerender: () => route({ keepScroll: true }), navigate: (h) => { location.hash = h; } };

// ------------------------------------------------------------------ events
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = actions[el.dataset.act];
  if (el.matches('input[type=checkbox]')) return;           // handled by 'change'
  if (fn) fn(el, e, app);
});
document.addEventListener('change', (e) => {
  const c = e.target.closest('[data-change]');
  if (c) return actions[c.dataset.change]?.(c, e, app);
  const a = e.target.closest('input[type=checkbox][data-act]');
  if (a) actions[a.dataset.act]?.(a, e, app);
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-submit]');
  if (!f) return;
  e.preventDefault(); actions[f.dataset.submit]?.(f, e, app);
});
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=button][data-act]')) { e.preventDefault(); e.target.click(); }
});
window.addEventListener('hashchange', () => { document.querySelectorAll('dialog[open]').forEach((d) => d.close()); route(); });   // a modal never outlives its screen

Object.assign(actions, {
  'close-modal': (el) => closeModal(el),
  'toggle-check': (el, _, app) => { checks.toggle(el.dataset.key); app.rerender(); },
  'show-address': (el) => {
    const l = I.lodging[el.dataset.id];
    openModal(`<h3>${esc(l.name)}</h3><p class="bigtext">${esc(l.addressLocal)}</p>${l.address ? `<p>${esc(l.address)}</p>` : ''}<div class="row-actions"><button class="btn" data-act="close-modal">Cerrar</button></div>`, { cls: 'wide bigmodal' });
  },
});

// ------------------------------------------------------------------ clock: countdowns + day rollover
function tick() {
  const t = now().getTime();
  $$('[data-countdown]').forEach((el) => {
    const target = +el.dataset.countdown, diff = target - t;
    el.textContent = diff > 0 ? `Faltan ${fmtDuration(diff)} ${el.dataset.label}` : '¡Ya pasó la hora, a moverse!';
    el.classList.toggle('late', diff <= 0);
  });
}
setInterval(() => {
  tick();
  const { name } = parseHash();
  if ((name === '' || name === 'inicio') && tripPhase().today !== renderedToday) route({ keepScroll: true });
}, 15000);

// ------------------------------------------------------------------ boot
(async function boot() {
  try {
    await loadData();
  } catch (e) {
    $('#app').innerHTML = `<div class="card"><h3>No se pudieron cargar los datos del viaje</h3><p>${esc(e.message)}</p>
      <p>Abrí la app desde un servidor web (por ejemplo <code>python3 -m http.server</code>) y no con doble clic en el archivo.</p></div>`;
    return;
  }
  document.title = D.trip.title;
  $('#brand').textContent = D.trip.title;
  if (!location.hash) history.replaceState(null, '', '#/inicio');
  route();
  startSync();
  bus.on('settings', (k) => { if (k === 'simOffset') route({ keepScroll: true }); });   // simulated date changed
  // data changed on another phone: redraw, unless the user is in the middle of a form
  bus.on('remote-change', () => { if (!document.querySelector('dialog[open]') && !document.activeElement?.matches('input, textarea, select')) route({ keepScroll: true }); });
  // weather: at most one download a day (the relay refreshes it daily); kept on the device for offline use
  bus.on('weather', () => { if (!document.querySelector('dialog[open]') && !document.activeElement?.matches('input, textarea, select')) route({ keepScroll: true }); });
  refreshWeather();
  window.addEventListener('online', () => refreshWeather());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshWeather(); });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').then((reg) => setInterval(() => reg.update().catch(() => null), 30 * 60000)).catch((e) => console.warn('SW', e));
    // a new version took over (sw.js calls skipWaiting): offer a reload instead of mixing old and new code
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || $('#update-bar')) return;
      const bar = document.createElement('div');
      bar.id = 'update-bar';
      bar.innerHTML = '<span>Hay una versión nueva de la app.</span><button class="btn small" id="update-go">Actualizar</button>';
      document.body.appendChild(bar);
      $('#update-go').onclick = () => location.reload();
    });
  }
  window.addEventListener('online', () => toast('Volvió la conexión'));
  window.addEventListener('offline', () => toast('Sin conexión: seguís viendo todo lo guardado'));
})();
