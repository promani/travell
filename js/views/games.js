// Juego del día: the same Tango for every traveler each day, with the day's ranking and the trip's records.
// Results are { id: "tango:<date>:<traveler>", game, date, traveler, ms } in the synced 'games' collection; the
// grid in progress stays on this phone. Nobody sees the others' times until they solve it themselves.
import { D, I, cols, kv, me } from '../store.js';
import { esc, ic, fmtShort, $ } from '../util.js';
import { register } from '../ui.js';
import { tripPhase } from '../tripstate.js';
import { who } from './tasks.js';
import * as tango from '../tango.js';

const GAME = 'tango';
export const today = () => tripPhase().today;
const fmtMs = (ms) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const name = (id) => I.traveler[id]?.name || id;

export const results = () => cols.live('games').filter((r) => r.game === GAME && Number.isFinite(r.ms));
export const resultsOf = (date) => results().filter((r) => r.date === date).sort((a, b) => a.ms - b.ms);
export const missing = (date) => { const doneBy = new Set(resultsOf(date).map((r) => r.traveler)); return D.travelers.filter((t) => !doneBy.has(t.id)); };

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

// ------------------------------------------------------------------ the board
let state = null;   // { date, p, cells, history, ms, since }
const saveKey = (date) => `game:${GAME}:${date}`;
const elapsed = () => state.ms + (state.since ? performance.now() - state.since : 0);
function persist() { kv.set(saveKey(state.date), { cells: state.cells, ms: Math.round(elapsed()) }); }
function pause() { if (state?.since) { state.ms = elapsed(); state.since = 0; persist(); } }
function resume() { if (state && !state.won && !state.since && !document.hidden) state.since = performance.now(); }

function boardHtml() {
  const { p, cells } = state;
  const bad = tango.mistakes(cells, p.signs);
  const signAt = {};
  for (const s of p.signs) signAt[s.a] = [...(signAt[s.a] || []), `<i class="tg-sign ${s.b === s.a + 1 ? 'h' : 'v'}">${s.eq ? '=' : '×'}</i>`];
  return cells.map((v, i) => {
    const fixed = !!p.givens[i];
    return `<button class="tg-cell${fixed ? ' fixed' : ''}${bad.has(i) ? ' bad' : ''}" data-act="tango-tap" data-i="${i}" ${fixed || state.won ? 'disabled' : ''}
      aria-label="${v === 1 ? 'Sol' : v === 2 ? 'Luna' : 'Vacía'}">${v === 1 ? ic('sun', 'tg-sun') : v === 2 ? ic('moon', 'tg-moon') : ''}${(signAt[i] || []).join('')}</button>`;
  }).join('');
}
function paint() {
  const el = $('#tg-board'); if (el) el.innerHTML = boardHtml();
  const u = $('#tg-undo'); if (u) u.disabled = !state.history.length;
}

function rankingHtml(date, showTimes) {
  const rs = resultsOf(date), miss = missing(date);
  return `<ol class="tg-rank">${rs.map((r, k) => `<li>${who(r.traveler)}<b>${esc(name(r.traveler))}</b>
      <span>${showTimes ? `${k === 0 && rs.length > 1 ? ic('trophy') + ' ' : ''}${fmtMs(r.ms)}` : `${ic('check')} Resuelto`}</span></li>`).join('')}
    ${miss.map((t) => `<li class="muted">${who(t.id)}<b>${esc(t.name)}</b><span>Falta</span></li>`).join('')}</ol>`;
}

function recordsHtml(date) {
  const all = results();
  if (!all.length) return '';
  const rows = standings(all, date);
  const past = [...new Set(all.map((r) => r.date))].filter((d) => d !== date).sort().reverse().slice(0, 7);
  return `<section class="card"><h3>${ic('ranking-star')} Récords del viaje</h3>
    <table class="bal tg-table"><thead><tr><th></th><th>Ganó</th><th>Jugó</th><th>Racha</th><th>Mejor</th></tr></thead><tbody>
    ${rows.map((s) => `<tr><td>${esc(name(s.id))}</td><td>${s.wins}</td><td>${s.played}</td><td>${s.streak ? `${s.streak} ${ic('fire')}` : '0'}</td><td>${s.best != null ? fmtMs(s.best) : '–'}</td></tr>`).join('')}
    </tbody></table>
    ${past.length ? `<h4>Días anteriores</h4><ul class="tg-past">${past.map((d) => { const rs = resultsOf(d); return `<li><b>${esc(fmtShort(d))}</b> ${rs.map((r) => `${esc(name(r.traveler))} ${fmtMs(r.ms)}`).join(' · ')}</li>`; }).join('')}</ul>` : ''}
  </section>`;
}

