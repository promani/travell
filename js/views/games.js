// Juego del día: the same puzzles for every traveler each day (Tango, Zip, Queens, Patches), with the day's ranking and the trip's
// records per game. Results are { id: "<game>:<date>:<traveler>", game, date, traveler, ms } in the synced 'games'
// collection; a game in progress stays on this phone. Nobody sees the others' times until they solve it themselves.
import { D, I, cols, kv, me, bus } from '../store.js';
import { esc, ic, fmtShort, $ } from '../util.js';
import { register } from '../ui.js';
import { tripPhase } from '../tripstate.js';
import { syncConfigured } from '../sync.js';
import { who } from './tasks.js';
import * as tango from '../tango.js';
import * as zip from '../zip.js';
import * as queens from '../queens.js';
import * as patches from '../patches.js';

export const today = () => tripPhase().today;
const fmtMs = (ms) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const name = (id) => I.traveler[id]?.name || id;

// ------------------------------------------------------------------ results
export const results = (game) => cols.live('games').filter((r) => r.game === game && Number.isFinite(r.ms));
export const resultsOf = (game, date) => results(game).filter((r) => r.date === date).sort((a, b) => a.ms - b.ms);
export const missing = (game, date) => { const doneBy = new Set(resultsOf(game, date).map((r) => r.traveler)); return D.travelers.filter((t) => !doneBy.has(t.id)); };

