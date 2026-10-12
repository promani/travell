// Phrase cheatsheet: how to say the basics in the local languages (data/phrases.json). Each phrase has the local
// script (to show it to someone, big) and the romanization (to try saying it); the phone's voice can read it aloud.
import { D, I } from '../store.js';
import { esc, ic, openModal } from '../util.js';
import { register } from '../ui.js';
import { tripPhase } from '../tripstate.js';

const lang = (id) => D.phrases.languages.find((l) => l.id === id);

/** The language of today's city (or of the next city of the trip before leaving). */
function defaultLang() {
  const st = tripPhase();
  const from = st.phase === 'during' ? D.days.indexOf(st.day) : 0;
  for (const d of D.days.slice(from)) {
    const l = D.phrases.languages.find((x) => x.countries.includes(I.city[d.cityId]?.country));
    if (l) return l.id;
  }
  return D.phrases.languages[0]?.id;
}

const canSpeak = () => 'speechSynthesis' in window;
const speakable = (t) => t.replace(/…/g, ' ').trim();

function row(p, l, gi, pi) {
  const [text, roman, tip] = p[l.id];
  return `<li class="phrase"><button class="phrase-main" data-act="phrase-show" data-l="${l.id}" data-g="${gi}" data-p="${pi}">
      <small>${esc(p.es)}</small><b lang="${esc(l.speech)}">${esc(text)}</b><em>${esc(roman)}</em>${tip ? `<small class="hint">${esc(tip)}</small>` : ''}</button>
    ${canSpeak() ? `<button class="icon-btn sm" data-act="phrase-say" data-l="${l.id}" data-text="${esc(speakable(text))}" aria-label="Escuchar">${ic('volume-high')}</button>` : ''}</li>`;
}

export function render(params, ctx) {
  ctx.title = 'Frases útiles';
  const langs = D.phrases.languages;
  if (!langs.length) return '<header class="pagehead"><h1>Frases útiles</h1></header><p class="muted">No hay frases cargadas.</p>';
  const l = lang(params.lang) || lang(defaultLang()) || langs[0];
  const chips = `<div class="chips">${langs.map((x) => `<a class="chip ${x.id === l.id ? 'on' : ''}" href="#/frases?lang=${x.id}">${esc(x.name)} <span lang="${esc(x.speech)}">${esc(x.native)}</span></a>`).join('')}</div>`;
  const groups = D.phrases.groups.map((g, gi) => {
    const rows = g.phrases.map((p, pi) => (p[l.id] ? row(p, l, gi, pi) : '')).join('');
    if (!rows) return '';
    return `<section class="card"><h3>${ic(g.icon || 'comments')} ${esc(g.title)}</h3>
      ${g.id === 'emergencias' && l.emergency ? `<p class="note warn inline">${ic('phone')} ${esc(l.emergency)}</p>` : ''}
      <ul class="phrases">${rows}</ul></section>`;
  }).join('');
  return `<header class="pagehead"><h1>${ic('language')} Frases útiles</h1>
    <p class="muted">Tocá una frase para mostrarla en grande. Abajo de cada una está cómo se pronuncia (${esc(l.romanization || '')}).</p></header>
  ${chips}${groups}`;
}

function say(text, langId) {
  const l = lang(langId);
  if (!canSpeak() || !l) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = l.speech; u.rate = 0.85;
  speechSynthesis.speak(u);
}

register({
  'phrase-say': (el) => say(el.dataset.text, el.dataset.l),
  'phrase-show': (el) => {
    const l = lang(el.dataset.l), p = D.phrases.groups[+el.dataset.g]?.phrases[+el.dataset.p];
    if (!l || !p?.[l.id]) return;
    const [text, roman] = p[l.id];
    openModal(`<div class="phrase-big"><small>${esc(p.es)}</small><p class="bigtext" lang="${esc(l.speech)}">${esc(text)}</p><em>${esc(roman)}</em>
      <div class="row-actions">${canSpeak() ? `<button class="btn primary" data-act="phrase-say" data-l="${l.id}" data-text="${esc(speakable(text))}">${ic('volume-high')} Escuchar</button>` : ''}
      <button class="btn" data-act="close-modal">Cerrar</button></div></div>`, { cls: 'wide' });
  },
});
