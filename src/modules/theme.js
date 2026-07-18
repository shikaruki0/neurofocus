/**
 * Theme System — 3 themes (Midnight, Cream, Dusk) + auto-switch by time.
 * Light: 6AM–6PM, Dark: 6PM–6AM
 */

import { set as storageSet, get as storageGet } from './storage.js';

export const THEMES = ['midnight', 'light', 'dusk'];
export const THEME_LABELS = {
  midnight: { icon: '🌙', name: 'Midnight' },
  light: { icon: '☀️', name: 'Cream' },
  dusk: { icon: '🌅', name: 'Dusk' },
};

/**
 * Applies a theme to the document.
 * @param {string} theme - Theme name
 */
export function setTheme(theme) {
  if (!THEMES.includes(theme)) return;
  document.documentElement.setAttribute('data-theme', theme);
  storageSet('theme', theme);
}

/**
 * Loads and applies the saved theme (or auto-theme if enabled).
 */
export function loadTheme() {
  if (storageGet('autoTheme', false)) {
    applyAutoTheme();
    return;
  }
  const saved = storageGet('theme', 'midnight');
  setTheme(saved);
}

/**
 * Toggles auto theme on/off.
 * @param {boolean} enabled
 */
export function setAutoTheme(enabled) {
  storageSet('autoTheme', enabled);
  if (enabled) applyAutoTheme();
}

/**
 * Applies theme based on current hour.
 */
export function applyAutoTheme() {
  const hour = new Date().getHours();
  setTheme(hour >= 6 && hour < 18 ? 'light' : 'midnight');
}

/**
 * Gets the current theme.
 * @returns {string}
 */
export function getCurrentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'midnight';
}
