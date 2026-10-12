import test from 'node:test';
import assert from 'node:assert/strict';
import { owedMap, balances, settlements, converter } from '../js/money.js';

const conv = converter({ USD: 1, CNY: 7.1, JPY: 150 });
const ids = ['yo', 'v2', 'v3'];

test('equal split among everyone by default', () => {
  assert.deepEqual(owedMap({ amount: 90, split: { mode: 'equal', among: [] } }, ids), { yo: 30, v2: 30, v3: 30 });
});

test('exact split is proportional to the shares', () => {
  const m = owedMap({ amount: 100, split: { mode: 'exact', shares: { yo: 30, v2: 70 } } }, ids);
  assert.equal(m.yo, 30); assert.equal(m.v2, 70);
});

test('converter goes through the base currency', () => {
  assert.equal(conv(150, 'JPY', 'USD'), 1);
  assert.ok(Math.abs(conv(7.1, 'CNY', 'JPY') - 150) < 1e-9);
});

test('balances and minimal settlements across currencies', () => {
  const list = [
    { amount: 300, currency: 'CNY', paidBy: 'yo', split: { mode: 'equal', among: ['yo', 'v2'] } },
    { amount: 1500, currency: 'JPY', paidBy: 'v2', split: { mode: 'equal', among: ['yo', 'v2'] } },
  ];
  const net = balances(list, ['yo', 'v2'], 'USD', conv);
  const s = settlements(net);
  assert.equal(s.length, 1);
  assert.equal(s[0].from, 'v2'); assert.equal(s[0].to, 'yo');
  assert.ok(Math.abs(s[0].amt - 16.126) < 0.01);
});

test('everyone even means no transfers', () => {
  const net = balances([{ amount: 10, currency: 'USD', paidBy: 'yo', split: { mode: 'equal', among: ['yo'] } }], ['yo', 'v2'], 'USD', conv);
  assert.deepEqual(settlements(net), []);
});

test('three people: transfers add up to each balance', () => {
  const list = [{ amount: 90, currency: 'USD', paidBy: 'yo', split: { mode: 'equal', among: ids } },
    { amount: 30, currency: 'USD', paidBy: 'v2', split: { mode: 'equal', among: ids } }];
  const net = balances(list, ids, 'USD', conv);
  const s = settlements(net);
  const received = s.filter((x) => x.to === 'yo').reduce((a, x) => a + x.amt, 0);
  assert.ok(Math.abs(received - 50) < 1e-9);
});