/** Per traveler: days played, days won (fastest that day), best time and current streak (up to today or yesterday). */
export function standings(all, todayISO) {
  const byDate = {};
  for (const r of all) (byDate[r.date] ||= []).push(r);
  return D.travelers.map((t) => {
    const mine = all.filter((r) => r.traveler === t.id);
    const wins = Object.values(byDate).filter((rs) => rs.length > 1 && rs.reduce((a, b) => (b.ms < a.ms ? b : a)).traveler === t.id).length;
    const dates = new Set(mine.map((r) => r.date));
    let streak = 0, d = dates.has(todayISO) ? todayISO : shift(todayISO, -1);
    while (dates.has(d)) { streak++; d = shift(d, -1); }
    return { id: t.id, played: mine.length, wins, best: mine.length ? Math.min(...mine.map((r) => r.ms)) : null, streak };
  }).sort((a, b) => b.wins - a.wins || b.played - a.played || (a.best ?? 1e12) - (b.best ?? 1e12));
}
function shift(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

// ------------------------------------------------------------------ the games
// Each game: how to build the day's puzzle, the empty and the solved play, the board and its rules.
const GAMES = {
  tango: {
    label: 'Tango', icon: 'sun',
    intro: 'Completá la grilla con soles y lunas.',
    puzzle: (date) => tango.puzzle(date),
    empty: (p) => p.givens.slice(),
    solution: (p) => p.solution.slice(),
    valid: (data, p) => Array.isArray(data) && data.length === p.givens.length,
    board: tangoBoard,
    rules: `<li>Cada casilla lleva un sol ${ic('sun', 'tg-sun')} o una luna ${ic('moon', 'tg-moon')}. Tocá para cambiarla.</li>
      <li>Nunca tres iguales seguidos, ni en fila ni en columna.</li>
      <li>Cada fila y cada columna tiene 3 soles y 3 lunas.</li>
      <li><b>=</b> une dos casillas iguales y <b>×</b> dos distintas.</li>
      <li>Hay una sola solución y se llega sin adivinar.</li>`,
  },
  zip: {
    label: 'Zip', icon: 'route',
    intro: 'Uní los números en orden con un solo camino que pase por todas las casillas.',
    puzzle: (date) => zip.puzzle(date),
    empty: () => [],
    solution: (p) => p.solution.slice(),
    valid: (data) => Array.isArray(data),
    board: zipBoard,
    rules: `<li>Empezá en el <b>1</b> y arrastrá el dedo de casilla en casilla (arriba, abajo o a los costados).</li>
      <li>Pasá por los números en orden y terminá en el último.</li>
      <li>El camino tiene que pasar por <b>todas</b> las casillas, una sola vez. Las paredes no se cruzan.</li>
      <li>Para volver atrás, arrastrá hacia atrás o tocá una casilla del camino.</li>`,
  },
  queens: {
    label: 'Queens', icon: 'crown',
    intro: 'Poné una reina por fila, por columna y por color, sin que se toquen.',
    puzzle: (date) => queens.puzzle(date),
    empty: () => Array(queens.N * queens.N).fill(0),
    solution: (p) => { const m = Array(queens.N * queens.N).fill(0); p.solution.forEach((i) => { m[i] = 2; }); return m; },
    valid: (data) => Array.isArray(data) && data.length === queens.N * queens.N,
    board: queensBoard,
    rules: `<li>Una reina ${ic('crown')} en cada fila, en cada columna y en cada región de color.</li>
      <li>Dos reinas nunca se tocan, ni siquiera en diagonal.</li>
      <li>Tocá una vez para marcar una cruz (donde no puede ir) y otra vez para poner la reina. Arrastrá para marcar varias cruces.</li>
      <li>Hay una sola solución y se llega sin adivinar.</li>`,
  },
  patches: {
    label: 'Patches', icon: 'table-cells-large',
    intro: 'Dividí la grilla en rectángulos, uno por pista, del tamaño y la forma que dice.',
    puzzle: (date) => patches.puzzle(date),
    empty: () => [],
    solution: (p) => p.solution.map((r) => ({ ...r })),
    valid: (data) => Array.isArray(data) && data.every((r) => Number.isInteger(r?.w)),
    board: patchesBoard,
    rules: `<li>Arrastrá el dedo para dibujar un rectángulo; tocalo para borrarlo.</li>
      <li>Cada rectángulo tiene exactamente una pista y entre todos cubren la grilla.</li>
      <li>El número es la cantidad de casillas. La forma dice si es un cuadrado <span class="pt-shape square"></span>, más ancho que alto <span class="pt-shape wide"></span> o más alto que ancho <span class="pt-shape tall"></span>.</li>
      <li>Hay una sola solución.</li>`,
  },
};
const KEYS = Object.keys(GAMES);

// ------------------------------------------------------------------ the game being played
let state = null;   // { game, date, p, data, history, ms, since, won, started, cheer }
const saveKey = (game, date) => `game:${game}:${date}`;
const elapsed = () => state.ms + (state.since ? performance.now() - state.since : 0);
function persist() { kv.set(saveKey(state.game, state.date), { data: state.data, ms: Math.round(elapsed()) }); }
function pause() { if (state?.since) { state.ms = elapsed(); state.since = 0; persist(); } }
function resume() { if (state?.started && !state.won && !state.since && !document.hidden) state.since = performance.now(); }
function load(game, date) {
  if (state?.game === game && state.date === date) return;
  pause();
  const g = GAMES[game], p = g.puzzle(date), saved = kv.get(saveKey(game, date), null);
  const data = saved?.data ?? saved?.cells;   // older saves of Tango kept the grid as 'cells'
  state = { game, date, p, data: g.valid(data, p) ? data : g.empty(p), history: [], ms: saved?.ms || 0, since: 0, started: !!saved };
}
function paint() {
  const el = $('#tg-board'); if (el) el.innerHTML = GAMES[state.game].board();
  const u = $('#tg-undo'); if (u) u.disabled = !state.history.length;
}
function finish() {
  const ms = Math.round(elapsed());
  state.ms = ms; state.since = 0; state.won = true; state.cheer = true; persist();
  cols.put('games', { id: `${state.game}:${state.date}:${me()}`, game: state.game, date: state.date, traveler: me(), ms }, { rebuild: false });
  bus.emit('rerender');
}

// ------------------------------------------------------------------ Tango board
function tangoBoard() {
  const { p, data: cells } = state;
  const bad = tango.mistakes(cells, p.signs);
  const signAt = {};
  for (const s of p.signs) signAt[s.a] = [...(signAt[s.a] || []), `<i class="tg-sign ${s.b === s.a + 1 ? 'h' : 'v'}">${s.eq ? '=' : '×'}</i>`];
  return cells.map((v, i) => {
    const fixed = !!p.givens[i];
    return `<button class="tg-cell${fixed ? ' fixed' : ''}${bad.has(i) ? ' bad' : ''}" data-act="tango-tap" data-i="${i}" ${fixed || state.won ? 'disabled' : ''}
      aria-label="${v === 1 ? 'Sol' : v === 2 ? 'Luna' : 'Vacía'}">${v === 1 ? ic('sun', 'tg-sun') : v === 2 ? ic('moon', 'tg-moon') : ''}${(signAt[i] || []).join('')}</button>`;
  }).join('');
}

// ------------------------------------------------------------------ Zip board
function zipBoard() {
  const { p, data: path } = state, N = zip.N;
  const on = new Set(path), last = path[path.length - 1];
  const walls = {};
  for (const w of p.walls) { const [a, b] = w.split('-').map(Number); walls[a] = (walls[a] || '') + (b === a + 1 ? ' wall-r' : ' wall-b'); }
  const pts = path.map((i) => `${(i % N) + 0.5},${Math.floor(i / N) + 0.5}`).join(' ');
  return `${[...Array(N * N)].map((_, i) => `<div class="zp-cell${on.has(i) ? ' on' : ''}${i === last ? ' head' : ''}${walls[i] || ''}" data-i="${i}">${p.nums[i] ? `<b class="zp-num${on.has(i) ? ' done' : ''}">${p.nums[i]}</b>` : ''}</div>`).join('')}
    <svg class="zp-path" viewBox="0 0 ${N} ${N}" aria-hidden="true">${path.length > 1 ? `<polyline points="${pts}"/>` : ''}</svg>`;
}
// Dragging: the path follows the finger one cell at a time; going back over it shortens it.
function bindZip(board) {
  let dragging = false;
  const cellAt = (e) => {
    const r = board.getBoundingClientRect(), N = zip.N;
    const c = Math.floor(((e.clientX - r.left) / r.width) * N), y = Math.floor(((e.clientY - r.top) / r.height) * N);
    return c < 0 || y < 0 || c >= N || y >= N ? -1 : y * N + c;
  };
  const toward = (i) => {   // walk from the end of the path to cell i, one neighbour at a time
    const path = state.data, N = zip.N;
    for (let guard = 0; guard < 2 * N; guard++) {
      const last = path[path.length - 1];
      if (last === i) return true;
      const k = path.indexOf(i);
      if (k >= 0) { if (k === path.length - 2) path.pop(); return true; }
      const dr = Math.floor(i / N) - Math.floor(last / N), dc = (i % N) - (last % N);
      const vert = dr ? last + Math.sign(dr) * N : null, horiz = dc ? last + Math.sign(dc) : null;
      const steps = Math.abs(dr) >= Math.abs(dc) ? [vert, horiz] : [horiz, vert];
      const next = steps.find((s) => s != null && zip.canStep(path, s, state.p));
      if (next === undefined) return false;
      path.push(next);
    }
    return false;
  };
  board.addEventListener('pointerdown', (e) => {
    if (!state || state.won || state.game !== 'zip') return;
    const i = cellAt(e); if (i < 0) return;
    const before = state.data.slice(), k = state.data.indexOf(i);
    if (k >= 0) state.data.splice(k + 1);
    else if (state.p.nums[i] === 1) state.data = [i];
    else if (!state.data.length || !toward(i)) return;
    resume();
    if (before.join() !== state.data.join()) state.history.push(before);
    dragging = true;
    board.setPointerCapture?.(e.pointerId);
    paint();
  });
  board.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const i = cellAt(e), n = state.data.length;
    if (i < 0 || i === state.data[n - 1]) return;
    if (i === state.data[n - 2]) state.data.pop(); else toward(i);
    if (state.data.length !== n) paint();
  });
  const up = () => {
    if (!dragging) return;
    dragging = false;
    if (zip.solved(state.data, state.p)) finish(); else persist();
  };
  board.addEventListener('pointerup', up);
  board.addEventListener('pointercancel', up);
}

