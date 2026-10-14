// Tango (like LinkedIn's): fill a 6×6 grid with suns (1) and moons (2). Every row and column has 3 of each, never
// 3 equal cells in a row, '=' joins two equal cells and '×' two different ones. The puzzle of a date is the same on
// every phone (seeded by the date) and has a single solution; among several candidates the hardest is kept (about
// half of the days need trying options).
export const N = 6;
const HALF = N / 2;

// ------------------------------------------------------------------ seeded random
function hash(s) { let h = 1779033703 ^ s.length; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return h >>> 0; }
export function rng(seed) {
  let a = hash(String(seed));
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const shuffle = (arr, rnd) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

// ------------------------------------------------------------------ lines
// Every row and column as a list of cell indexes (0..35).
const LINES = [];
for (let r = 0; r < N; r++) LINES.push([...Array(N)].map((_, c) => r * N + c));
for (let c = 0; c < N; c++) LINES.push([...Array(N)].map((_, r) => r * N + c));

// A random full grid that follows the row/column rules.
function solution(rnd) {
  const g = Array(N * N).fill(0);
  const ok = (i) => {
    const r = Math.floor(i / N), c = i % N, v = g[i];
    if (c >= 2 && g[i - 1] === v && g[i - 2] === v) return false;
    if (r >= 2 && g[i - N] === v && g[i - 2 * N] === v) return false;
    let row = 0, col = 0;
    for (let k = 0; k <= c; k++) row += g[r * N + k] === v;
    for (let k = 0; k <= r; k++) col += g[k * N + c] === v;
    return row <= HALF && col <= HALF;
  };
  const fill = (i) => {
    if (i === N * N) return true;
    for (const v of rnd() < 0.5 ? [1, 2] : [2, 1]) { g[i] = v; if (ok(i) && fill(i + 1)) return true; }
    g[i] = 0; return false;
  };
  fill(0);
  return g;
}

// ------------------------------------------------------------------ logic solver
// Applies only forced deductions. Returns the grid as far as it gets (0 = still unknown), or null on a contradiction.
// signs: [{a, b, eq}] between neighbouring cells.
export function deduce(start, signs) {
  const g = start.slice();
  const set = (i, v) => { if (g[i] === v) return false; if (g[i]) throw 0; g[i] = v; return true; };
  const other = (v) => 3 - v;
  try {
    for (let changed = true; changed;) {
      changed = false;
      for (const { a, b, eq } of signs) {
        if (g[a] && !g[b]) changed = set(b, eq ? g[a] : other(g[a])) || changed;
        else if (g[b] && !g[a]) changed = set(a, eq ? g[b] : other(g[b])) || changed;
        else if (g[a] && g[b] && (g[a] === g[b]) !== eq) throw 0;
      }
      for (const line of LINES) {
        for (let k = 0; k + 2 < N; k++) {
          const [x, y, z] = [line[k], line[k + 1], line[k + 2]];
          if (g[x] && g[x] === g[y]) { if (g[z] === g[x]) throw 0; changed = set(z, other(g[x])) || changed; }
          if (g[y] && g[y] === g[z]) changed = set(x, other(g[y])) || changed;
          if (g[x] && g[x] === g[z]) changed = set(y, other(g[x])) || changed;
        }
        for (const v of [1, 2]) {
          const n = line.filter((i) => g[i] === v).length;
          if (n > HALF) throw 0;
          if (n === HALF) for (const i of line) if (!g[i]) changed = set(i, other(v)) || changed;
        }
      }
    }
  } catch { return null; }
  return g;
}

// One step ahead: when a value in an empty cell leads the forced deductions to a contradiction, the cell takes the other
// value. Returns the grid as far as it gets, or null on a contradiction.
export function deduceAhead(start, signs) {
  let g = deduce(start, signs);
  for (let progress = true; g && progress;) {
    progress = false;
    for (let i = 0; i < N * N && !progress; i++) {
      if (g[i]) continue;
      for (const v of [1, 2]) {
        const t = g.slice(); t[i] = v;
        if (!deduce(t, signs)) { g[i] = 3 - v; g = deduce(g, signs); progress = true; break; }
      }
    }
  }
  return g;
}
const full = (g) => !!g && g.every(Boolean);

/** Number of solutions, stopping at cap. */
export function count(start, signs, cap = 2) {
  const g = deduce(start, signs);
  if (!g) return 0;
  const i = g.indexOf(0);
  if (i < 0) return mistakes(g, signs).size ? 0 : 1;
  let n = 0;
  for (const v of [1, 2]) { if (n >= cap) break; const t = g.slice(); t[i] = v; n += count(t, signs, cap - n); }
  return n;
}

/** How hard a puzzle is: 0 forced deductions solve it, 1 it needs looking one step ahead, 2 it needs trying options. */
export const level = (p) => (full(deduce(p.givens, p.signs)) ? 0 : full(deduceAhead(p.givens, p.signs)) ? 1 : 2);

// One candidate. Each neighbouring pair can carry a sign; clues are given cells and signs. Starting from every cell and
// a random third of the pairs as signs, in random order, drop every clue the solution stays unique without, keeping a
// few signs (like LinkedIn's).
function candidate(rnd) {
  const sol = solution(rnd);
  const pairs = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const i = r * N + c;
    if (c < N - 1) pairs.push([i, i + 1]);
    if (r < N - 1) pairs.push([i, i + N]);
  }
  let clues = shuffle([
    ...sol.map((v, i) => ({ cell: i })),
    ...shuffle(pairs, rnd).slice(0, Math.round(pairs.length / 3)).map(([a, b]) => ({ a, b, eq: sol[a] === sol[b] })),
  ], rnd);
  const build = (cs) => {
    const givens = Array(N * N).fill(0);
    for (const c of cs) if ('cell' in c) givens[c.cell] = sol[c.cell];
    return { givens, signs: cs.filter((c) => 'a' in c).map(({ a, b, eq }) => ({ a, b, eq })), solution: sol };
  };
  const MIN_SIGNS = 3;
  for (const c of clues.slice()) {
    if ('a' in c && clues.filter((x) => 'a' in x).length <= MIN_SIGNS) continue;
    const without = clues.filter((x) => x !== c), p = build(without);
    if (count(p.givens, p.signs) === 1) clues = without;
  }
  return build(clues);
}

