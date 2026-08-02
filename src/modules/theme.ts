/**
 * Theme System — 3 themes (Ink, Paper, Forest) + auto-switch by time.
 *
 * Internal IDs (midnight/light/dusk) are kept stable for storage & sync
 * compatibility with existing profiles:
 *   midnight = Ink    (deep navy dark — default)
 *   light    = Paper  (warm cream light)
 *   dusk     = Forest (pine green dark)
 * Auto: Paper during 6AM–6PM, Ink during 6PM–6AM.
 */

import { set as storageSet, get as storageGet } from './storage.ts';

export type ThemeName = 'midnight' | 'light' | 'dusk';

export const THEMES: ThemeName[] = ['midnight', 'light', 'dusk'];

export interface ThemeLabel {
  icon: string;
  name: string;
}

export const THEME_LABELS: Record<ThemeName, ThemeLabel> = {
  midnight: { icon: '🌙', name: 'Ink' },
  light: { icon: '☀️', name: 'Paper' },
  dusk: { icon: '🌲', name: 'Forest' },
};

/** Browser UI color per theme (PWA chrome + splash background). */
const THEME_META_COLOR: Record<ThemeName, string> = {
  midnight: '#0a0f1e',
  light: '#faf6f0',
  dusk: '#0b1512',
};

/** Keeps the browser chrome (URL bar, PWA title bar) in sync with the theme. */
function applyMetaThemeColor(theme: ThemeName): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = THEME_META_COLOR[theme];
}

/**
 * Applies a theme to the document.
 * @param theme - Theme name
 */
export function setTheme(theme: ThemeName): void {
  if (!THEMES.includes(theme)) return;
  document.documentElement.setAttribute('data-theme', theme);
  applyMetaThemeColor(theme);
  storageSet('theme', theme);
}

/**
 * Loads and applies the saved theme (or auto-theme if enabled).
 */
export function loadTheme(): void {
  if (storageGet('autoTheme', false)) {
    applyAutoTheme();
    return;
  }
  const saved = storageGet<ThemeName>('theme', 'midnight');
  setTheme(saved);
}

/**
 * Toggles auto theme on/off.
 * @param enabled - Whether to enable auto theme
 */
export function setAutoTheme(enabled: boolean): void {
  storageSet('autoTheme', enabled);
  if (enabled) applyAutoTheme();
}

/**
 * Applies theme based on current hour.
 */
export function applyAutoTheme(): void {
  const hour = new Date().getHours();
  setTheme(hour >= 6 && hour < 18 ? 'light' : 'midnight');
}

/**
 * Gets the current theme.
 * @returns Current theme name
 */
export function getCurrentTheme(): ThemeName {
  return (document.documentElement.getAttribute('data-theme') as ThemeName) || 'midnight';
}
