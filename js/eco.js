// Eco (like Peak's Rush Back): symbols come one at a time; for each, say whether it is the same as the one shown
// 1, 2 or 3 steps before (n-back). n stays fixed for a session and moves with how the last session went.
// A training exercise (Entrenar, js/views/train.js): no score is kept; the difficulty follows how it goes.
import { esc, ic } from './util.js';

const SYMBOLS = ['sun', 'moon', 'star', 'heart', 'leaf', 'fish', 'cloud', 'bolt', 'umbrella', 'snowflake', 'bell', 'feather', 'torii-gate', 'mug-hot'];
export const back = (level) => (level < 3 ? 1 : level < 6 ? 2 : 3);
const SAME = 0.4;

/** The next symbol: the one n steps back with probability SAME, otherwise any other from the pool. */
export function nextSymbol(seq, n, pool, rnd = Math.random) {
  const ref = seq.length >= n ? seq[seq.length - n] : null;
  if (ref && rnd() < SAME) return ref;
  const others = pool.filter((s) => s !== ref);
  return others[Math.floor(rnd() * others.length)];
}
/** The level after a session: up when nearly everything was right, down when it was a struggle. */
export const nextLevel = (level, hits, total) => (total < 10 ? level : hits / total >= 0.9 ? level + 1 : hits / total < 0.7 ? Math.max(0, level - 1) : level);

/** Shows symbols until the session ends (the view owns the clock). report(ok) after each answer. */
export function mount(el, { level = 0, report = () => {} } = {}) {
  const n = back(level), pool = [...SYMBOLS].sort(() => Math.random() - 0.5).slice(0, 7), seq = [];
  let hits = 0, total = 0, busy = false;
  const toAgo = n === 1 ? 'al anterior' : `al de ${n} antes`;
  el.innerHTML = `<div class="ec-arena">
      <p class="tr-msg" id="ec-ask"></p>
      <div class="ec-slot"><div class="ec-item" id="ec-item"></div></div>
      <div class="ec-btns" id="ec-btns"></div>
    </div>`;
  const $item = el.querySelector('#ec-item'), $ask = el.querySelector('#ec-ask'), $btns = el.querySelector('#ec-btns');

  function show() {
    seq.push(nextSymbol(seq, n, pool));
    const warm = seq.length <= n;
    $item.className = 'ec-item'; void $item.offsetWidth; $item.className = 'ec-item in';
    $item.innerHTML = ic(seq.at(-1));
    $ask.textContent = warm ? (seq.length === 1 ? (n === 1 ? 'Memorizalo: el que viene se compara con este' : `Memorizalo: cada símbolo se compara con el de ${n} antes`) : 'Este también') : `¿Es igual ${toAgo}?`;
    $btns.innerHTML = warm ? `<button type="button" class="btn primary ec-next" data-ec="next">Siguiente ${ic('arrow-right')}</button>`
      : `<button type="button" class="btn ec-no" data-ec="no">${ic('xmark')} No<small>←</small></button><button type="button" class="btn ec-yes" data-ec="yes">${ic('check')} Sí<small>→</small></button>`;
    busy = false;
  }
  function answer(a) {
    if (busy) return;
    if (seq.length <= n) { if (a === 'next') { busy = true; show(); } return; }
    if (a === 'next') return;
    busy = true;
    const ok = (seq.at(-1) === seq.at(-1 - n)) === (a === 'yes');
    hits += ok; total++;
    report(ok);
    $item.className = `ec-item ${ok ? 'ok' : 'wrong'}`;
    $item.insertAdjacentHTML('beforeend', `<span class="ec-mark">${ic(ok ? 'check' : 'xmark')}</span>`);
    setTimeout(show, ok ? 260 : 650);
  }
  const onClick = (e) => { const b = e.target.closest('[data-ec]'); if (b) answer(b.dataset.ec); };
  const onKey = (e) => {
    const a = { ArrowLeft: 'no', ArrowRight: 'yes', Enter: 'next', ' ': 'next' }[e.key];
    if (!a) return;
    e.preventDefault();
    answer(seq.length <= n ? 'next' : a);
  };
  el.addEventListener('click', onClick);
  window.addEventListener('keydown', onKey);
  show();
  return {
    level: () => nextLevel(level, hits, total),
    destroy() { el.removeEventListener('click', onClick); window.removeEventListener('keydown', onKey); },
  };
}