const TRIES = 15;
// Several candidates per date; the hardest wins and, among equals, the one with fewer clues.
export function puzzle(seed) {
  const rnd = rng('tango:' + seed);
  let best = null;
  for (let t = 0; t < TRIES; t++) {
    const p = candidate(rnd);
    const score = level(p) * 100 - p.givens.filter(Boolean).length - p.signs.length;
    if (!best || score > best.score) best = { p, score };
  }
  return best.p;
}

// ------------------------------------------------------------------ checking the player's grid
// Cells breaking a rule right now (to paint them red). A row/column only counts as too full once it is complete.
export function mistakes(g, signs) {
  const bad = new Set();
  for (const line of LINES) {
    for (let k = 0; k + 2 < N; k++) {
      const t = [line[k], line[k + 1], line[k + 2]];
      if (g[t[0]] && g[t[0]] === g[t[1]] && g[t[1]] === g[t[2]]) t.forEach((i) => bad.add(i));
    }
    for (const v of [1, 2]) if (line.filter((i) => g[i] === v).length > HALF) line.forEach((i) => g[i] === v && bad.add(i));
  }
  for (const { a, b, eq } of signs) if (g[a] && g[b] && (g[a] === g[b]) !== eq) { bad.add(a); bad.add(b); }
  return bad;
}
export const solved = (g, signs) => g.every(Boolean) && mistakes(g, signs).size === 0;
