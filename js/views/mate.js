// Mate (js/mate.js): the time killer for long flights, trains and waits. Full screen over the app, playable
// upright or sideways. Suggested on days with a flight or a train (day view and Inicio).
import { D, now, forMe } from '../store.js';
import { esc, fmtDuration } from '../util.js';
import { transportTimes } from '../tripstate.js';
import { mountMate } from '../mate.js';

const LONG = ['vuelo', 'tren'];

/** "CA919 · aterrizás en 1 h 20 min": this phone's flight or train in progress, or the next one within 12 hours. */
export function waitStatus(n = now()) {
  const ts = D.transport.filter((t) => LONG.includes(t.kind) && t.departAt && forMe(t)).map((t) => ({ t, ...transportTimes(t) })).filter((x) => x.dep);
  const label = (t) => t.service || t.route;
  const on = ts.find((x) => x.arr && x.dep <= n && n < x.arr);
  if (on) return `${label(on.t)} · ${on.t.kind === 'vuelo' ? 'aterrizás' : 'llegás'} en ${fmtDuration(on.arr - n)}`;
  const next = ts.filter((x) => x.dep > n && x.dep - n < 12 * 3600000).sort((a, b) => a.dep - b.dep)[0];
  return next ? `${label(next.t)} · sale en ${fmtDuration(next.dep - n)}` : '';
}

/** Link card to the game on a day with a flight or a train ('' otherwise). */
export function mateSuggestion(day) {
  const kinds = new Set(D.transport.filter((t) => t.day === day.id && forMe(t)).map((t) => t.kind));
  if (!LONG.some((k) => kinds.has(k))) return '';
  const what = kinds.has('vuelo') ? 'el vuelo' : 'el tren';
  return `<div class="card mate-sug"><a class="mate-sug-main" href="#/mate"><span aria-hidden="true">🧉</span><div><b>Mate, para la espera</b>
    <small>Un jueguito para ${esc(what)} o el aeropuerto: cebá mates antes de que los clientes lleguen al termo</small></div><em>›</em></a></div>`;
}

// The game survives re-renders of this same screen (a sync or the weather redraw the current route): the mounted
// element is kept and put back; it is only torn down when leaving #/mate.
let host = null, game = null, timer = 0;
export function render(_, ctx) {
  ctx.title = 'Mate';
  ctx.after(() => {
    const slot = document.getElementById('mate-slot');
    if (!slot) return;
    if (!host) {
      host = document.createElement('div');
      host.className = 'mate-page';
      game = mountMate(host, { onExit: () => (history.length > 1 ? history.back() : location.assign('#/')) });
      const paint = () => game.setStatus(waitStatus());
      paint();
      timer = setInterval(paint, 30000);
    }
    slot.replaceWith(host);
  });
  ctx.cleanup(() => {
    if (/^#\/mate\b/.test(location.hash) || !host) return;
    clearInterval(timer); game.destroy(); host.remove(); host = game = null;
  });
  return '<div id="mate-slot"></div>';
}
