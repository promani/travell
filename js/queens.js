// Queens (like LinkedIn's): an 8×8 grid split in 8 coloured regions. Place one queen per row, column and region;
// two queens never touch, not even diagonally. The puzzle of a date is the same on every phone (seeded by the date),
// has a single solution and is solvable by logic, without guessing.
import { rng } from './tango.js';

export const N = 8;
const CELLS = N * N;
const rc = (i) => [Math.floor(i / N), i % N];
const touching = (a, b) => { const [r1, c1] = rc(a), [r2, c2] = rc(b); return a !== b && Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1; };
const sides = (i) => { const [r, c] = rc(i); return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([y, x]) => y >= 0 && y < N && x >= 0 && x < N).map(([y, x]) => y * N + x); };

// One queen per row, in columns that never repeat nor touch the row above.
function queens(rnd) {
  const cols = [];
  const place = (r) => {
    if (r === N) return true;
    const opts = [...Array(N).keys()].sort(() => rnd() - 0.5);
    for (const c of opts) {
      if (cols.includes(c) || (r && Math.abs(cols[r - 1] - c) <= 1)) continue;
      cols.push(c);
      if (place(r + 1)) return true;
      cols.pop();
    }
    return false;
  };
  place(0);
  return cols.map((c, r) => r * N + c);
}

// Regions grown at random from each queen until they cover the board.
function regions(seeds, rnd) {
  const reg = Array(CELLS).fill(-1);
  seeds.forEach((s, k) => { reg[s] = k; });
  let left = CELLS - seeds.length;
  while (left) {
    const frontier = [];
    for (let i = 0; i < CELLS; i++) if (reg[i] >= 0) for (const j of sides(i)) if (reg[j] < 0) frontier.push([i, j]);
    const [i, j] = frontier[Math.floor(rnd() * frontier.length)];
    reg[j] = reg[i]; left--;
  }
  return reg;
}

// ------------------------------------------------------------------ logic solver
// Candidates per cell; a placed queen clears its row, column, region and neighbours. Deductions:
//  - a row, column or region with a single candidate gets its queen;
//  - a region whose candidates sit in one row (or column) clears the rest of that row (column), and the same the
//    other way round;
//  - a candidate that would leave some row, column or region without candidates is cleared.
// Returns the queens found (cell indexes) or null if it gets stuck or hits a contradiction.
export function deduce(reg) {
  const cand = Array(CELLS).fill(true), queen = [];
  const groups = [];
  for (let r = 0; r < N; r++) groups.push([...Array(N)].map((_, c) => r * N + c));
  for (let c = 0; c < N; c++) groups.push([...Array(N)].map((_, r) => r * N + c));
  for (let k = 0; k < N; k++) groups.push([...Array(CELLS).keys()].filter((i) => reg[i] === k));
  const killList = [...Array(CELLS).keys()].map((q) => [...Array(CELLS).keys()].filter((i) => i !== q && (rc(i)[0] === rc(q)[0] || rc(i)[1] === rc(q)[1] || reg[i] === reg[q] || touching(i, q))));
  const kills = (q) => killList[q];
  const place = (q) => { queen.push(q); cand[q] = false; for (const i of kills(q)) cand[i] = false; };
  const open = (g) => g.filter((i) => cand[i]);
  const solvedGroup = (g) => g.some((i) => queen.includes(i));
  for (let changed = true; changed && queen.length < N;) {
    changed = false;
    for (const g of groups) {
      if (solvedGroup(g)) continue;
      const o = open(g);
      if (!o.length) return null;
      if (o.length === 1) { place(o[0]); changed = true; }
    }
    if (changed) continue;
    // a region inside one row/column (or a row/column inside one region) clears the rest
    for (const g of groups) {
      if (solvedGroup(g)) continue;
      const o = open(g);
      for (const key of [(i) => rc(i)[0], (i) => rc(i)[1], (i) => reg[i]]) {
        const v = key(o[0]);
        if (!o.every((i) => key(i) === v)) continue;
        for (let i = 0; i < CELLS; i++) if (cand[i] && key(i) === v && !g.includes(i)) { cand[i] = false; changed = true; }
      }
    }
    if (changed) continue;
    // a candidate that would empty another group
    for (let q = 0; q < CELLS; q++) {
      if (!cand[q]) continue;
      const gone = new Set([q, ...kills(q)]);
      if (groups.some((g) => !solvedGroup(g) && !g.includes(q) && open(g).every((i) => gone.has(i)))) { cand[q] = false; changed = true; }
    }
  }
  return queen.length === N ? queen.sort((a, b) => a - b) : null;
}

