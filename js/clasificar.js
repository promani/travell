// Clasificar (like Peak's Must Sort): figures come one at a time and go left or right by a rule that changes
// without warning: by colour, by shape and, further on, by how many there are. Swipe, tap a side or use ← →.
// A training exercise (Entrenar, js/views/train.js): no score is kept; the difficulty follows how it goes.
import { esc, ic } from './util.js';

const COLORS = [['rojo', 'Rojos', '#e8590c'], ['azul', 'Azules', '#1c7ed6'], ['verde', 'Verdes', '#2f9e44'], ['violeta', 'Violetas', '#ae3ec9']];
const SHAPES = [['circulo', 'Círculos'], ['cuadrado', 'Cuadrados'], ['triangulo', 'Triángulos'], ['estrella', 'Estrellas']];
const COUNTS = [[1, 'Uno solo'], [2, 'De a dos']];
const pick = (arr, k, rnd) => [...arr].sort(() => rnd() - 0.5).slice(0, k);

/** A session's two colours, two shapes and the rules in play (count only from level 5). */
export function deck(level, rnd = Math.random) {
  return { colors: pick(COLORS, 2, rnd), shapes: pick(SHAPES, 2, rnd), rules: level >= 5 ? ['color', 'shape', 'count'] : ['color', 'shape'] };
}
const options = (dk, rule) => (rule === 'color' ? dk.colors : rule === 'shape' ? dk.shapes : COUNTS);
const value = (card, rule) => (rule === 'color' ? card.color : rule === 'shape' ? card.shape : card.count);
export const dealCard = (dk, rnd = Math.random) => ({
  color: dk.colors[Math.floor(rnd() * 2)][0], shape: dk.shapes[Math.floor(rnd() * 2)][0],
  count: dk.rules.includes('count') ? 1 + Math.floor(rnd() * 2) : 1,
});
/** 'left' | 'right': where a card goes under a rule whose bins are [left option, right option]. */
export const sideOf = (card, bins, rule) => (value(card, rule) === bins[0][0] ? 'left' : 'right');
// cards before the rule changes: fewer as the level goes up
const runLength = (level, rnd) => { const hi = Math.max(3, 9 - level), lo = Math.max(1, hi - 3); return lo + Math.floor(rnd() * (hi - lo + 1)); };

const SVG = {
  circulo: '<circle cx="50" cy="50" r="36"/>',
  cuadrado: '<rect x="15" y="15" width="70" height="70" rx="9"/>',
  triangulo: '<polygon points="50,12 90,84 10,84" stroke-linejoin="round"/>',
  estrella: '<polygon points="50,8 61,38 93,38 67,57 77,89 50,70 23,89 33,57 7,38 39,38"/>',
};
const figure = (card, dk) => {
  const fill = dk.colors.find((c) => c[0] === card.color)[2], one = SVG[card.shape];
  return card.count === 2
    ? `<svg viewBox="0 0 200 100" fill="${fill}" aria-hidden="true"><g transform="translate(4 10) scale(.8)">${one}</g><g transform="translate(116 10) scale(.8)">${one}</g></svg>`
    : `<svg viewBox="0 0 100 100" fill="${fill}" aria-hidden="true">${one}</svg>`;
};
const binLabel = (opt, rule, dk) => (rule === 'color' ? `<i class="cs-dot" style="background:${opt[2]}"></i>${esc(opt[1])}`
  : rule === 'shape' ? `<svg class="cs-mini" viewBox="0 0 100 100" aria-hidden="true">${SVG[opt[0]]}</svg>${esc(opt[1])}` : esc(opt[1]));

/** Deals cards until the session ends (the view owns the clock). report(ok) after each card. */
export function mount(el, { level = 0, report = () => {} } = {}) {
  let lv = level, streak = 0, misses = 0, left = 0, rule = '', bins = null, card = null, busy = false;
  const dk = deck(level);
  el.innerHTML = `<div class="cs-arena">
      <p class="tr-msg" id="cs-rule"></p>
      <div class="cs-card-slot"><div class="cs-card" id="cs-card"></div></div>
      <div class="cs-bins"><button type="button" class="cs-bin" data-side="left"></button><button type="button" class="cs-bin" data-side="right"></button></div>
    </div>`;
  const $card = el.querySelector('#cs-card'), $rule = el.querySelector('#cs-rule'), $bins = el.querySelectorAll('.cs-bin');

  function newRule() {
    const others = dk.rules.filter((r) => r !== rule);
    rule = others[Math.floor(Math.random() * others.length)];
    bins = [...options(dk, rule)].sort(() => Math.random() - 0.5);
    left = runLength(lv, Math.random);
    $rule.innerHTML = `${ic('shuffle')} Ahora: por ${{ color: 'color', shape: 'forma', count: 'cantidad' }[rule]}`;
    $bins.forEach((b, i) => { b.innerHTML = `${i ? '' : ic('arrow-left')} ${binLabel(bins[i], rule, dk)} ${i ? ic('arrow-right') : ''}`; });
    el.querySelector('.cs-arena').classList.remove('switch'); void el.offsetWidth; el.querySelector('.cs-arena').classList.add('switch');
  }
  function deal() {
    if (left-- <= 0) newRule();
    card = dealCard(dk);
    $card.className = 'cs-card in';
    $card.style.transform = '';
    $card.innerHTML = figure(card, dk);
    busy = false;
  }
  function answer(side) {
    if (busy || !card) return;
    busy = true;
    const ok = sideOf(card, bins, rule) === side;
    report(ok);
    if (ok) { misses = 0; if (++streak >= 6) { streak = 0; lv++; } }
    else { streak = 0; if (++misses >= 2) { misses = 0; lv = Math.max(0, lv - 1); } }
    $card.style.transform = '';
    $card.className = `cs-card out-${side}${ok ? '' : ' wrong'}`;
    setTimeout(deal, ok ? 170 : 420);
  }

  // swipe on the card (or anywhere in the arena), tap on a side, or the arrow keys
  let x0 = null;
  const down = (e) => { if (e.target.closest('.cs-bin')) return; x0 = e.clientX; };
  const move = (e) => { if (x0 != null && !busy) $card.style.transform = `translateX(${e.clientX - x0}px) rotate(${(e.clientX - x0) / 20}deg)`; };
  const up = (e) => { if (x0 == null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 40) answer(dx < 0 ? 'left' : 'right'); else $card.style.transform = ''; };
  const onClick = (e) => { const b = e.target.closest('.cs-bin'); if (b) answer(b.dataset.side); };
  const onKey = (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); answer(e.key === 'ArrowLeft' ? 'left' : 'right'); } };
  const arena = el.querySelector('.cs-arena');
  arena.addEventListener('pointerdown', down); arena.addEventListener('pointermove', move);
  arena.addEventListener('pointerup', up); arena.addEventListener('pointercancel', () => { x0 = null; $card.style.transform = ''; });
  el.addEventListener('click', onClick);
  window.addEventListener('keydown', onKey);
  newRule(); deal();
  return {
    level: () => lv,
    destroy() { el.removeEventListener('click', onClick); window.removeEventListener('keydown', onKey); },
  };
}
