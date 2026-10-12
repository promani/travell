// Global search over the whole trip: activities, places, tasks, documents, lodging, alerts, transport, resources, phrases.
import { D, I, docCodes } from '../store.js';
import { esc, ic, icon, fmtShort } from '../util.js';
import { cat } from '../ui.js';
import { suggestions } from '../suggest.js';
import { KINDS } from './resources.js';

let last = '';
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function search(q) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hit = (...fields) => { const h = norm(fields.join(' ')); return words.every((w) => h.includes(w)); };
  const day = (id) => (I.day[id] ? `Día ${I.day[id].n} · ${fmtShort(I.day[id].date)}` : '');
  const out = [];
  for (const d of D.days) {
    if (hit(d.title, d.summary, I.city[d.cityId]?.name)) out.push({ g: 'Días', icon: 'calendar-day', title: `Día ${d.n}: ${d.title}`, sub: d.summary, href: `#/dia/${d.id}` });
    for (const a of d.activities) if (hit(a.title, a.detail, a.area, a.how)) out.push({ g: 'Actividades', icon: cat(a.category).icon, title: a.title, sub: `${day(d.id)}${a.start ? ' · ' + a.start : ''}`, href: `#/dia/${d.id}` });
  }
  for (const p of D.places) if (hit(p.name, p.nameLocal, p.area, p.description)) out.push({ g: 'Lugares', icon: cat(p.category).icon, title: p.name, sub: [I.city[p.cityId]?.name, p.area].filter(Boolean).join(' · '), href: `#/lugar/${p.id}` });
  for (const t of D.tasks) if (hit(t.title, t.notes)) out.push({ g: 'Tareas', icon: t.status === 'hecho' ? 'check' : 'square-check', title: t.title, sub: [I.traveler[t.assignee]?.name, t.status].filter(Boolean).join(' · '), href: '#/tareas?f=todas' });
  for (const x of D.documents) if (hit(x.title, x.subtitle, x.notes, docCodes.get(x))) out.push({ g: 'Documentos', icon: 'ticket', title: x.title, sub: x.subtitle, href: `#/docs/${x.type}` });
  for (const l of D.lodging) if (hit(l.name, l.area, l.address, l.notes, l.confirmation)) out.push({ g: 'Alojamientos', icon: 'hotel', title: l.name, sub: `${fmtShort(l.checkIn)} → ${fmtShort(l.checkOut)}`, href: '#/alojamientos' });
  for (const t of D.transport) if (hit(t.route, t.service, t.medium)) out.push({ g: 'Transporte', icon: 'train', title: t.route, sub: [day(t.day), t.service].filter(Boolean).join(' · '), href: `#/dia/${t.day}` });
  for (const s of suggestions({ includeClosed: true })) if (hit(s.title, s.detail)) out.push({ g: 'Sugerencias y preparativos', icon: s.icon, title: s.title, sub: s.state ? `${s.kind} · ${s.state}` : s.detail, href: '#/tareas#sugerencias' });
  for (const n of D.notes) if (hit(n.title, n.detail)) out.push({ g: 'Alertas', icon: 'triangle-exclamation', title: n.title, sub: n.detail, href: n.days?.[0] ? `#/dia/${n.days[0]}` : '#/itinerario' });
  for (const r of D.resources) if (hit(r.title, r.notes, I.city[r.cityId]?.name)) out.push({ g: 'Recursos', icon: (KINDS[r.kind] || KINDS.otro)[0], title: r.title, sub: [I.city[r.cityId]?.name || 'Todo el viaje', (KINDS[r.kind] || KINDS.otro)[1]].join(' · '), href: `#/recursos${r.cityId ? '?city=' + r.cityId : ''}` });
  for (const gr of D.phrases.groups) for (const ph of gr.phrases) for (const l of D.phrases.languages) {
    if (ph[l.id] && hit(ph.es, ph[l.id][1])) out.push({ g: 'Frases', icon: 'language', title: `${ph.es} — ${ph[l.id][0]}`, sub: `${l.name} · ${ph[l.id][1]}`, href: `#/frases?lang=${l.id}` });
  }
  return out;
}

function results(q) {
  const r = search(q);
  if (!q.trim()) return '<p class="muted">Buscá actividades, lugares, tareas, documentos, hoteles…</p>';
  if (!r.length) return `<p class="muted">Sin resultados para “${esc(q)}”.</p>`;
  const groups = {};
  r.forEach((x) => (groups[x.g] ||= []).push(x));
  return Object.entries(groups).map(([g, arr]) => `<h3 class="grp">${esc(g)} (${arr.length})</h3><ul class="nearby card">${arr.slice(0, 30).map((x) =>
    `<li><a href="${esc(x.href)}"><span class="o-ic">${icon(x.icon)}</span><div><b>${esc(x.title)}</b>${x.sub ? `<small class="clamp">${esc(x.sub)}</small>` : ''}</div></a></li>`).join('')}</ul>`).join('');
}

export function render(params, ctx) {
  ctx.title = 'Buscar';
  if (params.q != null) last = params.q;
  ctx.after(() => {
    const input = document.getElementById('q'), box = document.getElementById('results');
    input.focus(); input.setSelectionRange(input.value.length, input.value.length);
    input.addEventListener('input', () => { last = input.value; box.innerHTML = results(last); });
  });
  return `<header class="pagehead"><h1>${ic('magnifying-glass')} Buscar</h1></header>
    <input id="q" type="search" placeholder="Ej: ramen, Kioto, fiebre, MU746…" value="${esc(last)}" autocomplete="off" aria-label="Buscar en el viaje">
    <div id="results">${results(last)}</div>`;
}
