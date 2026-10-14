// The trip code gate: trip.json only carries the code's hash; a wrong code doesn't open the app nor set a sync key.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserStubs } from './helpers.mjs';

installBrowserStubs();
const { loadData, settings, BASE } = await import('../js/store.js');
const { normCode, codeHash, needsCode, enterCode, syncConfigured } = await import('../js/sync.js');
await loadData();

test('the code is normalised to 5 upper-case letters and numbers', () => {
  assert.equal(normCode(' ab-1 2c '), 'AB12C');
  assert.equal(normCode(null), '');
});

test('trip.json has only the hash of the code, and a wrong code keeps the app locked', async () => {
  assert.match(BASE.trip.sync.codeCheck, /^[0-9a-f]{64}$/);
  assert.equal(needsCode(), true);
  assert.equal(await enterCode('XXXXX'), false);
  assert.equal(needsCode(), true);
  assert.equal(syncConfigured(), false);
  assert.equal(await codeHash('abc12'), await codeHash('ABC12'));
});

test('the right code opens the app and becomes the sync key', async () => {
  // simulate the right code without writing it in the repo: point the check at a test code
  const real = BASE.trip.sync.codeCheck;
  BASE.trip.sync.codeCheck = await codeHash('T3ST5');
  try {
    assert.equal(await enterCode('t3st5'), true);
    assert.equal(needsCode(), false);
    assert.equal(settings.get('groupCode'), 'T3ST5');
  } finally { BASE.trip.sync.codeCheck = real; }
  assert.equal(needsCode(), true, 'a new code asks again');
});
