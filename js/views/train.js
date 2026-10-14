// Entrenar: short mind-training exercises (memory, attention, flexibility) for whoever doesn't feel like Mate.
// Unlike the Juego del día there is no ranking between travelers: each phone keeps its own history of sessions.
// Each exercise adapts quietly (the next session starts where the last one left off, kept on this phone).
import { esc, ic, fmtShort, isoDate, hhmm, deviceTz } from '../util.js';
import * as camino from '../camino.js';
import * as clasificar from '../clasificar.js';
import * as eco from '../eco.js';

export const EXERCISES = {
  camino: { mod: camino, label: 'Camino', icon: 'shoe-prints', skill: 'Memoria',
    blurb: 'Memorizá dónde están los pozos y cruzá sin pisarlos',
    how: ['Por unos segundos ves los pozos (los cuadros oscuros).', 'Después se esconden: cruzá desde abajo hasta la bandera tocando un cuadro al lado del otro (arriba, abajo o a los costados).', `Son ${camino.ROUNDS} cruces. Si ya los tenés, tocá "Ya está" para que se escondan antes.`] },
  clasificar: { mod: clasificar, label: 'Clasificar', icon: 'arrows-left-right', skill: 'Flexibilidad', seconds: 60,
    blurb: 'Mandá cada figura a su lado, aunque la regla cambie',
    how: ['Arriba dice la regla: por color, por forma o por cantidad.', 'Deslizá la figura hacia el lado que le toca, o tocá ese lado.', 'La regla cambia sin avisar: mirá los carteles de abajo. Dura un minuto.'] },
  eco: { mod: eco, label: 'Eco', icon: 'repeat', skill: 'Memoria de trabajo', seconds: 60,
    blurb: '¿Este símbolo es igual al de antes?',
    how: ['Van apareciendo símbolos de a uno.', 'Para cada uno, contestá si es igual al anterior (o al de 2 o 3 antes, cuando te sale fácil).', 'Sin apuro: no cuenta la velocidad. Dura un minuto.'] },
};

const KEY = 'travell-train';
const levels = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const saveLevel = (id, lv) => { try { localStorage.setItem(KEY, JSON.stringify({ ...levels(), [id]: lv })); } catch { /* private mode: start from zero next time */ } };

// History of sessions on this phone: { [id]: [{ at, hits, total, cut? }] }, newest last. A session left with
// "Terminar" is kept but marked, and doesn't count for the best score.
const HIST = 'travell-train-history', KEEP = 200;
const history = (id) => { try { return JSON.parse(localStorage.getItem(HIST))?.[id] || []; } catch { return []; } };
function record(id, entry) {
  try {
    const all = JSON.parse(localStorage.getItem(HIST)) || {};
    all[id] = [...(all[id] || []), entry].slice(-KEEP);
    localStorage.setItem(HIST, JSON.stringify(all));
  } catch { /* private mode: nothing kept */ }
}
export const best = (h) => h.filter((r) => !r.cut).reduce((b, r) => (!b || r.hits > b.hits ? r : b), null);
const when = (at) => { const d = new Date(at), tz = deviceTz(); return `${fmtShort(isoDate(d, tz))} ${hhmm(d, tz)}`; };

function historyHtml(id, latest) {
  const h = history(id);
  if (!h.length) return '';
  const top = best(h);
  return `<div class="tr-hist"><h4>${ic('clock-rotate-left')} Historial${top ? ` · mejor: ${top.hits}` : ''}</h4>
    <table class="tr-hist-t"><tbody>${h.slice(-10).reverse().map((r) => `<tr class="${r === top ? 'best' : ''}${r.at === latest ? ' now' : ''}">
      <td>${esc(when(r.at))}</td><td><b>${r.hits}</b> de ${r.total}${r === top ? ` ${ic('star')}` : ''}${r.cut ? ' <small>(cortado)</small>' : ''}</td></tr>`).join('')}</tbody></table>
    ${h.length > 10 ? `<p class="hint">${h.length} sesiones en total.</p>` : ''}</div>`;
}

function listHtml() {
  return `<header class="pagehead"><h1>${ic('brain')} Entrenar</h1>
    <p class="muted">Ejercicios cortos para despejar y entrenar la cabeza en un vuelo, un tren o una espera. Cada celular guarda tu historial.</p></header>
  <nav class="menu">${Object.entries(EXERCISES).map(([id, x]) => `<a href="#/entrenar?g=${id}"><span>${ic(x.icon)}</span><div><b>${esc(x.label)}</b><small>${esc(x.blurb)} · ${esc(x.skill)}${best(history(id)) ? ` · mejor: ${best(history(id)).hits}` : ''}</small></div><em>›</em></a>`).join('')}
    <a href="#/mate"><span>${ic('mug-hot')}</span><div><b>Mate</b><small>Más de reflejos: cebá antes de que lleguen al termo</small></div><em>›</em></a></nav>`;
}

