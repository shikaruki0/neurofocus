/**
 * Theme System — 3 themes (Midnight, Cream, Dusk) + auto-switch by time.
 * Light: 6AM–6PM, Dark: 6PM–6AM
 */

import { set as storageSet, get as storageGet } from './storage.ts';

export type ThemeName = 'midnight' | 'light' | 'dusk';

export const THEMES: ThemeName[] = ['midnight', 'light', 'dusk'];

export interface ThemeLabel {
  icon: string;
  name: string;
}

export const THEME_LABELS: Record<ThemeName, ThemeLabel> = {
  midnight: { icon: '🌙', name: 'Midnight' },
  light: { icon: '☀️', name: 'Cream' },
  dusk: { icon: '🌅', name: 'Dusk' },
};

/**
 * Applies a theme to the document.
 * @param theme - Theme name
 */
export function setTheme(theme: ThemeName): void {
  if (!THEMES.includes(theme)) return;
  document.documentElement.setAttribute('data-theme', theme);
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
