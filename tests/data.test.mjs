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

test('passports: validity against the end of the trip and the "missing passport" suggestion', async () => {
  const { passportStatus, passportOf } = await import('../js/passport.js');
  const end = D.days[D.days.length - 1].date;                       // 2026-12-05
  assert.equal(passportStatus(null, end).level, 'missing');
  assert.equal(passportStatus({ number: 'AAA1' }, end).level, 'missing');
  assert.equal(passportStatus({ number: 'AAA1', expires: '2026-12-01' }, end).level, 'expired');
  assert.equal(passportStatus({ number: 'AAA1', expires: '2027-03-01' }, end).level, 'short');
  assert.equal(passportStatus({ number: 'AAA1', expires: '2027-06-05' }, end).level, 'ok');
  assert.ok(suggestions().some((s) => s.key === 'passport:yo'), 'no passport yet → suggestion');
  cols.put('passports', { id: 'yo', number: 'AAA123456', expires: '2030-01-01' });
  assert.equal(passportOf('yo').number, 'AAA123456');
  assert.ok(!suggestions().some((s) => s.key === 'passport:yo'));
  assert.ok(store.cols.list('passports').length === 1 && (await import('../js/sync.js')).SYNCED.includes('passports'), 'passports travel with the group sync');
  cols.del('passports', 'yo');
  assert.equal(passportOf('yo'), null);
});

test('resources: seeded metro maps point to real cities, can be added, edited and deleted', () => {
  assert.ok(D.resources.length >= 3);
  for (const r of D.resources) assert.ok(!r.cityId || I.city[r.cityId], `${r.id} has an unknown city`);
  assert.ok(D.resources.some((r) => r.cityId === 'shanghai' && /metro/i.test(r.title)));
  cols.put('resources', { id: 'rx', title: 'Frases útiles', kind: 'guia', cityId: 'tokyo' });
  assert.equal(I.resource.rx.title, 'Frases útiles');
  cols.put('resources', { id: 'r01', title: 'Metro SH (editado)', kind: 'mapa', cityId: 'shanghai' });
  assert.equal(I.resource.r01.title, 'Metro SH (editado)');
  cols.del('resources', 'rx'); cols.reset('resources', 'r01');
  assert.ok(!I.resource.rx && /Mapa del metro de Shanghai/.test(I.resource.r01.title));
});

test('resources replace the old links: no duplicated URLs, known kinds, sources kept apart', () => {
  // same rules as js/views/resources.js (importing the view would pull Leaflet in)
  const KINDS = Object.fromEntries(['mapa', 'guia', 'app', 'traduccion', 'tramite', 'enlace', 'fuente', 'otro'].map((k) => [k, 1]));
  const resourcesForDay = (day) => D.resources.filter((r) => r.kind !== 'fuente' && ((r.dayId && r.dayId === day.id) || (day.cityId && r.cityId === day.cityId)));
  assert.equal(D.links, undefined, 'links.json is gone');
  const urls = D.resources.filter((r) => r.url).map((r) => r.url.replace(/\/$/, ''));
  assert.equal(new Set(urls).size, urls.length, 'every URL appears once');
  for (const r of D.resources) {
    assert.ok(KINDS[r.kind], `${r.id} has an unknown kind ${r.kind}`);
    if (r.dayId) assert.ok(I.day[r.dayId], `${r.id} points to an unknown day`);
  }
  assert.ok(D.resources.some((r) => r.kind === 'fuente'), 'sources moved over');
  assert.ok(!resourcesForDay(I.day.d07).some((r) => r.kind === 'fuente'), 'the day screen does not list sources');
  assert.ok(resourcesForDay(I.day.d07).some((r) => /Visit Japan Web/.test(r.title)));
});

test('phrases: every phrase has Spanish plus script and romanization in a known language', () => {
  const langs = D.phrases.languages.map((l) => l.id);
  assert.deepEqual(langs, ['zh', 'ja']);
  for (const l of D.phrases.languages) assert.ok(D.trip.cities.some((c) => l.countries.includes(c.country)), `${l.id} matches a trip country`);
  let n = 0;
  for (const g of D.phrases.groups) for (const p of g.phrases) {
    assert.ok(p.es, `${g.id}: phrase without Spanish`);
    const present = langs.filter((id) => p[id]);
    assert.ok(present.length, `${p.es}: no language`);
    for (const id of present) assert.ok(p[id][0] && p[id][1], `${p.es} (${id}) needs script and romanization`);
    n++;
  }
  assert.ok(n >= 40);
  const bill = D.phrases.groups.flatMap((g) => g.phrases).find((p) => /cuenta/.test(p.es));
  assert.ok(bill.zh && bill.ja, 'the bill, in both languages');
});

test('simulating a day moves the whole app to that day (and back)', async () => {
  const { setSimulatedNow, now } = store;
  const check = (iso, phase, dayId) => { setSimulatedNow(iso); const st = tripPhase(); assert.equal(st.phase, phase, iso); if (dayId) assert.equal(st.day.id, dayId, iso); };
  check('2026-11-02T09:00', 'pre'); check('2026-11-15T09:00', 'during', 'd04'); check('2026-12-02T20:00', 'during', 'd21'); check('2026-12-08T09:00', 'post');
  const { simLabel } = await import('../js/views/sim.js').catch(() => ({}));
  if (simLabel) { setSimulatedNow('2026-11-15T09:00'); assert.match(simLabel(), /^Día 4 · .* 09:\d\d$/); }
  setSimulatedNow(null);
  assert.ok(Math.abs(now() - Date.now()) < 1000);
});
