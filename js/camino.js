// Camino (like Peak's Perilous Path): a grid shows its holes for a few seconds, then they hide and you cross from
// the start (bottom row) to the flag (top row) one step at a time, up/down/left/right, without stepping on one.
// A training exercise (Entrenar, js/views/train.js): no score is kept; the difficulty follows how it goes.
import { esc, ic } from './util.js';

export const ROUNDS = 6;
export const size = (level) => Math.min(4 + Math.floor(level / 3), 7);
const lookMs = (level) => Math.max(1800, 3600 - level * 120);
export const adjacent = (a, b, n) => Math.abs(Math.floor(a / n) - Math.floor(b / n)) + Math.abs((a % n) - (b % n)) === 1;

/** A board for a level: { n, start, goal, holes: Set }. There is always a way across (a random safe path is laid
 *  first, climbing row by row and wandering sideways; the holes go anywhere else). */
export function board(level, rnd = Math.random) {
  const n = size(level), want = Math.round(n * n * (0.26 + 0.04 * (level % 3)));
  for (;;) {   // a path that wanders too much leaves no room for the holes: lay another one
    const b = layout(n, want, rnd);
    if (b) return b;
  }
}
function layout(n, want, rnd) {
  const goal = Math.floor(rnd() * n);
  let r = n - 1, c = Math.floor(rnd() * n);
  const start = r * n + c, safe = new Set([start]);
  while (r > 0) {
    const to = r === 1 ? goal : Math.floor(rnd() * n);
    while (c !== to) { c += Math.sign(to - c); safe.add(r * n + c); }
    r--; safe.add(r * n + c);
  }
  const free = [...Array(n * n).keys()].filter((i) => !safe.has(i));
  if (free.length < want) return null;
  for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [free[i], free[j]] = [free[j], free[i]]; }
  return { n, start, goal, holes: new Set(free.slice(0, want)) };
}

/** Plays ROUNDS crossings in `el`. report(ok) after each one, onFinish() at the end. */
export function mount(el, { level = 0, report = () => {}, onFinish = () => {} } = {}) {
  let lv = level, round = 0, b = null, pos = 0, been = null, phase = '', timer = 0;

  function next() {
    clearTimeout(timer);
    if (round >= ROUNDS) return onFinish();
    round++;
    b = board(lv); pos = b.start; been = new Set([pos]); phase = 'look';
    paint();
    timer = setTimeout(go, lookMs(lv));
  }
  function go() { clearTimeout(timer); if (phase === 'look') { phase = 'go'; paint(); } }
  function step(i) {
    if (phase !== 'go' || !adjacent(pos, i, b.n)) return;
    pos = i; been.add(i);
    if (b.holes.has(i)) { phase = 'fell'; lv = Math.max(0, lv - 1); report(false); timer = setTimeout(next, 1600); }
    else if (i === b.goal) { phase = 'made'; lv++; report(true); timer = setTimeout(next, 900); }
    paint();
  }

  const MSG = { look: 'Memorizá los pozos', go: 'Cruzá hasta la bandera', fell: 'Uy, un pozo. Vamos con otro', made: '¡Llegaste!' };
  function paint() {
    const show = phase === 'look' || phase === 'fell';
    const cells = [...Array(b.n * b.n).keys()].map((i) => {
      const cls = ['cm-cell', show && b.holes.has(i) ? 'hole' : '', been.has(i) ? 'been' : '', i === pos ? 'here' : '',
        i === b.start ? 'start' : '', phase === 'go' && adjacent(pos, i, b.n) ? 'near' : ''].filter(Boolean).join(' ');
      return `<button type="button" class="${cls}" data-i="${i}" aria-label="Fila ${Math.floor(i / b.n) + 1}, columna ${(i % b.n) + 1}">${i === b.goal ? ic('flag') : i === pos ? '<span class="cm-me"></span>' : ''}</button>`;
    }).join('');
    el.innerHTML = `<p class="tr-msg ${phase}">${esc(MSG[phase])}</p>
      <div class="cm-grid" style="--n:${b.n}">${cells}</div>
      <div class="tr-foot"><span class="muted">Cruce ${round} de ${ROUNDS}</span>${phase === 'look' ? `<button class="btn small" data-cm-ready>${ic('check')} Ya está</button>` : ''}</div>`;
  }

  const onClick = (e) => {
    if (e.target.closest('[data-cm-ready]')) return go();
    const c = e.target.closest('[data-i]');
    if (c) step(+c.dataset.i);
  };
  const KEYS = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: 0, ArrowRight: 0 };
  const onKey = (e) => {
    if (!(e.key in KEYS) || !b) return;
    e.preventDefault();
    if (phase === 'look') return go();
    const n = b.n, d = { ArrowUp: -n, ArrowDown: n, ArrowLeft: -1, ArrowRight: 1 }[e.key], to = pos + d;
    if (to >= 0 && to < n * n && adjacent(pos, to, n)) step(to);
  };
  el.addEventListener('click', onClick);
  window.addEventListener('keydown', onKey);
  next();
  return {
    level: () => lv,
    destroy() { clearTimeout(timer); el.removeEventListener('click', onClick); window.removeEventListener('keydown', onKey); },
  };
}
