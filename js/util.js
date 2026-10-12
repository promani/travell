// Small helpers shared by every module: escaping, dates, DOM, toasts, modals.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Font Awesome icon (solid set, vendored in vendor/fontawesome). */
export const ic = (name, cls = '') => `<i class="fa-solid fa-${name}${cls ? ' ' + cls : ''}" aria-hidden="true"></i>`;

/** Link that opens outside the app (needs internet). */
export const extLink = (url, text) => `<a href="${esc(url)}" target="_blank" rel="noopener" class="ext">${esc(text)} ${ic('arrow-up-right-from-square')}<span class="net" title="Requiere internet">${ic('globe')}</span></a>`;

// Emojis that older data (JSON files, edits saved on the device, synced records) may still carry.
const EMOJI_ICON = {
  '📍': 'location-dot', '🏨': 'hotel', '🛏': 'bed', '🚆': 'train', '🚄': 'train', '🚈': 'train-tram', '🚇': 'train-subway',
  '🚉': 'train', '🚌': 'bus', '🚗': 'car', '🚕': 'taxi', '✈': 'plane', '🛫': 'plane-departure', '🛬': 'plane-arrival',
  '⛴': 'ferry', '➡': 'arrow-right', '🍜': 'bowl-food', '🏯': 'torii-gate', '🌿': 'leaf', '🛍': 'bag-shopping', '🌙': 'moon',
  '♨': 'hot-tub-person', 'ℹ': 'circle-info', '⚠': 'triangle-exclamation', '🎫': 'ticket', '🎟': 'ticket', '📄': 'file-lines',
  '🛂': 'passport', '✅': 'square-check', '✔': 'check', '🧳': 'suitcase-rolling', '💳': 'credit-card', '🔑': 'key',
};
/** Renders an icon value from data: a Font Awesome name ("train"), a legacy emoji, or any other text as-is. */
export function icon(v, cls = '') {
  if (!v) return '';
  if (/^[a-z0-9-]+$/.test(v)) return ic(v, cls);
  const name = EMOJI_ICON[String(v).replace(/\uFE0F/g, '')];
  return name ? ic(name, cls) : esc(v);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const uid = (p = 'x') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// URL of an AI-generated picture: {name, prompt} + trip.imageService {base, ratio}. The prompt only describes the
// scene: the look of the pictures is up to the image service, never set here.
export function imgUrl(img, svc) {
  if (!img?.name || !img.prompt || !svc?.base) return '';
  const enc = (s) => encodeURIComponent(s).replace(/['()!*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return `${svc.base}/${enc(img.name)}.png?prompt=${enc(img.prompt)}&ratio=${img.ratio || svc.ratio || '16:9'}`;
}

const pad = (n) => String(n).padStart(2, '0');

// ------------------------------------------------------------------ time zones
// Every helper below takes an optional IANA zone ("Asia/Tokyo"). Without one it uses the device's zone, as before.
const tzFmt = {};
/** Wall-clock parts of a Date in a zone: { y, mo, d, h, mi }. */
function wall(date, tz) {
  if (!tz) return { y: date.getFullYear(), mo: date.getMonth() + 1, d: date.getDate(), h: date.getHours(), mi: date.getMinutes() };
  tzFmt[tz] ||= new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
  const p = Object.fromEntries(tzFmt[tz].formatToParts(date).map((x) => [x.type, +x.value]));
  return { y: p.year, mo: p.month, d: p.day, h: p.hour, mi: p.minute };
}
/** Minutes a zone is ahead of UTC at a given instant (Tokyo: 540, Buenos Aires: -180). */
export function tzOffset(tz, date = new Date()) {
  const w = wall(date, tz);
  return Math.round((Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi) - Math.floor(date.getTime() / 60000) * 60000) / 60000);
}
/** "UTC+9", "UTC−3", "UTC+5:30". */
export function fmtOffset(min) {
  const a = Math.abs(min);
  return `UTC${min < 0 ? '−' : '+'}${Math.floor(a / 60)}${a % 60 ? ':' + pad(a % 60) : ''}`;
}
export const deviceTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** YYYY-MM-DD of a Date, on the wall clock of `tz` (device zone by default). */
export const isoDate = (d, tz) => { const w = wall(d, tz); return `${w.y}-${pad(w.mo)}-${pad(w.d)}`; };
/** Local-midnight Date of a YYYY-MM-DD string (for calendar math: weekdays, adding days). */
export const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
/** Whole days from a to b (YYYY-MM-DD strings). */
export const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
/** The instant when the wall clock of `tz` shows that date and "HH:MM" (device zone by default). */
export function at(dateISO, hhmm, tz) {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || '');
  const [h, mi] = m ? [+m[1], +m[2]] : [0, 0];
  if (!tz) { const d = parseDate(dateISO); d.setHours(h, mi, 0, 0); return d; }
  const [y, mo, d] = dateISO.split('-').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let t = guess - tzOffset(tz, new Date(guess)) * 60000;
  t = guess - tzOffset(tz, new Date(t)) * 60000;          // second pass: right across a DST change
  return new Date(t);
}
/** "2026-11-18T15:00" (wall clock of `tz`) or "2026-11-18T15:00+08:00" / "…Z" (explicit, `tz` ignored) → Date. */
export function parseAt(s, tz) {
  if (!s) return null;
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(s)) return new Date(s);
  const [date, time = '00:00'] = s.split('T');
  return at(date, time, tz);
}
/** "HH:MM" of a Date on the wall clock of `tz` (device zone by default). */
export const hhmm = (d, tz) => { const w = wall(d, tz); return `${pad(w.h)}:${pad(w.mi)}`; };

let LOCALE = 'es-AR';
export const setLocale = (l) => { LOCALE = l || LOCALE; };
export const fmtDate = (iso, opts = { weekday: 'long', day: 'numeric', month: 'long' }) =>
  new Intl.DateTimeFormat(LOCALE, opts).format(parseDate(iso));
export const fmtShort = (iso) => fmtDate(iso, { day: 'numeric', month: 'short' });
export const fmtWeekdayShort = (iso) => fmtDate(iso, { weekday: 'short' }).replace('.', '');
export const cap = (s) => s ? s[0].toUpperCase() + s.slice(1) : s;
export const fmtMoney = (n, cur) => {
  try { return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: cur, maximumFractionDigits: cur === 'JPY' || cur === 'ARS' ? 0 : 2 }).format(n); }
  catch { return `${n.toFixed(2)} ${cur}`; }
};
/** "3 h 12 min" / "45 min" / "2 d 4 h" from milliseconds. */
export function fmtDuration(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = m % 60;
  if (d) return `${d} d ${h} h`;
  if (h) return `${h} h ${mi} min`;
  return `${mi} min`;
}

export function haversine(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
export const fmtDist = (m) => m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toLocaleString(LOCALE, { maximumFractionDigits: m < 10000 ? 1 : 0 })} km`;

// ------------------------------------------------------------------ toasts / modals
export function toast(msg, ms = 2600) {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

export function openModal(html, { cls = '', onClose } = {}) {
  const dlg = document.createElement('dialog');
  dlg.className = 'modal ' + cls;
  dlg.innerHTML = `<div class="modal-body">${html}</div>`;
  document.body.appendChild(dlg);
  dlg.addEventListener('close', () => { onClose?.(); dlg.remove(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.showModal();
  return dlg;
}
export const closeModal = (el) => el.closest('dialog')?.close();

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copiado'); }
  catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
    ta.select(); try { document.execCommand('copy'); toast('Copiado'); } catch { toast('No se pudo copiar'); }
    ta.remove();
  }
}

export function download(filename, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