export function render(_, ctx) {
  const date = today(), mine = resultsOf(date).find((r) => r.traveler === me());
  ctx.title = 'Juego del día';
  if (state?.date !== date) {
    const saved = kv.get(saveKey(date), null), p = tango.puzzle(date);
    state = { date, p, cells: saved?.cells?.length === p.givens.length ? saved.cells : p.givens.slice(), history: [], ms: saved?.ms || 0, since: 0 };
  }
  state.won = !!mine;
  if (mine) state.cells = state.p.solution.slice();
  resume();
  const timer = setInterval(() => { const t = $('#tg-time'); if (t && state.since) t.textContent = fmtMs(elapsed()); }, 500);
  const onVis = () => (document.hidden ? pause() : resume());
  document.addEventListener('visibilitychange', onVis);
  ctx.cleanup(() => { clearInterval(timer); document.removeEventListener('visibilitychange', onVis); pause(); });

  return `<header class="pagehead"><h1>${ic('puzzle-piece')} Juego del día</h1>
    <p class="muted">Tango: completá la grilla con soles y lunas. Lo juegan todos, el mismo cada día; gana el más rápido.</p></header>
  <section class="card tg-card">
    <div class="card-head"><h3>${esc(fmtShort(date))}</h3><span class="tg-time" id="tg-time">${ic('stopwatch')} ${fmtMs(mine ? mine.ms : elapsed())}</span></div>
    ${mine ? `<p class="tg-won">${ic('champagne-glasses')} ¡Resuelto en ${fmtMs(mine.ms)}!</p>` : ''}
    <div class="tg-board" id="tg-board">${boardHtml()}</div>
    ${mine ? '' : `<div class="row-actions"><button class="btn small" id="tg-undo" data-act="tango-undo" ${state.history.length ? '' : 'disabled'}>${ic('rotate-left')} Deshacer</button>
      <button class="btn small" data-act="tango-clear">${ic('eraser')} Borrar</button></div>`}
    <details class="tg-rules"><summary>Reglas</summary><ul>
      <li>Cada casilla lleva un sol ${ic('sun', 'tg-sun')} o una luna ${ic('moon', 'tg-moon')}. Tocá para cambiarla.</li>
      <li>Nunca tres iguales seguidos, ni en fila ni en columna.</li>
      <li>Cada fila y cada columna tiene 3 soles y 3 lunas.</li>
      <li><b>=</b> une dos casillas iguales y <b>×</b> dos distintas.</li>
      <li>Hay una sola solución y se llega sin adivinar.</li></ul></details>
  </section>
  <section class="card"><h3>${ic('users')} Hoy</h3>${rankingHtml(date, !!mine)}
    ${mine ? '' : '<p class="hint">Los tiempos de los demás se ven cuando lo resolvés.</p>'}</section>
  ${mine ? recordsHtml(date) : ''}`;
}

/** Card for Inicio: shows up until everyone solved today's game. */
export function homeCard() {
  if (!me() || !D.travelers.length) return '';
  const date = today(), miss = missing(date);
  if (!miss.length) return '';
  const meMissing = miss.some((t) => t.id === me());
  const others = miss.filter((t) => t.id !== me()).map((t) => t.name);
  return `<a class="card tg-home${meMissing ? ' due' : ''}" href="#/juego">${ic('puzzle-piece')}<div><b>Juego del día${meMissing ? ': te toca' : ''}</b>
    <small>${others.length ? `Falta${others.length > 1 ? 'n' : ''} ${esc(others.join(', '))}` : 'Solo faltás vos'}</small></div><em>›</em></a>`;
}

register({
  'tango-tap': (el, _, app) => {
    if (!state || state.won) return;
    const i = +el.dataset.i;
    if (state.p.givens[i]) return;
    resume();
    state.history.push(state.cells.slice());
    state.cells[i] = (state.cells[i] + 1) % 3;
    if (tango.solved(state.cells, state.p.signs)) {
      const ms = Math.round(elapsed());
      state.ms = ms; state.since = 0; state.won = true; persist();
      cols.put('games', { id: `${GAME}:${state.date}:${me()}`, game: GAME, date: state.date, traveler: me(), ms }, { rebuild: false });
      app.rerender();
      return;
    }
    persist(); paint();
  },
  'tango-undo': () => { if (state?.history.length) { state.cells = state.history.pop(); persist(); paint(); } },
  'tango-clear': () => { if (!state || state.won) return; state.history.push(state.cells.slice()); state.cells = state.p.givens.slice(); persist(); paint(); },
});