// ------------------------------------------------------------------ Queens board
const REGION_COLORS = ['#f6b8c6', '#a9d3f5', '#c4e3a8', '#ffdf85', '#d2bff2', '#ffc596', '#9fe3d6', '#d9d4cc'];
function queensBoard() {
  const { p, data: marks } = state, N = queens.N, reg = p.regions;
  const bad = queens.clashes(marks, reg);
  return marks.map((v, i) => {
    const edges = `${i % N < N - 1 && reg[i + 1] !== reg[i] ? ' br' : ''}${i < N * (N - 1) && reg[i + N] !== reg[i] ? ' bb' : ''}`;
    return `<div class="qn-cell${edges}${bad.has(i) ? ' bad' : ''}" data-i="${i}" style="--c:${REGION_COLORS[reg[i]]}">${v === 2 ? ic('crown') : v === 1 ? '<i class="qn-x">×</i>' : ''}</div>`;
  }).join('');
}
// Tap: empty → cross → queen → empty. Dragging from an empty cell crosses out every empty cell it goes over.
function bindQueens(board) {
  let start = -1, dragging = false, before = null;
  const cellAt = (e) => {
    const r = board.getBoundingClientRect(), N = queens.N;
    const c = Math.floor(((e.clientX - r.left) / r.width) * N), y = Math.floor(((e.clientY - r.top) / r.height) * N);
    return c < 0 || y < 0 || c >= N || y >= N ? -1 : y * N + c;
  };
  const check = () => { if (queens.solved(state.data, state.p.regions)) finish(); else { persist(); paint(); } };
  board.addEventListener('pointerdown', (e) => {
    if (!state || state.won || state.game !== 'queens') return;
    start = cellAt(e); if (start < 0) return;
    dragging = false; before = state.data.slice();
    resume();
    board.setPointerCapture?.(e.pointerId);
  });
  board.addEventListener('pointermove', (e) => {
    if (start < 0) return;
    const i = cellAt(e);
    if (i < 0 || (i === start && !dragging)) return;
    if (!dragging) { if (state.data[start] !== 0) { start = -1; return; } dragging = true; state.data[start] = 1; }
    if (state.data[i] === 0) { state.data[i] = 1; paint(); }
  });
  const up = (e) => {
    if (start < 0) return;
    if (!dragging && e.type === 'pointerup') state.data[start] = (state.data[start] + 1) % 3;
    if (before.join() !== state.data.join()) state.history.push(before);
    start = -1; dragging = false;
    check();
  };
  board.addEventListener('pointerup', up);
  board.addEventListener('pointercancel', up);
}

