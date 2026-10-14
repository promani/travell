// Reels: Instagram or TikTok links saved as resources (kind 'reel'). They arrive from the phone's share button
// (manifest share_target → index.html?text=…&url=…) or pasted by hand, land without a day, and here each one gets its
// day. Tapping one opens it in Instagram or TikTok; nothing more.
import { D, I, cols, me } from '../store.js';
import { esc, ic, uid, toast, extLink } from '../util.js';
import { register } from '../ui.js';

const PLATFORMS = [[/(^|\.)instagram\.com$/, 'Instagram'], [/(^|\.)tiktok\.com$/, 'TikTok']];
export const isReel = (r) => r.kind === 'reel';
export const platformOf = (url) => { try { const h = new URL(url).hostname; return PLATFORMS.find(([re]) => re.test(h))?.[1] || null; } catch { return null; } };

/** The first Instagram or TikTok link in a shared text, without tracking parameters (?igsh=…, ?_t=…). */
export function reelUrl(text) {
  for (const raw of String(text || '').match(/https?:\/\/[^\s"'<>]+/g) || []) {
    if (!platformOf(raw)) continue;
    const u = new URL(raw); u.search = ''; u.hash = '';
    return u.toString();
  }
  return null;
}

const reels = () => D.resources.filter(isReel);
export const unassigned = () => reels().filter((r) => !r.dayId || !I.day[r.dayId]);

/** Saves a reel from a shared or pasted text. Returns false when there was no link to keep. */
function addReel(text, title = '') {
  const url = reelUrl(text);
  if (!url) { toast('Eso no es un link de Instagram ni de TikTok'); return false; }
  if (reels().some((r) => r.url === url)) { toast('Ese reel ya estaba guardado'); return true; }
  // the text that came with the link, if any, makes a better title than the platform's name
  const said = [title, String(text).replace(/https?:\/\/\S+/g, '')].map((s) => s.replace(/\s+/g, ' ').trim()).find((s) => s && s.length <= 120);
  cols.put('resources', { id: uid('rl'), title: said || `Reel de ${platformOf(url)}`, kind: 'reel', cityId: null, dayId: null, url, notes: null, addedBy: me() });
  toast('Reel guardado: elegí el día');
  return true;
}

/** Called on boot: a reel shared from Instagram/TikTok opens the app with ?text=…&url=…; keep it and go to #/reels. */
export function takeShare() {
  const q = new URLSearchParams(location.search);
  const raw = ['url', 'text', 'title'].map((k) => q.get(k)).filter(Boolean);
  if (!raw.length) return;
  history.replaceState(null, '', location.pathname + '#/reels');
  addReel(raw.join(' '), q.get('title') || '');
}

const daySelect = (r) => `<select class="reel-day" data-change="reel-day" data-id="${esc(r.id)}" aria-label="Día de ${esc(r.title)}">
  <option value="">Sin día</option>${D.days.map((d) => `<option value="${esc(d.id)}" ${r.dayId === d.id ? 'selected' : ''}>Día ${d.n} · ${esc(d.title)}</option>`).join('')}</select>`;
const row = (r) => `<li class="reel"><span class="o-ic">${ic('clapperboard')}</span>
  <div><b>${extLink(r.url, r.title)}</b><small>${esc(platformOf(r.url) || 'Reel')}</small>${daySelect(r)}</div>
  <button class="icon-btn sm" data-act="res-edit" data-id="${esc(r.id)}" aria-label="Editar">${ic('pen')}</button></li>`;

export function render(_, ctx) {
  ctx.title = 'Reels';
  const loose = unassigned(), placed = reels().filter((r) => !loose.includes(r));
  const byDay = D.days.map((d) => ({ d, list: placed.filter((r) => r.dayId === d.id) })).filter((x) => x.list.length);
  return `<header class="pagehead"><h1>${ic('clapperboard')} Reels</h1>
    <p class="muted">Reels de Instagram o TikTok para ver en el viaje. Compartilos desde la app con <b>Compartir → Travell</b> (en Android, con la app instalada) o pegá el link acá. Después elegí el día y aparecen en ese día.</p>
    <form class="reel-add" data-submit="reel-add"><input name="url" type="url" inputmode="url" placeholder="https://www.instagram.com/reel/…" required autocomplete="off" aria-label="Link del reel">
      <button class="btn primary" type="submit">${ic('plus')} Agregar</button></form></header>
  ${loose.length ? `<section class="card"><h3>${ic('inbox')} Sin día <span class="badge">${loose.length}</span></h3><ul class="res-list">${loose.map(row).join('')}</ul></section>` : ''}
  ${byDay.map(({ d, list }) => `<section class="card"><h3><a href="#/dia/${esc(d.id)}">Día ${d.n} · ${esc(d.title)}</a></h3><ul class="res-list">${list.map(row).join('')}</ul></section>`).join('')}
  ${reels().length ? '' : '<p class="muted">Todavía no hay reels.</p>'}`;
}

/** Card for Inicio while some reels still have no day. */
export function homeCard() {
  const n = unassigned().length;
  if (!n) return '';
  return `<a class="card tg-home due" href="#/reels">${ic('clapperboard')}<div><b>${n === 1 ? 'Un reel sin día' : `${n} reels sin día`}</b>
    <small>Elegí en qué día los quieren ver</small></div><em>›</em></a>`;
}

register({
  'reel-add': (form, _, app) => { if (addReel(new FormData(form).get('url'))) { form.reset(); app.rerender(); } },
  'reel-day': (el, _, app) => {
    const r = I.resource[el.dataset.id];
    if (!r) return;
    const { edited, ...rec } = r;
    cols.put('resources', { ...rec, dayId: el.value || null });
    toast(el.value ? `Reel en el día ${I.day[el.value].n}` : 'Reel sin día');
    app.rerender();
  },
});
