// Light/dark choice for the web app. app.css already defines both palettes under :root[data-theme].
export type Theme = 'system' | 'light' | 'dark';
const KEY = 'mk_theme';
export function currentTheme(): Theme {
  try { const value = localStorage.getItem(KEY); return value === 'light' || value === 'dark' ? value : 'system'; } catch { return 'system'; }
}
export function isDark(theme = currentTheme()) {
  return theme === 'dark' || (theme === 'system' && typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches);
}
export function applyTheme(theme = currentTheme()) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme'); else root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark(theme) ? '#0C1311' : '#F2F4F1');
}
export function setTheme(theme: Theme) {
  try { if (theme === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, theme); } catch { /* Private mode: apply for this session only. */ }
  applyTheme(theme);
}
