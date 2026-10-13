// The data model: JSON + overlay (create / edit / delete / restore), derived lodging per night, suggestions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserStubs } from './helpers.mjs';

installBrowserStubs();
const store = await import('../js/store.js');
const { loadData, D, I, cols, settings, overriddenBase } = store;
const { suggestions } = await import('../js/suggest.js');
const { tripPhase, localInstant, activityNow, departureTimes, tzAt, dayClockNote } = await import('../js/tripstate.js');
await loadData();

test('loads the trip and the extra places file', () => {
  assert.equal(D.days.length, 24);
  assert.ok(I.place['p-bund'] && I.place['p-e-skytree'], 'places.json + places-extra.json');
  assert.equal(D.days.reduce((n, d) => n + d.activities.length, 0), 128);
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
    assert.equal(u, `${svc.base}/${d.image.name}.png?prompt=${encodeURIComponent(d.image.prompt).replace(/['()!*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())}&ratio=16:9`, 'the prompt is only the scene');
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
  assert.ok(suggestions().some((s) => s.key === 'passport:pehuen'), 'no passport yet → suggestion');
  cols.put('passports', { id: 'pehuen', number: 'AAA123456', expires: '2030-01-01' });
  assert.equal(passportOf('pehuen').number, 'AAA123456');
  assert.ok(!suggestions().some((s) => s.key === 'passport:pehuen'));
  assert.ok(store.cols.list('passports').length === 1 && (await import('../js/sync.js')).SYNCED.includes('passports'), 'passports travel with the group sync');
  cols.del('passports', 'pehuen');
  assert.equal(passportOf('pehuen'), null);
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
  // dates and times are those of wherever the traveler is that day, not of the machine running the tests
  const check = (iso, phase, dayId) => { setSimulatedNow(localInstant(...iso.split('T'))); const st = tripPhase(); assert.equal(st.phase, phase, iso); if (dayId) assert.equal(st.day.id, dayId, iso); };
  check('2026-11-02T09:00', 'pre'); check('2026-11-15T09:00', 'during', 'd04'); check('2026-12-02T20:00', 'during', 'd21'); check('2026-12-08T09:00', 'post');
  const { simLabel } = await import('../js/views/sim.js').catch(() => ({}));
  if (simLabel) { setSimulatedNow(localInstant('2026-11-15', '09:00')); assert.match(simLabel(), /^Día 4 · .* 09:\d\d$/); }
  setSimulatedNow(null);
  assert.ok(Math.abs(now() - Date.now()) < 1000);
});

test('time zones: each day runs on the clock of the place where it happens', () => {
  const { setSimulatedNow } = store;
  const sim = (utc) => setSimulatedNow(new Date(utc));
  // 14/11 10:00 in Buenos Aires is already 21:00 in Shanghai: dinner on the day of arrival (d03), not the flight
  sim('2026-11-14T13:00Z');
  assert.equal(tripPhase().day.id, 'd03');
  assert.match(activityNow(I.day.d03).current.title, /cena/i);
  // Shanghai → Tokyo (d07): the morning is on Chinese time, the evening on Japanese time
  const d07 = I.day.d07;
  const { dep, leave, tz } = departureTimes(d07.cards.find((c) => c.type === 'departure'), d07);
  assert.equal(dep.toISOString(), '2026-11-18T07:00:00.000Z', 'takeoff 15:00 in Shanghai');
  assert.equal(leave.toISOString(), '2026-11-18T04:00:00.000Z', 'leave the hotel 12:00 in Shanghai');
  assert.equal(tz, 'Asia/Shanghai');
  sim('2026-11-18T13:30Z');   // 22:30 in Tokyo
  assert.equal(tzAt(), 'Asia/Tokyo');
  assert.match(activityNow(d07).current.title, /Omoide/);
  assert.match(dayClockNote(d07), /China.*Japón/);
  // the flight home leaves Shanghai at 01:50 on 5/12 and the trip ends in Buenos Aires
  const d01 = I.day.d01;
  assert.equal(departureTimes(d01.cards[0], d01).dep.toISOString(), '2026-11-13T05:00:00.000Z', '02:00 in Buenos Aires');
  sim('2026-12-05T19:00Z');   // 16:00 in Buenos Aires
  assert.equal(tripPhase().day.id, 'd24');
  sim('2026-12-06T04:00Z');   // 01:00 on 6/12 in Buenos Aires
  assert.equal(tripPhase().phase, 'post');
  setSimulatedNow(null);
});

test('calendar export: valid .ics, times in UTC, lines folded', async () => {
  const { buildIcs } = await import('../js/ics.js');
  const ics = buildIcs();
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  const events = ics.split('BEGIN:VEVENT').length - 1;
  assert.ok(events >= D.days.reduce((n, d) => n + d.activities.filter((a) => a.start).length, 0) + D.lodging.length);
  // the Shanghai → Tokyo flight leaves 15:00 in Shanghai (07:00 UTC) and lands 18:40 in Tokyo (09:40 UTC)
  assert.match(ics, /DTSTART:20261118T070000Z\r\nDTEND:20261118T094000Z\r\nSUMMARY:Vuelo/);
  assert.match(ics, /SUMMARY:Salir hacia el aeropuerto/);
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.equal(new Set(ics.match(/^UID:.*$/gm)).size, events, 'unique UIDs');
});

test('shared confirmations: booking code and destination are guessed from the text', async () => {
  const { guessCode, guessTarget } = await import('../js/guess.js');
  assert.equal(guessCode('Tu código de reserva: qx7p2l\nVuelo MU746'), 'QX7P2L');
  assert.equal(guessCode('Booking confirmation 4821937655'), '', 'only digits: not a PNR');
  assert.equal(guessCode('Hola, gracias por tu compra'), '');
  const groups = [['Pasajes', D.transport.map((t) => [`transport:${t.id}`, t.route, `${t.route} ${t.service || ''}`])],
    ['Alojamientos', D.lodging.map((l) => [`lodging:${l.id}`, l.name, `${l.name} ${l.area || ''}`])]];
  const t01 = I.transport.t01;
  assert.equal(guessTarget({ title: 'Your e-ticket', text: `${t01.service} ${t01.route}`, url: '', files: [] }, groups), 'transport:t01');
  assert.equal(guessTarget({ title: 'Reserva confirmada', text: `Gracias por reservar en ${D.lodging[0].name}`, url: '', files: [] }, groups), `lodging:${D.lodging[0].id}`);
  assert.equal(guessTarget({ title: 'Hola', text: 'nada que ver', url: '', files: [] }, groups), '');
});

test('notes: every note has a kind and real days; tips live in notes, not in day cards', async () => {
  const { D, I, cols } = store;
  assert.ok(D.notes.length > 0 && D.notes.every((n) => ['alerta', 'recordatorio', 'tip'].includes(n.kind)));
  assert.ok(D.notes.every((n) => n.days.every((d) => I.day[d])), 'notes point to existing days (no days = a general note)');
  assert.ok(!D.days.some((d) => (d.cards || []).some((c) => c.type === 'info')), 'info cards were moved to notes.json');
  cols.put('notes', { id: 'n-test', kind: 'recordatorio', title: 'Probar', time: '09:30', days: ['d04'] });
  assert.equal(I.note['n-test'].kind, 'recordatorio');
  cols.del('notes', 'n-test');
});
