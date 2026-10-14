// Juego del día: the Tango generator (same puzzle per date, single solution, solvable by logic) and the records.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserStubs } from './helpers.mjs';
import * as tango from '../js/tango.js';

test('the puzzle of a date is the same every time and differs between dates', () => {
  assert.deepEqual(tango.puzzle('2026-11-18'), tango.puzzle('2026-11-18'));
  assert.notDeepEqual(tango.puzzle('2026-11-18').givens, tango.puzzle('2026-11-19').givens);
});

test('every puzzle is solvable by logic alone and matches its solution', () => {
  for (let d = 1; d <= 60; d++) {
    const p = tango.puzzle(`2026-12-${d}`);
    assert.ok(tango.solved(p.solution, p.signs));
    assert.ok(p.signs.length >= 3);
    assert.deepEqual(tango.deduce(p.givens, p.signs), p.solution, `day ${d}`);
    p.givens.forEach((v, i) => v && assert.equal(v, p.solution[i]));
  }
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