// ------------------------------------------------------------------ Patches board
const PATCH_COLORS = ['#f6b8c6', '#a9d3f5', '#c4e3a8', '#ffdf85', '#d2bff2', '#ffc596', '#9fe3d6', '#f2c4e6', '#b9e0a5', '#ffd3b0', '#b8c7f5', '#e6dca0'];
let patchDraft = null;
function patchesBoard() {
  const { p, data: rects } = state, N = patches.N, pct = (v) => `${(v / N) * 100}%`;
  const box = (r, cls, color) => `<div class="pt-patch ${cls}" style="left:${pct(r.c)};top:${pct(r.r)};width:${pct(r.w)};height:${pct(r.h)}${color ? `;--c:${color}` : ''}"></div>`;
  const patchesHtml = rects.map((r) => { const ks = patches.cluesIn(r, p); return box(r, ks.length === 1 ? (patches.goodPatch(r, p) ? 'ok' : 'off') : 'bad', ks.length === 1 ? PATCH_COLORS[ks[0] % PATCH_COLORS.length] : ''); }).join('');
  const clueAt = new Map(p.clues.map((k) => [k.cell, k]));
  const cells = [...Array(N * N)].map((_, i) => { const k = clueAt.get(i); return `<div class="pt-cell">${k ? `<b class="pt-clue">${k.shape ? `<span class="pt-shape ${k.shape}"></span>` : ''}${k.area ?? ''}</b>` : ''}</div>`; }).join('');
  return `${cells}${patchesHtml}${patchDraft ? box(patchDraft, 'draft') : ''}`;
}
// Drag from one cell to another to draw a patch (it replaces the ones it overlaps); a tap on a patch removes it.
function bindPatches(board) {
  let start = -1, before = null;
  const N = patches.N;
  const cellAt = (e) => {
    const r = board.getBoundingClientRect();
    const c = Math.min(N - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * N))), y = Math.min(N - 1, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * N)));
    return y * N + c;
  };
  const rectOf = (a, b) => { const r0 = Math.min(Math.floor(a / N), Math.floor(b / N)), r1 = Math.max(Math.floor(a / N), Math.floor(b / N)), c0 = Math.min(a % N, b % N), c1 = Math.max(a % N, b % N); return { r: r0, c: c0, w: c1 - c0 + 1, h: r1 - r0 + 1 }; };
  const holds = (rect, i) => patches.cellsOf(rect).includes(i);
  board.addEventListener('pointerdown', (e) => {
    if (!state || state.won || state.game !== 'patches') return;
    start = cellAt(e); before = state.data.map((r) => ({ ...r })); patchDraft = null;
    resume();
    board.setPointerCapture?.(e.pointerId);
  });
  board.addEventListener('pointermove', (e) => {
    if (start < 0) return;
    const i = cellAt(e);
    if (i === start && !patchDraft) return;
    patchDraft = rectOf(start, i);
    paint();
  });
  const up = (e) => {
    if (start < 0) return;
    if (patchDraft && e.type === 'pointerup') {
      const cells = patches.cellsOf(patchDraft);
      state.data = state.data.filter((r) => !patches.cellsOf(r).some((i) => cells.includes(i)));
      state.data.push(patchDraft);
    } else if (!patchDraft) {
      state.data = state.data.filter((r) => !holds(r, start));
    }
    patchDraft = null; start = -1;
    if (JSON.stringify(before) !== JSON.stringify(state.data)) state.history.push(before);
    if (patches.solved(state.data, state.p)) finish(); else { persist(); paint(); }
  };
  board.addEventListener('pointerup', up);
  board.addEventListener('pointercancel', up);
}

