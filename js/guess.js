// Guesses from a shared confirmation (email text, file names): the booking code and which flight / hotel / ticket it
// belongs to. Only suggestions: the "Compartido" screen always shows them for review before saving.
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/** A booking code next to the words that usually introduce it, or a lone 6-character PNR-looking token. */
export function guessCode(text) {
  const t = String(text || '');
  const near = /(?:reserva|localizador|booking|confirmaci[oó]n|confirmation|c[oó]digo|code|pnr|record locator)[^A-Z0-9\n]{0,25}([A-Z0-9]{5,12})\b/i.exec(t);
  if (near && /\d/.test(near[1]) && /[A-Z]/i.test(near[1])) return near[1].toUpperCase();
  return /\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{6}\b/.exec(t)?.[0] || '';
}
export const firstUrl = (s) => /https?:\/\/[^\s<>"]+/.exec(s || '')?.[0] || '';

/** The option whose words (flight number, hotel name…) appear most in what was shared. groups: [[name, [[key, label, words]]]]. */
export function guessTarget(item, groups) {
  const hay = norm(`${item.title} ${item.text} ${item.url} ${item.files.map((f) => f.name).join(' ')}`);
  let best = '', score = 0;
  for (const [, opts] of groups) for (const [key, , words] of opts) {
    const s = norm(words).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 || /\d/.test(w) && w.length >= 3).reduce((n, w) => n + (hay.includes(w) ? (/\d/.test(w) ? 3 : 1) : 0), 0);
    if (s > score) { best = key; score = s; }
  }
  return best;
}

