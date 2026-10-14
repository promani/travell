// Entrenar: the exercises' generators (Camino, Clasificar, Eco).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as camino from '../js/camino.js';
import * as clasificar from '../js/clasificar.js';
import * as eco from '../js/eco.js';
import { rng } from '../js/tango.js';

// breadth-first search over safe cells, up/down/left/right
function crossable({ n, start, goal, holes }) {
  const seen = new Set([start]), queue = [start];
  while (queue.length) {
    const i = queue.shift();
    if (i === goal) return true;
    for (const j of [i - n, i + n, i - 1, i + 1]) if (j >= 0 && j < n * n && camino.adjacent(i, j, n) && !holes.has(j) && !seen.has(j)) { seen.add(j); queue.push(j); }
  }
  return false;
}

test('Camino: every board can be crossed, starts at the bottom, ends at the top and grows with the level', () => {
  const rnd = rng('camino');
  for (let level = 0; level < 15; level++) for (let k = 0; k < 40; k++) {
    const b = camino.board(level, rnd);
    assert.equal(b.n, camino.size(level));
    assert.equal(Math.floor(b.start / b.n), b.n - 1);
    assert.ok(b.goal < b.n);
    assert.ok(!b.holes.has(b.start) && !b.holes.has(b.goal));
    assert.ok(b.holes.size >= b.n, `level ${level}: too few holes`);
    assert.ok(crossable(b), `level ${level}`);
  }
  assert.equal(camino.size(0), 4);
  assert.equal(camino.size(30), 7);
});

test('Clasificar: every card goes to exactly one side under every rule in play', () => {
  const rnd = rng('clasificar');
  for (const level of [0, 5]) {
    const dk = clasificar.deck(level, rnd);
    assert.equal(dk.rules.includes('count'), level >= 5);
    for (let k = 0; k < 200; k++) {
      const card = clasificar.dealCard(dk, rnd);
      for (const rule of dk.rules) {
        const bins = rule === 'color' ? dk.colors : rule === 'shape' ? dk.shapes : [[1, 'Uno solo'], [2, 'De a dos']];
        const flipped = [bins[1], bins[0]];
        assert.notEqual(clasificar.sideOf(card, bins, rule), clasificar.sideOf(card, flipped, rule));
      }
    }
  }
});

test('Eco: about 40% of the symbols repeat the one n steps back, and n follows the level', () => {
  const rnd = rng('eco'), pool = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  for (const n of [1, 2, 3]) {
    const seq = [];
    for (let k = 0; k < 2000; k++) seq.push(eco.nextSymbol(seq, n, pool, rnd));
    const same = seq.slice(n).filter((s, i) => s === seq[i]).length / (seq.length - n);
    assert.ok(same > 0.35 && same < 0.45, `n=${n}: ${same}`);
  }
  assert.deepEqual([0, 2, 3, 5, 6, 20].map(eco.back), [1, 1, 2, 2, 3, 3]);
  assert.equal(eco.nextLevel(2, 19, 20), 3);
  assert.equal(eco.nextLevel(2, 10, 20), 1);
  assert.equal(eco.nextLevel(0, 1, 20), 0);
  assert.equal(eco.nextLevel(2, 3, 4), 2);   // too short to say
});