// Number of solutions, stopping at cap.
function count(reg, cap) {
  let n = 0;
  const go = (r, colMask, regMask, prev) => {
    if (r === N) { n++; return; }
    for (let c = 0; c < N && n < cap; c++) {
      const k = 1 << reg[r * N + c];
      if (colMask & (1 << c) || regMask & k || (r && Math.abs(prev - c) <= 1)) continue;
      go(r + 1, colMask | (1 << c), regMask | k, c);
    }
  };
  go(0, 0, 0, 0);
  return n;
}
// Is region k still in one piece without cell i?
function connectedWithout(reg, k, i) {
  const cells = [...Array(CELLS).keys()].filter((j) => reg[j] === k && j !== i);
  if (!cells.length) return false;
  const seen = new Set([cells[0]]), todo = [cells[0]];
  while (todo.length) for (const j of sides(todo.pop())) if (reg[j] === k && j !== i && !seen.has(j)) { seen.add(j); todo.push(j); }
  return seen.size === cells.length;
}

const MIN_REGION = 3;   // a region of one or two cells gives its queen away too easily
const size = (reg, k) => reg.filter((x) => x === k).length;
const smallest = (reg) => Math.min(...[...Array(N).keys()].map((k) => size(reg, k)));

// Random regions around a random queen layout, then moves of border cells to a neighbouring region (keeping every
// region in one piece and the queens where they are) while the count of solutions doesn't grow, until there is one
// and the logic solver finds it.
export function puzzle(seed) {
  const rnd = rng('queens:' + seed);
  for (let attempt = 0; attempt < 50; attempt++) {
    const sol = queens(rnd), reg = regions(sol, rnd), isQueen = new Set(sol);
    let score = count(reg, 200), checked = false;
    for (let step = 0; step < 4000; step++) {
      if (score === 1 && !checked) {   // the logic solver is the slow part: run it once per new layout
        if (smallest(reg) >= MIN_REGION && deduce(reg)) return { regions: reg, solution: sol };
        checked = true;
      }
      const i = Math.floor(rnd() * CELLS);
      if (isQueen.has(i)) continue;
      const to = sides(i).map((j) => reg[j]).filter((k) => k !== reg[i]);
      if (!to.length) continue;
      const from = reg[i], k = to[Math.floor(rnd() * to.length)];
      if (size(reg, from) <= MIN_REGION || !connectedWithout(reg, from, i)) continue;
      reg[i] = k;
      const n = count(reg, 200);
      if (n >= 1 && (n < score || (n === score && (n > 1 || rnd() < 0.5)))) { score = n; checked = false; } else reg[i] = from;
    }
  }
  throw new Error('queens: no puzzle for ' + seed);
}

// ------------------------------------------------------------------ checking the player's board
// marks: 0 empty, 1 crossed out, 2 queen. Returns the queens that clash with another one.
export function clashes(marks, reg) {
  const q = marks.map((v, i) => (v === 2 ? i : -1)).filter((i) => i >= 0), bad = new Set();
  for (const a of q) for (const b of q) {
    if (a >= b) continue;
    if (rc(a)[0] === rc(b)[0] || rc(a)[1] === rc(b)[1] || reg[a] === reg[b] || touching(a, b)) { bad.add(a); bad.add(b); }
  }
  return bad;
}
export const solved = (marks, reg) => marks.filter((v) => v === 2).length === N && clashes(marks, reg).size === 0;