// One exercise screen: intro → playing → done. Lives in its own element so a re-render of the route (a sync, the
// weather) puts it back as it was instead of restarting it; it is torn down when leaving the exercise.
function session(id) {
  const x = EXERCISES[id], el = document.createElement('div');
  el.className = 'tr-page';
  let game = null, clock = 0, used = 0, since = 0, hits = 0, total = 0;

  const intro = () => {
    el.innerHTML = `<section class="card tr-card tr-intro">
      <div class="tr-icon">${ic(x.icon)}</div><h2>${esc(x.label)}</h2><p class="muted">${esc(x.skill)}</p>
      <ul class="tr-how">${x.how.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
      <button class="btn primary tr-go" data-tr="start">${ic('play')} Empezar</button>
      ${historyHtml(id)}
    </section>`;
  };
  const start = () => {
    hits = total = used = 0;
    el.innerHTML = `<section class="card tr-card tr-play">
      <div class="tr-top"><span class="tr-hits" id="tr-hits">${ic('check')} 0</span>${x.seconds ? '<div class="tr-time"><i id="tr-bar"></i></div>' : '<span></span>'}
        <button class="btn small" data-tr="stop">Terminar</button></div>
      <div class="tr-stage"></div></section>`;
    game = x.mod.mount(el.querySelector('.tr-stage'), {
      level: levels()[id] || 0,
      report: (ok) => { total++; hits += ok; const h = el.querySelector('#tr-hits'); if (h) h.innerHTML = `${ic('check')} ${hits}`; },
      onFinish: finish,
    });
    if (x.seconds) { since = Date.now(); clock = setInterval(tick, 200); }
  };
  // the clock only runs while the screen is on: locking the phone mid-exercise doesn't eat the minute
  const tick = () => {
    if (document.hidden) { if (since) { used += Date.now() - since; since = 0; } return; }
    if (!since) since = Date.now();
    const t = used + Date.now() - since, bar = el.querySelector('#tr-bar');
    if (bar) bar.style.width = `${Math.max(0, 100 - (t / (x.seconds * 1000)) * 100)}%`;
    if (t >= x.seconds * 1000) finish();
  };
  const stop = () => { clearInterval(clock); clock = 0; if (game) { saveLevel(id, game.level()); game.destroy(); game = null; } };
  function finish(cut = false) {
    if (!game) return;
    stop();
    const at = Date.now(), prev = best(history(id));
    if (total) record(id, { at, hits, total, ...(cut ? { cut: true } : {}) });
    const top = !cut && total && (!prev || hits > prev.hits);
    el.innerHTML = `<section class="card tr-card tr-done">
      <div class="tr-icon">${ic(top ? 'star' : x.icon)}</div>
      <h2>${total ? `${hits} de ${total} bien` : esc(x.label)}</h2>
      ${top && prev ? `<p class="tr-best">${ic('arrow-trend-up')} ¡Tu mejor puntaje! Antes: ${prev.hits}</p>` : ''}
      <div class="row-actions"><button class="btn primary" data-tr="start">${ic('rotate-right')} Volver a intentar</button><a class="btn" href="#/entrenar">Otros ejercicios</a></div>
      ${historyHtml(id, at)}
    </section>`;
  }
  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-tr]')?.dataset.tr;
    if (a === 'start') start();
    else if (a === 'stop') finish(true);
  });
  intro();
  return { id, el, destroy: stop };
}

let live = null;
export function render(params, ctx) {
  const x = EXERCISES[params.g];
  if (!x) return listHtml();
  ctx.title = `${x.label} · Entrenar`;
  ctx.after(() => {
    const slot = document.getElementById('tr-slot');
    if (!slot) return;
    if (live?.id !== params.g) { live?.destroy(); live = session(params.g); }
    slot.replaceWith(live.el);
  });
  ctx.cleanup(() => {
    if (live && location.hash.includes(`entrenar?g=${live.id}`)) return;
    live?.destroy(); live = null;
  });
  return `<header class="pagehead"><a class="back" href="#/entrenar">${ic('chevron-left')} Entrenar</a></header><div id="tr-slot"></div>`;
}
