import test from 'node:test';
import assert from 'node:assert/strict';
import { wgs2gcj, gcj2wgs } from '../js/geo.js';
import { haversine } from '../js/util.js';

test('GCJ-02 offset in Shanghai is a few hundred meters', () => {
  const p = [31.2400, 121.4900];
  const d = haversine(p, wgs2gcj(...p));
  assert.ok(d > 200 && d < 800, `offset ${d} m`);
});

test('GCJ-02 round trip is sub-meter', () => {
  for (const p of [[31.2400, 121.4900], [39.9163, 116.3972], [31.3238, 120.6306]]) {
    const back = gcj2wgs(...wgs2gcj(...p));
    assert.ok(haversine(p, back) < 1, `round trip error at ${p}`);
  }
});

test('outside China there is no offset', () => {
  assert.deepEqual(wgs2gcj(-34.6, -58.38), [-34.6, -58.38]);
});
