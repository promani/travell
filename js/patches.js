// Patches (like LinkedIn's): split a 6×6 grid in rectangles ("patches"). Every patch holds exactly one clue; the
// clue tells its number of cells and/or its shape (square, wide, tall). The puzzle of a date is the same on every
// phone (seeded by the date) and has a single solution.
import { rng } from './tango.js';

export const N = 6;
const CELLS = N * N;
const MAX_AREA = 8;
export const shapeOf = ({ w, h }) => (w === h ? 'square' : w > h ? 'wide' : 'tall');
const shuffle = (arr, rnd) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

// A random tiling: always fill the first free cell with a random rectangle that fits (2..MAX_AREA cells).
function tiling(rnd) {
  for (;;) {
    const owner = Array(CELLS).fill(-1), rects = [];
    let ok = true;
    for (let i = 0; i < CELLS && ok; i++) {
      if (owner[i] >= 0) continue;
      const r = Math.floor(i / N), c = i % N, opts = [];
      for (let h = 1; r + h <= N; h++) for (let w = 1; c + w <= N; w++) {
        if (w * h < 2 || w * h > MAX_AREA) continue;
        let free = true;
        for (let y = r; y < r + h && free; y++) for (let x = c; x < c + w; x++) if (owner[y * N + x] >= 0) { free = false; break; }
        if (free) opts.push({ r, c, w, h });
      }
      if (!opts.length) { ok = false; break; }
      const rect = opts[Math.floor(rnd() * opts.length)];
      for (let y = rect.r; y < rect.r + rect.h; y++) for (let x = rect.c; x < rect.c + rect.w; x++) owner[y * N + x] = rects.length;
      rects.push(rect);
    }
    if (ok && rects.length >= 6) return rects;
  }
}

const cellsOf = ({ r, c, w, h }) => { const out = []; for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) out.push(y * N + x); return out; };
const fits = (clue, rect) => (clue.area == null || clue.area === rect.w * rect.h) && (clue.shape == null || clue.shape === shapeOf(rect));

// Every rectangle each clue could be: holds its cell, no other clue, matches what the clue says.
function candidates(clues) {
  const at = new Map(clues.map((k, n) => [k.cell, n]));
  return clues.map((k) => {
    const out = [], kr = Math.floor(k.cell / N), kc = k.cell % N;
    for (let h = 1; h <= N; h++) for (let w = 1; w <= N; w++) {
      if (w * h > MAX_AREA * 2) continue;
      for (let r = Math.max(0, kr - h + 1); r <= kr && r + h <= N; r++) for (let c = Math.max(0, kc - w + 1); c <= kc && c + w <= N; c++) {
        const rect = { r, c, w, h };
        if (!fits(k, rect)) continue;
        if (cellsOf(rect).some((i) => i !== k.cell && at.has(i))) continue;
        out.push(rect);
      }
    }
    return out;
  });
}

/** Number of ways to tile the board for these clues, stopping at cap. */
export function count(clues, cap = 2) {
  const cand = candidates(clues), owner = Array(CELLS).fill(-1);
  const byCell = Array.from({ length: CELLS }, () => []);
  cand.forEach((list, n) => list.forEach((rect) => cellsOf(rect).forEach((i) => byCell[i].push([n, rect]))));
  const used = new Set();
  let found = 0;
  const go = () => {
    const i = owner.indexOf(-1);
    if (i < 0) { found++; return; }
    for (const [n, rect] of byCell[i]) {
      if (used.has(n) || found >= cap) continue;
      const cells = cellsOf(rect);
      if (cells.some((j) => owner[j] >= 0)) continue;
      cells.forEach((j) => { owner[j] = n; }); used.add(n);
      go();
      cells.forEach((j) => { owner[j] = -1; }); used.delete(n);
    }
  };
  go();
  return found;
}

// Start with full clues (size and shape) in a random cell of each patch, then drop sizes and shapes while the
// solution stays unique. Every clue keeps at least one of the two.
export function puzzle(seed) {
  const rnd = rng('patches:' + seed);
  for (;;) {
    const rects = tiling(rnd);
    const clues = rects.map((rect) => { const cells = cellsOf(rect); return { cell: cells[Math.floor(rnd() * cells.length)], area: rect.w * rect.h, shape: shapeOf(rect) }; });
    if (count(clues) !== 1) continue;
    for (const [n, key] of shuffle(clues.flatMap((_, n) => [[n, 'area'], [n, 'shape']]), rnd)) {
      const k = clues[n], other = key === 'area' ? 'shape' : 'area';
      if (k[other] == null) continue;
      const keep = k[key];
      k[key] = null;
      if (count(clues) !== 1) k[key] = keep;
    }
    return { clues, solution: rects };
  }
}

// ------------------------------------------------------------------ checking the player's patches
/** The clue indexes inside a rectangle. */
export const cluesIn = (rect, p) => p.clues.map((k, n) => (cellsOf(rect).includes(k.cell) ? n : -1)).filter((n) => n >= 0);
/** A drawn patch is right when it holds exactly one clue and matches it. */
export const goodPatch = (rect, p) => { const ks = cluesIn(rect, p); return ks.length === 1 && fits(p.clues[ks[0]], rect); };
export const solved = (rects, p) => {
  const cover = new Set(rects.flatMap(cellsOf));
  return cover.size === CELLS && rects.reduce((n, r) => n + r.w * r.h, 0) === CELLS && rects.length === p.clues.length && rects.every((r) => goodPatch(r, p));
};
export { cellsOf };