// ------------------------------------------------------------------ page
// Results only reach the other phones through the group sync: without it (or without saying who you are) the
// ranking can only show this phone, so say so instead of letting it look like nobody else played.
export function shareHint() {
  if (!me()) return `<p class="tg-hint">${ic('circle-info')} Para entrar en el ranking, <a href="#/viajeros#quien">elegí quién sos</a> en este celular.</p>`;
  if (!syncConfigured()) return `<p class="tg-hint">${ic('circle-info')} Para ver los tiempos de los demás (y que vean los tuyos), <a href="#/viajeros#sync">activá la sincronización del grupo</a> en Más → Viajeros, con el mismo código del grupo que el resto.</p>`;
  return '';
}

function rankingHtml(game, date, showTimes) {
  const rs = resultsOf(game, date), miss = missing(game, date);
  return `<ol class="tg-rank">${rs.map((r, k) => `<li>${who(r.traveler)}<b>${esc(name(r.traveler))}</b>
      <span>${showTimes ? `${k === 0 && rs.length > 1 ? ic('trophy') + ' ' : ''}${fmtMs(r.ms)}` : `${ic('check')} Resuelto`}</span></li>`).join('')}
    ${miss.map((t) => `<li class="muted">${who(t.id)}<b>${esc(t.name)}</b><span>Falta</span></li>`).join('')}</ol>`;
}

function recordsHtml(game, date) {
  const all = results(game);
  if (!all.length) return '';
  const rows = standings(all, date);
  const past = [...new Set(all.map((r) => r.date))].filter((d) => d !== date).sort().reverse().slice(0, 7);
  return `<section class="card"><h3>${ic('ranking-star')} Récords de ${esc(GAMES[game].label)}</h3>
    <table class="bal tg-table"><thead><tr><th></th><th>Ganó</th><th>Jugó</th><th>Racha</th><th>Mejor</th></tr></thead><tbody>
    ${rows.map((s) => `<tr><td>${esc(name(s.id))}</td><td>${s.wins}</td><td>${s.played}</td><td>${s.streak ? `${s.streak} ${ic('fire')}` : '0'}</td><td>${s.best != null ? fmtMs(s.best) : '–'}</td></tr>`).join('')}
    </tbody></table>
    ${past.length ? `<h4>Días anteriores</h4><ul class="tg-past">${past.map((d) => `<li><b>${esc(fmtShort(d))}</b> ${resultsOf(game, d).map((r) => `${esc(name(r.traveler))} ${fmtMs(r.ms)}`).join(' · ')}</li>`).join('')}</ul>` : ''}
  </section>`;
}

