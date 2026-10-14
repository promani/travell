// Juego del día: the Tango generator (same puzzle per date, single solution, solvable by logic) and the records.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserStubs } from './helpers.mjs';
import * as tango from '../js/tango.js';
import * as zip from '../js/zip.js';
import * as queens from '../js/queens.js';
import * as patches from '../js/patches.js';

test('the puzzle of a date is the same every time and differs between dates', () => {
  assert.deepEqual(tango.puzzle('2026-11-18'), tango.puzzle('2026-11-18'));
  assert.notDeepEqual(tango.puzzle('2026-11-18').givens, tango.puzzle('2026-11-19').givens);
});

test('every puzzle has a single solution, its own, and almost none is an easy one', () => {
  let easy = 0;
  for (let d = 1; d <= 60; d++) {
    const p = tango.puzzle(`2026-12-${d}`);
    assert.ok(tango.solved(p.solution, p.signs));
    assert.ok(p.signs.length >= 3);
    assert.equal(tango.count(p.givens, p.signs, 3), 1, `day ${d}`);
    const found = tango.deduceAhead(p.givens, p.signs);   // as far as logic gets, it agrees with the solution
    found.forEach((v, i) => v && assert.equal(v, p.solution[i], `day ${d} cell ${i}`));
    if (tango.level(p) === 0) easy++;
    p.givens.forEach((v, i) => v && assert.equal(v, p.solution[i]));
  }
  assert.ok(easy <= 3, `${easy} easy ones out of 60`);
});

test('mistakes: three in a row, a full line with 4 of a kind and a broken sign', () => {
  const g = Array(36).fill(0);
  g[0] = g[1] = g[2] = 1;
  assert.deepEqual([...tango.mistakes(g, [])].sort(), [0, 1, 2]);
  const h = Array(36).fill(0); h[0] = 1; h[1] = 2;
  assert.deepEqual([...tango.mistakes(h, [{ a: 0, b: 1, eq: true }])].sort(), [0, 1]);
  assert.equal(tango.solved(h, []), false);
});

test('standings: wins, streaks and best times', async () => {
  installBrowserStubs();
  globalThis.window = globalThis; globalThis.L = {};
  const { loadData, D } = await import('../js/store.js');
  await loadData();
  const { standings } = await import('../js/views/games.js');
  const [a, b] = D.travelers.map((t) => t.id);
  const r = (date, traveler, ms) => ({ game: 'tango', date, traveler, ms });
  const s = standings([r('2026-11-16', a, 90000), r('2026-11-17', a, 60000), r('2026-11-17', b, 50000), r('2026-11-18', b, 70000)], '2026-11-18');
  const A = s.find((x) => x.id === a), B = s.find((x) => x.id === b);
  assert.deepEqual([A.played, A.wins, A.best, A.streak], [2, 0, 60000, 2]);   // today is still open: the streak runs to yesterday
  assert.deepEqual([B.played, B.wins, B.best, B.streak], [2, 1, 50000, 2]);
});

test('a missed day breaks the streak', async () => {
  const { D } = await import('../js/store.js');
  const { standings } = await import('../js/views/games.js');
  const a = D.travelers[0].id;
  const s = standings([{ game: 'tango', date: '2026-11-15', traveler: a, ms: 1 }, { game: 'tango', date: '2026-11-16', traveler: a, ms: 1 }], '2026-11-18');
  assert.equal(s.find((x) => x.id === a).streak, 0);
});

test('zip: same puzzle per date, its path solves it step by step, and the rules hold', () => {
  assert.deepEqual(zip.puzzle('2026-11-18'), zip.puzzle('2026-11-18'));
  for (let d = 1; d <= 60; d++) {
    const p = zip.puzzle(`2026-12-${d}`);
    assert.equal(new Set(p.solution).size, 36);
    assert.equal(Object.keys(p.nums).length, p.count);
    assert.ok(zip.solved(p.solution, p), `day ${d}`);
    const path = [p.solution[0]];
    for (const x of p.solution.slice(1)) { assert.ok(zip.canStep(path, x, p)); path.push(x); }
  }
  const p = zip.puzzle('2026-11-18');
  const start = p.solution[0], three = Object.keys(p.nums).find((i) => p.nums[i] === 3);
  assert.equal(zip.solved([...p.solution].reverse(), p), false);              // has to start at 1
  assert.equal(zip.canStep([start], start, p), false);                          // never twice the same cell
  if (zip.adjacent(start, +three)) assert.equal(zip.canStep([start], +three, p), false);   // numbers in order
});

test('queens: same puzzle per date, 8 connected regions of 3+ cells, a single solution, almost never an easy one', () => {
  let easy = 0;
  assert.deepEqual(queens.puzzle('2026-11-18'), queens.puzzle('2026-11-18'));
  const N = queens.N;
  for (let d = 1; d <= 30; d++) {
    const p = queens.puzzle(`2026-12-${d}`), reg = p.regions;
    for (let k = 0; k < N; k++) {
      const cells = reg.map((x, i) => (x === k ? i : -1)).filter((i) => i >= 0);
      assert.ok(cells.length >= 3, `day ${d} region ${k} too small`);
      const seen = new Set([cells[0]]), todo = [cells[0]];
      while (todo.length) { const i = todo.pop(); for (const j of [i - N, i + N, i % N ? i - 1 : -1, i % N < N - 1 ? i + 1 : -1]) if (j >= 0 && j < N * N && reg[j] === k && !seen.has(j)) { seen.add(j); todo.push(j); } }
      assert.equal(seen.size, cells.length, `day ${d} region ${k} split`);
    }
    assert.equal(queens.count(reg, 3), 1, `day ${d}`);
    const found = queens.deduce(reg);   // when logic alone gets there, it gets to the solution
    if (found) assert.deepEqual(found, p.solution);
    if (queens.level(reg) === 0) easy++;
    const marks = Array(N * N).fill(0); p.solution.forEach((i) => { marks[i] = 2; });
    assert.ok(queens.solved(marks, reg));
  }
  assert.ok(easy <= 2, `${easy} easy ones out of 30`);
  const p = queens.puzzle('2026-11-18'), marks = Array(N * N).fill(0);
  marks[0] = 2; marks[N + 1] = 2;                                                   // touching diagonally
  assert.deepEqual([...queens.clashes(marks, p.regions)].sort((a, b) => a - b), [0, N + 1]);
});

test('patches: same puzzle per date, a single solution that tiles the board, rarely an easy one, every clue says something', () => {
  assert.deepEqual(patches.puzzle('2026-11-18'), patches.puzzle('2026-11-18'));
  let easy = 0;
  for (let d = 1; d <= 60; d++) {
    const p = patches.puzzle(`2026-12-${d}`);
    assert.equal(patches.count(p.clues, 3), 1, `day ${d}`);
    const found = patches.deduce(p.clues);   // when logic alone gets there, it gets to the solution
    if (found) assert.deepEqual(found, p.solution, `day ${d}`);
    if (patches.level(p.clues) === 0) easy++;
    assert.ok(patches.solved(p.solution, p));
    assert.ok(p.clues.every((k) => k.area != null || k.shape != null));
  }
  assert.ok(easy <= 3, `${easy} easy ones out of 60`);
  const p = patches.puzzle('2026-11-18');
  assert.equal(patches.solved(p.solution.slice(1), p), false);                                   // a hole
  const big = { r: 0, c: 0, w: 6, h: 6 };
  assert.equal(patches.goodPatch(big, p), false);                                                // many clues
});
