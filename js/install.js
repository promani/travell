// "Instalá la app": a bar like the update one for whoever opens Travell in the browser instead of the installed app
// (installed, it opens full screen, keeps working offline and receives reels from the share button).
// Chrome/Edge/Samsung on Android offer their install prompt; on iPhone it has to be done by hand from Safari's
// share menu, so the bar says how. Closed, it comes back after a few days.
import { ic } from './util.js';

const KEY = 'travell:install-closed';
const AGAIN = 3 * 864e5;   // closed: ask again in 3 days
let prompt = null;

const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const closedLately = () => { try { return Date.now() - Number(localStorage.getItem(KEY) || 0) < AGAIN; } catch { return false; } };

function close(bar, remember) {
  bar.remove();
  if (remember) try { localStorage.setItem(KEY, String(Date.now())); } catch { /* private mode: it just comes back */ }
}

function show() {
  if (installed() || closedLately() || document.getElementById('install-bar') || document.getElementById('update-bar')) return;
  if (!prompt && !ios()) return;   // a browser that can't install it: nothing to offer
  const bar = document.createElement('div');
  bar.id = 'install-bar'; bar.className = 'app-bar';
  bar.innerHTML = prompt
    ? `<span>Instalá la app</span><button class="btn small" data-go>Instalar</button>`
    : `<span>Instalá la app: ${ic('arrow-up-from-bracket')} Compartir → <b>Agregar a inicio</b></span>`;
  bar.insertAdjacentHTML('beforeend', `<button class="icon-btn sm" data-x aria-label="Cerrar">${ic('xmark')}</button>`);
  bar.querySelector('[data-x]').onclick = () => close(bar, true);
  const go = bar.querySelector('[data-go]');
  if (go) go.onclick = async () => { const p = prompt; prompt = null; p.prompt(); const { outcome } = await p.userChoice; close(bar, outcome !== 'accepted'); };
  document.body.appendChild(bar);
}

// the browser offers the install only after this event; it can fire before the app finished loading
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); prompt = e; show(); });
window.addEventListener('appinstalled', () => document.getElementById('install-bar')?.remove());

/** Called once the app is on screen. */
export function offerInstall() { if (ios()) setTimeout(show, 1500); }