const solvedByMe = (game, date) => resultsOf(game, date).find((r) => r.traveler === me());

export function render(params, ctx) {
  const date = today();
  const game = GAMES[params.g] ? params.g : KEYS.find((k) => !solvedByMe(k, date)) || KEYS[0];
  const g = GAMES[game], mine = solvedByMe(game, date);
  ctx.title = `${g.label} · Juego del día`;
  load(game, date);
  state.won = !!mine;
  if (mine) state.data = g.solution(state.p);
  resume();
  const timer = setInterval(() => { const t = $('#tg-time'); if (t && state.since) t.innerHTML = `${ic('stopwatch')} ${fmtMs(elapsed())}`; }, 500);
  const onVis = () => (document.hidden ? pause() : resume());
  document.addEventListener('visibilitychange', onVis);
  ctx.cleanup(() => { clearInterval(timer); document.removeEventListener('visibilitychange', onVis); pause(); });
  if (game === 'zip') ctx.after(() => { const b = $('#tg-board'); if (b) bindZip(b); });
  if (game === 'queens') ctx.after(() => { const b = $('#tg-board'); if (b) bindQueens(b); });
  if (game === 'patches') ctx.after(() => { const b = $('#tg-board'); if (b) bindPatches(b); });
  if (state.cheer) { state.cheer = false; ctx.after(celebrate); }
  const cover = !mine && !state.started;
  const startBox = counting ? '<span class="tg-count">…</span>' : `<button class="btn primary" data-act="game-start">${ic('play')} Iniciar</button>`;   // the board stays hidden until "Iniciar" and the countdown

  const tabs = KEYS.map((k) => `<a class="chip${k === game ? ' on' : ''}${solvedByMe(k, date) ? ' done' : ''}" href="#/juego?g=${k}" ${k === game ? 'aria-current="page"' : ''}${solvedByMe(k, date) ? ` aria-label="${esc(GAMES[k].label)}, resuelto"` : ''}>${ic(GAMES[k].icon)} ${esc(GAMES[k].label)}</a>`).join('');
  return `<header class="pagehead"><h1>${ic('puzzle-piece')} Juego del día</h1>
    <p class="muted">Los juegan todos, los mismos cada día; gana el más rápido.</p>
    <nav class="chips tg-tabs" aria-label="Juegos">${tabs}</nav></header>
  <section class="card tg-card">
    <div class="card-head"><h3>${esc(g.label)} · ${esc(fmtShort(date))}</h3><span class="tg-time" id="tg-time">${ic('stopwatch')} ${fmtMs(mine ? mine.ms : elapsed())}</span></div>
    <p class="hint">${esc(g.intro)}</p>
    ${mine ? `<p class="tg-won">${ic('champagne-glasses')} ¡Resuelto en ${fmtMs(mine.ms)}!</p>` : ''}
    <div class="tg-stage${cover ? ' covered' : ''}" id="tg-stage">
      <div class="tg-board ${game === 'zip' ? 'zp-board' : game === 'queens' ? 'qn-board' : game === 'patches' ? 'pt-board' : ''}" id="tg-board">${g.board()}</div>
      ${cover ? `<div class="tg-start" id="tg-start">${startBox}</div>` : ''}
    </div>
    ${mine ? '' : `<div class="row-actions"><button class="btn small" id="tg-undo" data-act="game-undo" ${state.history.length ? '' : 'disabled'}>${ic('rotate-left')} Deshacer</button>
      <button class="btn small" data-act="game-clear">${ic('eraser')} Borrar</button></div>`}
    <details class="tg-rules"><summary>Reglas</summary><ul>${g.rules}</ul></details>
  </section>
  <section class="card"><h3>${ic('users')} Hoy</h3>${shareHint()}${rankingHtml(game, date, !!mine)}
    ${mine ? '' : '<p class="hint">Los tiempos de los demás se ven cuando lo resolvés.</p>'}</section>
  ${mine ? recordsHtml(game, date) : ''}`;
}

