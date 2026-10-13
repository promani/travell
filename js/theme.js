// Dark mode follows the time of day on the phone's clock: dark from 18:00 to 07:00. index.html sets it before the first paint.
export const DARK_FROM = 18, DARK_UNTIL = 7;
export const themeAt = (d = new Date()) => (d.getHours() >= DARK_FROM || d.getHours() < DARK_UNTIL ? 'dark' : 'light');

export function applyTheme() {
  const t = themeAt();
  if (document.documentElement.dataset.theme !== t) document.documentElement.dataset.theme = t;
}

export function watchTheme() {
  applyTheme();
  setInterval(applyTheme, 60_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) applyTheme(); });
}
