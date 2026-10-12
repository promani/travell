// Boot, hash router, event delegation, clock tick. Everything is static: no backend.
import { loadData, D, I, now, checks } from './store.js';
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

const main = $('#app');
let active = null, renderedToday = null;

const ROUTES = {
  '': (p, c) => home.render(p, c), inicio: (p, c) => home.render(p, c),
  dia: (p, c) => day.render(p, c), mapa: (p, c) => mapview.render(p, c), lugar: (p, c) => mapview.renderPlace(p, c),
  fotos: (p, c) => photos.render(p, c), gastos: (p, c) => expenses.render(p, c), docs: (p, c) => docs.render(p, c),
  mas: () => more.menu(), itinerario: () => more.itinerary(), transporte: () => more.transport(),
  alojamientos: () => more.lodging(), pendientes: () => more.pendientes(), enlaces: () => more.enlaces(),
  ajustes: (p, c) => { c.after(more.storageInfo); return more.ajustes(); },
};
const NAV_GROUP = { '': 'inicio', inicio: 'inicio', dia: 'dia', itinerario: 'dia', mapa: 'mapa', lugar: 'mapa', fotos: 'fotos', gastos: 'gastos' };

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
  const group = NAV_GROUP[name] || 'mas';
  $$('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.nav === group));
  const dn = $('#nav [data-nav=dia]'); if (dn) dn.href = `#/dia/${(tripPhase().day || D.days[0]).id}`;
  window.scrollTo(0, keepScroll ? y : 0);
  tick();
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
window.addEventListener('hashchange', () => route());

Object.assign(actions, {
  'close-modal': (el) => closeModal(el),
  'toggle-check': (el) => { checks.toggle(el.dataset.key); },
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
    el.textContent = diff > 0 ? `Faltan ${fmtDuration(diff)} ${el.dataset.label}` : '⏰ Ya pasó la hora, ¡a moverse!';
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
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e));
  }
  window.addEventListener('online', () => toast('Volvió la conexión'));
  window.addEventListener('offline', () => toast('Sin conexión: seguís viendo todo lo guardado'));
})();
