// Cheat sheet (data/phrases.json): how to say the basics in the local languages, and the kanji / hanzi you see on
// signs, menus and stations. Each entry has the local script (to show it to someone, big) and the romanization
// (to try saying it); the phone's voice can read it aloud.
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

function kanjiTile(k, l, gi, ki) {
  const [text, roman] = k[l.id];
  const n = [...text.replace(/ · /g, '·')].length;   // long signs get a smaller font so they stay on one line
  return `<li><button class="kanji" data-act="kanji-show" data-l="${l.id}" data-g="${gi}" data-k="${ki}">
    <b lang="${esc(l.speech)}" class="${n > 4 ? 'xl' : n > 2 ? 'l' : ''}">${esc(text)}</b><span>${esc(k.es)}</span><em>${esc(roman)}</em></button></li>`;
}

export function render(params, ctx) {
  ctx.title = 'Cheat sheet';
  const langs = D.phrases.languages;
  if (!langs.length) return '<header class="pagehead"><h1>Cheat sheet</h1></header><p class="muted">No hay nada cargado.</p>';
  const l = lang(params.lang) || lang(defaultLang()) || langs[0];
  const chips = `<div class="chips">${langs.map((x) => `<a class="chip ${x.id === l.id ? 'on' : ''}" href="#/cheatsheet?lang=${x.id}">${esc(x.name)} <span lang="${esc(x.speech)}">${esc(x.native)}</span></a>`).join('')}</div>`;
  const groups = D.phrases.groups.map((g, gi) => {
    const rows = g.phrases.map((p, pi) => (p[l.id] ? row(p, l, gi, pi) : '')).join('');
    if (!rows) return '';
    return `<section class="card"><h3>${ic(g.icon || 'comments')} ${esc(g.title)}</h3>
      ${g.id === 'emergencias' && l.emergency ? `<p class="note warn inline">${ic('phone')} ${esc(l.emergency)}</p>` : ''}
      <ul class="phrases">${rows}</ul></section>`;
  }).join('');
  const script = l.scriptName || 'Kanji';
  const kanji = D.phrases.kanji.map((g, gi) => {
    const tiles = g.items.map((k, ki) => (k[l.id] ? kanjiTile(k, l, gi, ki) : '')).join('');
    return tiles ? `<section class="card"><h3>${ic(g.icon || 'language')} ${esc(g.title)}</h3><ul class="kanji-grid">${tiles}</ul></section>` : '';
  }).join('');
  return `<header class="pagehead"><h1>${ic('language')} Cheat sheet</h1>
    <p class="muted">Tocá una frase o un ${esc(script.toLowerCase())} para verlo en grande. Abajo está cómo se pronuncia (${esc(l.romanization || '')}).</p></header>
  ${chips}
  ${kanji ? `<div class="chips"><button class="chip" data-act="cs-jump" data-to="cs-phrases">${ic('comments')} Phrases</button><button class="chip" data-act="cs-jump" data-to="cs-kanji">${ic('language')} ${esc(script)}</button></div>` : ''}
  <h2 class="grp" id="cs-phrases">${ic('comments')} Phrases</h2>${groups}
  ${kanji ? `<h2 class="grp" id="cs-kanji">${ic('language')} ${esc(script)} útiles</h2>
    <p class="hint">Lo que más aparece en carteles, estaciones y menús.${l.id === 'zh' ? ' En China continental se usan caracteres simplificados.' : ''}</p>${kanji}` : ''}`;
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
  'cs-jump': (el) => { document.getElementById(el.dataset.to)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  'kanji-show': (el) => {
    const l = lang(el.dataset.l), k = D.phrases.kanji[+el.dataset.g]?.items[+el.dataset.k];
    if (!l || !k?.[l.id]) return;
    const [text, roman, tip] = k[l.id];
    openModal(`<div class="phrase-big"><small>${esc(k.es)}</small><p class="bigtext kanji-big" lang="${esc(l.speech)}">${esc(text)}</p><em>${esc(roman)}</em>
      ${tip ? `<p class="hint">${esc(tip)}</p>` : ''}
      <div class="row-actions">${canSpeak() ? `<button class="btn primary" data-act="phrase-say" data-l="${l.id}" data-text="${esc(speakable(text.replace(/ · /g, '、')))}">${ic('volume-high')} Escuchar</button>` : ''}
      <button class="btn" data-act="close-modal">Cerrar</button></div></div>`, { cls: 'wide' });
  },
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
