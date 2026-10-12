// The data model: JSON + overlay (create / edit / delete / restore), derived lodging per night, suggestions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserStubs } from './helpers.mjs';

installBrowserStubs();
const store = await import('../js/store.js');
const { loadData, D, I, cols, settings, overriddenBase } = store;
const { suggestions } = await import('../js/suggest.js');
const { tripPhase } = await import('../js/tripstate.js');
await loadData();

test('loads the trip and the extra places file', () => {
  assert.equal(D.days.length, 24);
  assert.ok(I.place['p-bund'] && I.place['p-e-skytree'], 'places.json + places-extra.json');
  assert.equal(D.days.reduce((n, d) => n + d.activities.length, 0), 115);
});

test('every night that is not on a plane has a lodging', () => {
  for (const [i, d] of D.days.entries()) {
    if (i === D.days.length - 1 || /avi[oó]n/i.test(d.sleepsAt || '')) continue;
    assert.ok(d.lodgingId, `${d.id} ${d.date} without lodging`);
  }
});

test('deleting a lodging creates a "missing lodging" suggestion, restoring removes it', () => {
  assert.equal(I.day.d14.lodgingId, 'l04');
  cols.del('lodging', 'l04');
  assert.equal(I.day.d14.lodgingId, null);
  assert.ok(suggestions().some((s) => s.key === 'gap:2026-11-25'));
  assert.ok(overriddenBase().some((o) => o.col === 'lodging' && o.id === 'l04' && o.deleted));
  cols.reset('lodging', 'l04');
  assert.equal(I.day.d14.lodgingId, 'l04');
  assert.ok(!suggestions().some((s) => s.key === 'gap:2026-11-25'));
});

test('a new activity is placed by start time and links its place', () => {
  cols.put('places', { id: 'p-t', name: 'Test', category: 'gastronomia', cityId: 'shanghai', lat: 31.23, lon: 121.47 });
  cols.put('activities', { id: 'a-t', dayId: 'd04', title: 'Mediodía', start: '12:30', category: 'gastronomia', placeId: 'p-t' });
  const titles = I.day.d04.activities.map((a) => a.id);
  assert.ok(titles.indexOf('a-t') > titles.indexOf('A008') - 1 && titles.indexOf('a-t') < titles.indexOf('A009'));
  assert.deepEqual(I.place['p-t'].days, ['d04']);
});

test('editing a JSON task keeps it in place and marks it edited', () => {
  cols.put('tasks', { ...I.task.k06, status: 'hecho', assignee: 'v2' });
  assert.equal(I.task.k06.status, 'hecho');
  assert.equal(I.task.k06.edited, true);
  // the task covered lodging l04 (still "pendiente") -> suggestion to complete the lodging data
  assert.ok(suggestions().some((s) => s.key === 'fix:lodging:l04'));
});

test('requirements are filtered by the countries of the trip and can be dismissed', () => {
  const key = 'req:fiebre-amarilla';
  assert.ok(suggestions().some((s) => s.key === key));
  cols.put('suggestions', { id: key, state: 'hecho' });
  assert.ok(!suggestions().some((s) => s.key === key));
});

test('remote merge: last write wins', () => {
  const now = Date.now();
  cols.merge('tasks', [{ id: 'k-x', title: 'old', updatedAt: now - 1000 }]);
  cols.merge('tasks', [{ id: 'k-x', title: 'new', updatedAt: now }]);
  cols.merge('tasks', [{ id: 'k-x', title: 'stale', updatedAt: now - 5000 }]);
  store.rebuild();
  assert.equal(I.task['k-x'].title, 'new');
});

test('trip phase follows the (simulated) clock', () => {
  const at = (iso) => settings.set('simOffset', new Date(iso).getTime() - Date.now());
  at('2026-10-12T10:00'); assert.equal(tripPhase().phase, 'pre'); assert.equal(tripPhase().daysToGo, 31);
  at('2026-11-14T10:00'); assert.equal(tripPhase().day.id, 'd03');
  at('2026-12-06T10:00'); assert.equal(tripPhase().phase, 'post');
  settings.set('simOffset', 0);
});

test('every day has its own picture and the URL follows the image service format', async () => {
  const { imgUrl } = await import('../js/util.js');
  const svc = D.trip.imageService;
  const names = new Set();
  for (const d of D.days) {
    assert.ok(d.image?.name && d.image?.prompt, `${d.id} without image`);
    assert.ok(!names.has(d.image.name), `${d.id} repeats image name ${d.image.name}`);
    names.add(d.image.name);
    const u = imgUrl(d.image, svc);
    assert.ok(u.startsWith(`${svc.base}/${d.image.name}.png?prompt=`) && u.endsWith('&ratio=16:9'), u);
    assert.ok(!/[ '()]/.test(u), `unsafe chars in ${u}`);
  }
  assert.ok(D.trip.images.pre && D.trip.images.post);
  assert.equal(imgUrl({ name: 'a', prompt: "dos (2) viajeros d'Arc" }, { base: 'https://x/y', ratio: '1:1' }),
    'https://x/y/a.png?prompt=dos%20%282%29%20viajeros%20d%27Arc&ratio=1:1');
  assert.equal(imgUrl(undefined, svc), '');
});