/** Card for Inicio: shows up until everyone solved today's games. */
export function homeCard() {
  if (!me() || !D.travelers.length) return '';
  const date = today();
  const pending = KEYS.map((k) => ({ k, miss: missing(k, date) })).filter((x) => x.miss.length);
  if (!pending.length) return '';
  const mineLeft = pending.filter((x) => x.miss.some((t) => t.id === me())).map((x) => GAMES[x.k].label);
  // others, grouped by person: "Sole, Facundo (Zip)" — no list when they still have every game to play
  const others = D.travelers.filter((t) => t.id !== me()).map((t) => ({ t, left: pending.filter((x) => x.miss.some((m) => m.id === t.id)).map((x) => GAMES[x.k].label) }))
    .filter((x) => x.left.length).map(({ t, left }) => (left.length === KEYS.length ? t.name : `${t.name} (${left.join(', ')})`));
  const lines = others.length ? [`Falta${others.length > 1 ? 'n' : ''} ${others.join(', ')}`] : [];
  const href = mineLeft.length ? `#/juego?g=${pending.find((x) => x.miss.some((t) => t.id === me())).k}` : '#/juego';
  return `<a class="card tg-home${mineLeft.length ? ' due' : ''}" href="${href}">${ic('puzzle-piece')}<div><b>Juego del día${mineLeft.length ? `: te ${mineLeft.length > 1 ? 'faltan' : 'falta'} ${esc(mineLeft.join(' y '))}` : ''}</b>
    <small>${esc(syncConfigured() ? lines.join(' · ') || 'Solo faltás vos' : 'Activá la sincronización del grupo para ver quién ya jugó')}</small></div><em>›</em></a>`;
}

// Confetti over the page and a bounce of the board when the game is solved.
const CONFETTI = ['#f59f00', '#4c6ef5', '#12b886', '#fa5252', '#be4bdb', '#fcc419'];
function celebrate() {
  $('#tg-board')?.classList.add('tg-cheer');
  navigator.vibrate?.([60, 40, 120]);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div');
  box.className = 'tg-confetti'; box.setAttribute('aria-hidden', 'true');
  box.innerHTML = Array.from({ length: 70 }, (_, k) => `<i style="left:${Math.random() * 100}%;background:${CONFETTI[k % CONFETTI.length]};--dx:${(Math.random() - 0.5) * 30}vw;--r:${Math.round(Math.random() * 720 - 360)}deg;animation-delay:${(Math.random() * 0.5).toFixed(2)}s;animation-duration:${(1.8 + Math.random() * 1.2).toFixed(2)}s"></i>`).join('');
  document.body.append(box);
  setTimeout(() => box.remove(), 3800);
}

// "Iniciar": a 4-second countdown over the hidden board, then the clock starts.
const COUNTDOWN = 4;
let counting = null;
function startCountdown() {
  if (!state || state.started || state.won || counting) return;
  const key = state.game + state.date;
  let n = COUNTDOWN;
  // looked up every tick: a re-render (a sync from another phone) may replace the overlay
  const show = () => { const box = $('#tg-start'); if (box) box.innerHTML = `<span class="tg-count" aria-live="assertive">${n || '¡Ya!'}</span>`; };
  show();
  counting = setInterval(() => {
    // left the page or changed game during the countdown: nothing starts
    if (!$('#tg-start') || !state || state.game + state.date !== key) { clearInterval(counting); counting = null; return; }
    n--;
    show();
    if (n > 0) return;
    clearInterval(counting); counting = null;
    state.started = true; persist(); resume();
    $('#tg-stage')?.classList.remove('covered');
    setTimeout(() => $('#tg-start')?.remove(), 350);
  }, 1000);
}

register({
  'game-start': startCountdown,
  'tango-tap': (el) => {
    if (!state || state.won || state.game !== 'tango') return;
    const i = +el.dataset.i;
    if (state.p.givens[i]) return;
    resume();
    state.history.push(state.data.slice());
    state.data[i] = (state.data[i] + 1) % 3;
    if (tango.solved(state.data, state.p.signs)) return finish();
    persist(); paint();
  },
  'game-undo': () => { if (state?.history.length && !state.won) { state.data = state.history.pop(); persist(); paint(); } },
  'game-clear': () => { if (!state?.started || state.won) return; state.history.push(state.data.slice()); state.data = GAMES[state.game].empty(state.p); persist(); paint(); },
});
