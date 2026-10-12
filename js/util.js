// Small helpers shared by every module: escaping, dates, DOM, toasts, modals.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const uid = (p = 'x') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// URL of an AI-generated picture: {name, prompt} + trip.imageService {base, ratio, style}.
export function imgUrl(img, svc) {
  if (!img?.name || !img.prompt || !svc?.base) return '';
  const enc = (s) => encodeURIComponent(s).replace(/['()!*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  const prompt = [img.prompt, svc.style].filter(Boolean).join(', ');
  return `${svc.base}/${enc(img.name)}.png?prompt=${enc(prompt)}&ratio=${img.ratio || svc.ratio || '16:9'}`;
}

const pad = (n) => String(n).padStart(2, '0');

/** Local YYYY-MM-DD of a Date. */
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Local-midnight Date of a YYYY-MM-DD string. */
export const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
/** Whole days from a to b (YYYY-MM-DD strings). */
export const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
/** Date for a YYYY-MM-DD plus an "HH:MM" string (local). */
export function at(dateISO, hhmm) {
  const d = parseDate(dateISO);
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || '');
  if (m) d.setHours(+m[1], +m[2], 0, 0);
  return d;
}
export const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

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
