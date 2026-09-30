// Dark is the default. index.html sets data-theme before the first paint;
// the choice is remembered per browser.
export type Theme = 'dark' | 'light';

const KEY = 'theme';

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0d0d0d' : '#f9f9f7');
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Storage can be blocked; the theme still applies for this visit.
  }
}
