// Task module: to-dos that can be assigned to any traveler, plus automatic suggestions of what's missing.
import { D, I, cols, me, now } from '../store.js';
import { esc, ic, icon, fmtShort, daysBetween, isoDate, toast, openModal, closeModal } from '../util.js';
import { register, extLink } from '../ui.js';
import { tripPhase } from '../tripstate.js';
import { suggestions } from '../suggest.js';
import { openTaskForm } from './forms.js';

const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
let filter = null, showClosed = false;

export function dueInfo(t, todayISO) {
  if (t.dueAt) {
    const due = new Date(t.dueAt);
    const diff = daysBetween(todayISO, isoDate(due));
    const when = `${fmtShort(isoDate(due))} ${due.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
    if (t.status !== 'hecho' && due < now()) return { text: `Venció el ${when}`, cls: 'late', rank: -1000 + diff };
    return { text: diff === 0 ? `Hoy ${when.split(' ').slice(-1)[0]}` : diff > 0 ? `En ${plural(diff, 'día', 'días')} · ${when}` : when, cls: diff <= 3 ? 'soon' : '', rank: diff };
  }
  if (t.urgent) return { text: t.when || 'Ya', cls: 'soon', rank: -500 };
  return { text: t.when || 'Sin fecha', cls: '', rank: 500 };
}

const isMine = (t) => !!me() && (t.assignee === me() || !t.assignee);
export function openTasks(todayISO, { mineOnly = false } = {}) {
  return D.tasks.filter((t) => t.status !== 'hecho' && (!mineOnly || isMine(t)))
    .map((t) => ({ t, due: dueInfo(t, todayISO) }))
    .sort((a, b) => (b.t.priority === 'alta') - (a.t.priority === 'alta') || a.due.rank - b.due.rank);
}

export const who = (id) => {
  const tr = I.traveler[id];
  return tr ? `<span class="who" style="--c:${esc(tr.color || '#888')}" title="${esc(tr.name)}">${esc(tr.name.trim().slice(0, 2).toUpperCase())}</span>` : '<span class="who none" title="Sin asignar">?</span>';
};

export function taskRow({ t, due }) {
  const dayRef = t.day && I.day[t.day] ? ` · para el <a href="#/dia/${t.day}">${esc(fmtShort(I.day[t.day].date))}</a>` : '';
  const assignee = I.traveler[t.assignee];
  const byOther = t.createdBy && t.createdBy !== me() && I.traveler[t.createdBy] ? ` · de ${esc(I.traveler[t.createdBy].name)}` : '';
  return `<li class="task ${due.cls} ${t.status === 'hecho' ? 'is-done' : ''} ${t.priority === 'alta' ? 'hot' : ''}">
    <button class="act-done" data-act="toggle-task" data-id="${esc(t.id)}" aria-label="Marcar como hecha" aria-pressed="${t.status === 'hecho'}">${ic('check')}</button>
    <div class="task-body" data-act="task-edit" data-id="${esc(t.id)}" role="button" tabindex="0"><b>${t.priority === 'alta' ? ic('fire') + ' ' : ''}${esc(t.title)}</b>
      <small>${esc(due.text)}${dayRef}${assignee ? ` · ${esc(assignee.name)}` : ' · sin asignar'}${byOther}</small>${t.notes ? `<small class="muted clamp">${esc(t.notes)}</small>` : ''}</div>
    ${who(t.assignee)}</li>`;
}

export function sugRow(s) {
  const a = s.action;
  const actBtn = !a ? '' : a.href ? `<a class="btn tiny" href="${esc(a.href)}">${esc(a.label)}</a>`
    : `<button class="btn tiny" data-act="${esc(a.act)}" ${a.id ? `data-id="${esc(a.id)}"` : ''} ${a.prefill ? `data-prefill='${esc(JSON.stringify(a.prefill))}'` : ''}>${esc(a.label)}</button>`;
  const due = s.due ? ` · antes del ${esc(fmtShort(s.due))}` : s.day && I.day[s.day] ? ` · día ${I.day[s.day].n}` : '';
  return `<li class="sug ${s.state ? 'closed' : ''}"><span class="o-ic">${icon(s.icon)}</span><div>
    <b>${esc(s.title)}</b><small>${esc(s.kind)}${due}${s.state ? ` · ${esc(s.state)}` : ''}</small>
    ${s.detail ? `<small class="muted clamp">${esc(s.detail)}</small>` : ''}
    <div class="row-actions">${s.state ? `<button class="btn tiny" data-act="sug-restore" data-key="${esc(s.key)}">Restaurar</button>` : `
      <button class="btn tiny primary" data-act="sug-task" data-key="${esc(s.key)}">${ic('plus')} Tarea</button>${actBtn}
      <button class="btn tiny" data-act="sug-done" data-key="${esc(s.key)}">${ic('check')} Ya está</button>
      <button class="btn tiny" data-act="sug-ignore" data-key="${esc(s.key)}">No aplica</button>`}
      ${s.link ? extLink(s.link, 'Info') : ''}</div></div></li>`;
}

export function render(params, ctx) {
  ctx.title = 'Tareas';
  const st = tripPhase();
  if (params.f) filter = params.f;
  if (!filter) filter = me() ? 'mias' : 'todas';
  const all = D.tasks.map((t) => ({ t, due: dueInfo(t, st.today) }));
  const sel = {
    mias: (x) => x.t.status !== 'hecho' && isMine(x.t),
    todas: (x) => x.t.status !== 'hecho',
    libres: (x) => x.t.status !== 'hecho' && !x.t.assignee,
    hechas: (x) => x.t.status === 'hecho',
  }[filter] || ((x) => x.t.status !== 'hecho' && x.t.assignee === filter);
  const list = all.filter(sel).sort((a, b) => (b.t.priority === 'alta') - (a.t.priority === 'alta') || a.due.rank - b.due.rank);
  const count = (f) => all.filter(f).length;
  const sugs = suggestions({ includeClosed: showClosed });
  const chip = (k, l, n) => `<a class="chip ${filter === k ? 'on' : ''}" href="#/tareas?f=${k}">${l} (${n})</a>`;
  return `<header class="pagehead"><h1>${ic('square-check')} Tareas</h1><p class="muted">Reservas, trámites y preparativos. Asignalas a cualquier viajero; con la sincronización activa le llegan a su celular.</p></header>
  <div class="row-actions"><button class="btn primary" data-act="task-new" data-prefill='${esc(JSON.stringify({ assignee: me() }))}'>${ic('plus')} Nueva tarea</button></div>
  <div class="chips">${me() ? chip('mias', 'Mías', count((x) => x.t.status !== 'hecho' && isMine(x.t))) : ''}
    ${chip('todas', 'Todas', count((x) => x.t.status !== 'hecho'))}${chip('libres', 'Sin asignar', count((x) => x.t.status !== 'hecho' && !x.t.assignee))}
    ${D.travelers.filter((t) => t.id !== me()).map((t) => chip(t.id, esc(t.name), count((x) => x.t.status !== 'hecho' && x.t.assignee === t.id))).join('')}
    ${chip('hechas', 'Hechas', count((x) => x.t.status === 'hecho'))}</div>
  <section class="card"><ul class="tasks">${list.map(taskRow).join('') || `<li class="muted">Nada por acá ${ic('champagne-glasses')}</li>`}</ul></section>
  <section class="card" id="sugerencias"><div class="card-head"><h3>${ic('lightbulb')} Sugerencias: te falta…</h3>
    <button class="btn tiny" data-act="sug-closed">${showClosed ? 'Ocultar descartadas' : 'Ver descartadas'}</button></div>
    <p class="hint">Salen de los datos del viaje (hospedajes por reservar, noches sin alojamiento, pasajes sin comprar, entradas, códigos sin cargar) y de los preparativos de <code>requirements.json</code>.</p>
    <ul class="sugs">${sugs.map(sugRow).join('') || '<li class="muted">No encontramos nada pendiente.</li>'}</ul></section>`;
}

function saveStatus(t, status, app) {
  const { edited, file, ...rest } = t;
  cols.put('tasks', { ...rest, status });
  if (status === 'hecho') toast('¡Hecha!');
  app.rerender();
}

// Completion animation: the check pops, a little confetti burst comes out of it and the row slides away.
function celebrate(row) {
  row.classList.add('completing');
  const btn = row.querySelector('.act-done');
  const burst = document.createElement('span');
  burst.className = 'burst';
  const colors = ['var(--ok)', 'var(--warn)', 'var(--info)', 'var(--bad)', '#fab005'];
  burst.innerHTML = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2, d = 26 + Math.random() * 18;
    return `<i style="--x:${(Math.cos(a) * d).toFixed(1)}px;--y:${(Math.sin(a) * d).toFixed(1)}px;--c:${colors[i % colors.length]};--r:${Math.round(Math.random() * 360)}deg"></i>`;
  }).join('');
  btn.appendChild(burst);
}

register({
  'toggle-task': (el, _, app) => {
    const t = I.task[el.dataset.id];
    if (t.status === 'hecho') return saveStatus(t, 'pendiente', app);
    openModal(`<div class="confirm-done"><div class="confirm-ic">${ic('circle-check')}</div><h3>¿Seguro que ya está hecha?</h3>
      <p><b>${esc(t.title)}</b></p>
      <div class="row-actions"><button class="btn primary" data-act="task-done-ok" data-id="${esc(t.id)}">Sí, está hecha</button>
      <button class="btn" data-act="close-modal">Todavía no</button></div></div>`);
  },
  'task-done-ok': (el, _, app) => {
    const t = I.task[el.dataset.id];
    closeModal(el);
    const row = document.querySelector(`.task [data-act="toggle-task"][data-id="${CSS.escape(t.id)}"]`)?.closest('.task');
    if (!row || matchMedia('(prefers-reduced-motion: reduce)').matches) return saveStatus(t, 'hecho', app);
    celebrate(row);
    setTimeout(() => saveStatus(t, 'hecho', app), 1100);
  },
  'sug-task': (el) => {
    const s = suggestions({ includeClosed: true }).find((x) => x.key === el.dataset.key);
    if (!s) return;
    openTaskForm({ title: s.title, notes: s.detail, day: s.day || null, dueAt: s.due ? `${s.due}T12:00` : null, source: 'sug:' + s.key, covers: [s.key], assignee: me() });
  },
  'sug-done': (el, _, app) => { cols.put('suggestions', { id: el.dataset.key, state: 'hecho' }); app.rerender(); },
  'sug-ignore': (el, _, app) => { cols.put('suggestions', { id: el.dataset.key, state: 'no aplica' }); app.rerender(); },
  'sug-restore': (el, _, app) => { cols.del('suggestions', el.dataset.key); app.rerender(); },
  'sug-closed': (_, __, app) => { showClosed = !showClosed; app.rerender(); },
});
