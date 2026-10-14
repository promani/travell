// Zip (like LinkedIn's): draw one path through every cell of a 6×6 grid, moving up/down/left/right, starting at 1
// and passing the numbers in order until the last one. Walls can't be crossed. The puzzle of a date is the same on
// every phone (seeded by the date). It is built from a random path, so it always has a solution; any path that
// follows the rules wins.
import { rng } from './tango.js';

export const N = 6;
const CELLS = N * N;
const COUNT = 8;   // numbers on the board, 1..COUNT
const WALLS = 4;

const rc = (i) => [Math.floor(i / N), i % N];
export const adjacent = (a, b) => { const [r1, c1] = rc(a), [r2, c2] = rc(b); return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1; };
const neighbours = (i) => { const [r, c] = rc(i); return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([y, x]) => y >= 0 && y < N && x >= 0 && x < N).map(([y, x]) => y * N + x); };
const edge = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

// A random path through every cell: start with a snake and apply "backbite" moves (join an end to one of its
// neighbours and reverse the loop that forms), which keeps it a full path every step.
function randomPath(rnd) {
  let path = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) path.push(r * N + (r % 2 ? N - 1 - c : c));
  for (let k = 0; k < CELLS * 40; k++) {
    if (rnd() < 0.5) path.reverse();
    const end = path[CELLS - 1];
    const opts = neighbours(end).filter((x) => x !== path[CELLS - 2]);
    const j = path.indexOf(opts[Math.floor(rnd() * opts.length)]);
    path = [...path.slice(0, j + 1), ...path.slice(j + 1).reverse()];
  }
  return path;
}

export function puzzle(seed) {
  const rnd = rng('zip:' + seed);
  const path = randomPath(rnd);
  // numbers: both ends plus random stops spread along the path (never two in a row)
  const stops = new Set([0, CELLS - 1]);
  while (stops.size < COUNT) {
    const k = 1 + Math.floor(rnd() * (CELLS - 2));
    if (!stops.has(k - 1) && !stops.has(k + 1)) stops.add(k);
  }
  const nums = {};
  [...stops].sort((a, b) => a - b).forEach((k, n) => { nums[path[k]] = n + 1; });
  // walls: between neighbours the path never joins
  const used = new Set(path.slice(1).map((x, k) => edge(path[k], x)));
  const free = [];
  for (let i = 0; i < CELLS; i++) for (const j of neighbours(i)) if (i < j && !used.has(edge(i, j))) free.push(edge(i, j));
  const walls = [];
  while (walls.length < WALLS && free.length) walls.push(free.splice(Math.floor(rnd() * free.length), 1)[0]);
  return { nums, count: COUNT, walls, solution: path };
}

export const wallBetween = (p, a, b) => p.walls.includes(edge(a, b));
/** The next number the path has to reach. */
export const nextNumber = (path, p) => path.filter((i) => p.nums[i]).length + 1;
/** Can the path (non-empty) go on to cell i? */
export function canStep(path, i, p) {
  const last = path[path.length - 1];
  if (path.includes(i) || !adjacent(last, i) || wallBetween(p, last, i)) return false;
  if (p.nums[last] === p.count) return false;   // the last number ends the path
  return !p.nums[i] || p.nums[i] === nextNumber(path, p);
}
export const solved = (path, p) => path.length === CELLS && p.nums[path[0]] === 1 && p.nums[path[CELLS - 1]] === p.count
  && path.every((x, k) => k === 0 || (adjacent(path[k - 1], x) && !wallBetween(p, path[k - 1], x)))
  && new Set(path).size === CELLS && path.filter((i) => p.nums[i]).every((i, k) => p.nums[i] === k + 1);
