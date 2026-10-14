// Home: a hero for the moment of the trip, the two document shortcuts and only what needs attention today.
// Permissions/setup live in "Más", places in "Mapa", the full document list in "Docs".
import { D, I, done, me, now, forMe } from '../store.js';
import { esc, ic, fmtShort } from '../util.js';
import { tripPhase, activityNow, lodgingOfDay } from '../tripstate.js';
import { departureCard, checklistCard, heroImg, renderCards, actRow, notesCard, dayLabel } from '../ui.js';
import { openTasks, taskRow } from './tasks.js';
import { suggestions } from '../suggest.js';
import { weatherLine } from '../weather.js';
import { mateSuggestion } from './mate.js';
import { homeCard as gameCard } from './games.js';
import { paintAttachments, freeUrls } from '../ticket.js';

const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

function heroPre(st) {
  const n = st.daysToGo;
  const first = D.days[0], last = D.days[D.days.length - 1];
  const g = heroImg(D.trip.images?.pre);
  const arrival = D.days.find((d) => d.cityId && d.cityId !== D.trip.home?.cityId);
  return `<section class="hero hero-pre${g.cls}"${g.style}>
    <div class="hero-kicker">${esc(D.trip.subtitle || '')}</div>
    <h1>${n === 1 ? 'Falta' : 'Faltan'} <span class="big">${n}</span> ${n === 1 ? 'día' : 'días'} para tu viaje</h1>
    <div class="hero-meta"><p class="hero-sub">${ic('calendar-day')} ${esc(fmtShort(first.date))} → ${esc(fmtShort(last.date))} · ${plural(D.days.length, 'día', 'días')}</p>
    ${arrival ? weatherLine(arrival, { prefix: `Al llegar a ${I.city[arrival.cityId]?.name || ''}` }) : ''}</div>
  </section>`;
}

function heroDuring(st) {
  const d = st.day, l = lodgingOfDay(d);
  const g = heroImg(d.image);
  return `<section class="hero${g.cls}"${g.style}>
    <div class="hero-kicker">Día ${d.n} de ${st.total}${d.cityId ? ' · ' + esc(I.city[d.cityId]?.name || '') : ''}</div>
    <h1>${esc(d.title)}</h1>
    <p>${esc(d.summary || '')}</p>
    <div class="hero-meta"><p class="hero-sub">${ic('calendar-day')} ${esc(dayLabel(d))}</p>${weatherLine(d)}</div>
    ${d.sleepsAt ? `<p class="hero-lodging">${ic('bed')} ${esc(l ? l.name + (l.area ? ' (' + l.area + ')' : '') : d.sleepsAt)}</p>` : ''}
  </section>`;
}

function heroPost() {
  const total = D.days.length;
  const g = heroImg(D.trip.images?.post);
  return `<section class="hero hero-post${g.cls}"${g.style}><div class="hero-emoji">${ic('champagne-glasses')}</div><h1>¡Volviste!</h1>
    <p>Fueron ${total} días. Repasá las fotos y cerrá las cuentas.</p>
    <div class="row-actions center"><a class="btn" href="#/fotos">${ic('camera')} Fotos</a><a class="btn" href="#/gastos">${ic('money-bill-wave')} Gastos</a></div></section>`;
}

function quickLinks() {
  return `<nav class="tiles" aria-label="Accesos rápidos">
    <a class="tile primary" href="#/transporte"><span>${ic('ticket')}</span>Pasajes y QR</a>
    <a class="tile primary" href="#/docs"><span>${ic('passport')}</span>Visas y documentos</a>
  </nav>`;
}

export function render(_, ctx) {
  ctx.cleanup(freeUrls);
  ctx.after(paintAttachments);
  const st = tripPhase();
  const day = st.day;
  const startCard = st.phase === 'during' ? day.cards.find((c) => c.type === 'departure' && c.tripStart && forMe(c)) : null;
  let h = st.phase === 'pre' ? heroPre(st) : st.phase === 'post' ? heroPost() : startCard ? departureCard(startCard, day, { hero: true }) : heroDuring(st);
  if (st.phase !== 'post') h += quickLinks();
  if (startCard) h += checklistCard(startCard, day);

  if (st.phase === 'during') {
    h += renderCards(day, ctx, { skipTripStart: true });
    const { current, next } = activityNow(day, now());
    const first = day.activities.filter((a) => !done.has(a.id) && forMe(a)).slice(0, 3);
    const rows = (current || next ? [current, next].filter(Boolean) : first);
    if (rows.length) {
      h += `<section class="card"><div class="card-head"><h3>${current ? 'Ahora y lo que sigue' : next ? 'Lo que sigue' : 'Hoy'}</h3><a href="#/dia/${day.id}">Ver el día →</a></div>
        ${rows.map((a) => actRow(a, { current: a === current, next: a === next })).join('')}</section>`;
    }
    h += notesCard(day, { title: 'Notas de hoy', compact: true });
    h += mateSuggestion(day);
  }
  if (st.phase !== 'post') h += gameCard();

  if (st.phase !== 'post') {
    const mineOnly = !!me();
    const tasks = openTasks(st.today, { mineOnly });
    const sugs = suggestions().length;
    h += `<section class="card"><div class="card-head"><h3>${ic('square-check')} ${mineOnly ? 'Mis tareas' : 'Por hacer'}</h3><a href="#/tareas">Ver todas →</a></div>
      <ul class="tasks">${tasks.slice(0, 3).map(taskRow).join('') || `<li class="muted">Nada pendiente ${ic('champagne-glasses')}</li>`}</ul>
      ${sugs ? `<a class="more-line" href="#/tareas#sugerencias">${ic('lightbulb')} ${sugs} ${sugs === 1 ? 'cosa que te puede faltar' : 'cosas que te pueden faltar'}<em>›</em></a>` : ''}</section>`;
  }
  return h;
}
