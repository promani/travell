// "Simulate a day": see the whole app as if it were another day, in the morning, afternoon or evening (countdown, departure day, each day of the trip, after the trip).
import { D, now, settings, setSimulatedNow } from '../store.js';
import { esc, ic, openModal, closeModal, toast, isoDate, parseDate, fmtShort, fmtWeekdayShort, cap, hhmm as hhmmTz } from '../util.js';
import { register } from '../ui.js';
import { tripPhase, tzAt, localInstant } from '../tripstate.js';

// the simulated clock reads and is set in the local time of wherever the traveler is that day
const hhmm = (d) => hhmmTz(d, tzAt(d));
const addDays = (iso, n) => { const d = parseDate(iso); d.setDate(d.getDate() + n); return isoDate(d); };
export const isSimulating = () => !!settings.get('simOffset', 0);
// the moments of the day you can simulate: [id, wall-clock time, icon, label]
const MOMENTS = [['manana', '09:00', 'sun', 'Mañana'], ['tarde', '15:00', 'cloud-sun', 'Tarde'], ['noche', '21:00', 'moon', 'Noche']];
const momentOf = (n) => { const h = +hhmm(n).slice(0, 2); return MOMENTS[h < 13 ? 0 : h < 19 ? 1 : 2]; };

/** Where the simulated clock is: "Día 4 · Dom 15 nov · mañana", "Antes del viaje (faltan 10 días) · tarde", "Después del viaje · noche". */
export function simLabel() {
  const st = tripPhase(), m = momentOf(now())[3].toLowerCase();
  if (st.phase === 'pre') return `Antes del viaje (faltan ${st.daysToGo} días) · ${m}`;
  if (st.phase === 'post') return `Después del viaje · ${m}`;
  return `Día ${st.day.n} · ${cap(fmtWeekdayShort(st.today))} ${fmtShort(st.today)} · ${m}`;
}

export function paintSimBar(el) {
  if (!el) return;
  if (!isSimulating()) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  el.innerHTML = `<span class="sim-ic">${ic('flask')}</span><span class="sim-txt">Simulando: <b>${esc(simLabel())}</b></span>
    <button class="btn tiny" data-act="sim-step" data-n="-1" aria-label="Día anterior">‹ Día</button>
    <button class="btn tiny" data-act="sim-step" data-n="1" aria-label="Día siguiente">Día ›</button>
    <button class="btn tiny" data-act="sim-open">Cambiar</button>
    <button class="btn tiny" data-act="sim-exit">${ic('xmark')} Salir</button>`;
}

// Go to the home screen without a second redraw: changing the simulated clock (main.js listens to it) redraws once.
const goHome = () => history.replaceState(null, '', '#/inicio');

register({
  'sim-open': () => {
    const st = tripPhase();
    const cur = st.phase === 'during' ? st.day.date : st.phase === 'pre' ? 'pre' : 'post';
    const mom = isSimulating() ? momentOf(now())[0] : 'manana';
    const o = (v, l) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${esc(l)}</option>`;
    openModal(`<h3>${ic('flask')} Simular un día</h3><p class="hint">Mirá la app como si fuera ese día y ese momento: inicio, cuenta regresiva, actividades de “ahora”, tarjetas del día. No cambia tus datos.</p>
      <form class="form" data-submit="sim-apply">
        <label class="field">Día<select name="date">${o('pre', 'Antes del viaje (10 días antes)')}${D.days.map((d) => o(d.date, `Día ${d.n} · ${fmtShort(d.date)} · ${d.title}`)).join('')}${o('post', 'Después del viaje')}</select></label>
        <fieldset class="field"><legend>Momento</legend><div class="kind-pick">${MOMENTS.map(([k, , i, l]) => `<label class="chip"><input type="radio" name="moment" value="${k}" ${k === mom ? 'checked' : ''}>${ic(i)} ${l}</label>`).join('')}</div></fieldset>
        <div class="row-actions"><button class="btn primary" type="submit">Simular</button>
          ${isSimulating() ? '<button class="btn" type="button" data-act="sim-exit">Volver a la fecha real</button>' : ''}<button class="btn" type="button" data-act="close-modal">Cancelar</button></div></form>`);
  },
  'sim-apply': (form) => {
    const f = new FormData(form), v = f.get('date'), time = (MOMENTS.find((m) => m[0] === f.get('moment')) || MOMENTS[0])[1];
    const date = v === 'pre' ? addDays(D.days[0].date, -10) : v === 'post' ? addDays(D.days[D.days.length - 1].date, 3) : v;
    closeModal(form); toast('Simulando otro día');
    goHome(); setSimulatedNow(localInstant(date, time));
  },
  'sim-step': (el) => { const n = now(), tz = tzAt(n); setSimulatedNow(localInstant(addDays(isoDate(n, tz), +el.dataset.n), momentOf(n)[1])); },
  'sim-exit': () => { document.querySelector('dialog[open]')?.close(); setSimulatedNow(null); toast('Volviste a la fecha real'); },
});
