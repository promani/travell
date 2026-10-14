// The trip code: 5 letters and numbers, the whole security of the app. The server (server/relay.mjs) only serves
// the trip's data to a browser that sent it once (POST v1/code leaves it in an HttpOnly cookie). The app keeps it
// too: it is the key the synced records are encrypted with, and it gets the phone back in if the cookie is lost.
import { ic } from './util.js';

const KEY = 'travell-code';
export const normCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const savedCode = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };

/** Sends a code to the server; true (and remembered) when it is the trip's. */
export async function sendCode(code) {
  const c = normCode(code);
  if (!c) return false;
  let r;
  try { r = await fetch('v1/code', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: c }) }); }
  catch { return false; }   // offline
  if (r.status === 429) throw new Error((await r.json().catch(() => ({}))).error || 'Demasiados intentos, probá en un rato.');
  if (!r.ok) return false;
  try { localStorage.setItem(KEY, c); } catch { /* private mode: asked again next time */ }
  return true;
}

// Codes this phone already knows: its own, or the one entered in the app before the server asked for it (kept as
// the sync key in each trip's settings).
function knownCodes() {
  const out = new Set([savedCode()]);
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (/^travell:.+:settings$/.test(k)) out.add(normCode(JSON.parse(localStorage.getItem(k))?.groupCode));
    }
  } catch { /* ignore */ }
  return [...out].filter((c) => c && c.length <= 8);
}

export const unlocked = () => { try { sessionStorage.removeItem(KEY); } catch { /* ignore */ } };

/** The server said 401: try the codes this phone knows once, then ask. Reloads the app when it gets in. */
export async function unlock(el) {
  let again = false;
  try { again = sessionStorage.getItem(KEY) === '1'; sessionStorage.setItem(KEY, '1'); } catch { /* ignore */ }
  if (!again) for (const c of knownCodes()) if (await sendCode(c).catch(() => false)) return location.reload();
  document.body.classList.add('onboarding');
  el.innerHTML = `<section class="onboard code-gate">
    <div class="code-ic">${ic('lock')}</div>
    <h1>Código del viaje</h1>
    <p class="muted">Ingresá el código de 5 letras y números que te pasaron. Se pide una sola vez en este celular.</p>
    <form class="form" autocomplete="off">
      <input id="trip-code" name="code" class="code-input" maxlength="5" autocapitalize="characters" autocorrect="off" spellcheck="false" aria-label="Código del viaje" placeholder="•••••" required>
      <p class="code-err" id="code-err" hidden></p>
      <button class="btn primary" type="submit">Entrar ${ic('arrow-right')}</button>
    </form>
  </section>`;
  const form = el.querySelector('form'), input = form.querySelector('input'), err = form.querySelector('#code-err');
  input.focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    let msg = 'Ese código no es. Probá de nuevo.';
    try { if (await sendCode(input.value)) return location.reload(); }
    catch (x) { msg = x.message; }
    if (!navigator.onLine) msg = 'Sin conexión: la primera vez hace falta internet.';
    err.textContent = msg; err.hidden = false;
    form.classList.remove('bad'); void form.offsetWidth; form.classList.add('bad');
    input.select();
  });
}
