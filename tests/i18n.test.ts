/**
 * Tests for the in-app i18n engine (src/modules/i18n.ts) and dictionaries.
 *
 * The engine has module-level state, so every test reloads modules fresh
 * via vi.resetModules() to stay isolated.
 */

import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function loadI18n() {
  return import('../src/modules/i18n.ts');
}

async function loadLocales() {
  return import('../src/modules/locales.ts');
}

const originalNavigatorLanguage = Object.getOwnPropertyDescriptor(window.navigator, 'language');

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('lang');
});

afterEach(() => {
  if (originalNavigatorLanguage) {
    Object.defineProperty(window.navigator, 'language', originalNavigatorLanguage);
  }
});

describe('dictionaries', () => {
  it('gives English every translation key (source of truth)', async () => {
    const { dictionaries, en } = await loadLocales();
    expect(Object.keys(dictionaries.en).length).toBe(Object.keys(en).length);
    expect(Object.keys(en).length).toBeGreaterThan(50);
  });

  it('keeps priority languages (Hinglish + Hindi) fully translated', async () => {
    const { dictionaries, en } = await loadLocales();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(dictionaries['hi-Latn'][key], `hi-Latn missing "${key}"`).toBeTruthy();
      expect(dictionaries.hi[key], `hi missing "${key}"`).toBeTruthy();
    }
  });

  it('every data-i18n key used in index.html exists in English', async () => {
    const { dictionaries } = await loadLocales();
    const html = readFileSync('index.html', 'utf8');
    const keys = [...html.matchAll(/data-i18n(?:-placeholder|-aria-label)?="([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(keys.length).toBeGreaterThan(30);
    for (const key of new Set(keys)) {
      expect(
        dictionaries.en[key as keyof typeof dictionaries.en],
        `HTML references unknown key "${key}"`,
      ).toBeTruthy();
    }
  });
});

describe('locale ordering', () => {
  it('pins Hinglish to the top as the featured suggestion', async () => {
    const { getSupportedLocales } = await loadI18n();
    const locales = getSupportedLocales();
    expect(locales[0].code).toBe('hi-Latn');
    expect(locales[0].featured).toBe(true);
    expect(locales.some((locale) => locale.code === 'en')).toBe(true);
  });
});

describe('t() translation', () => {
  it('translates into the active locale', async () => {
    const { setLocale, t } = await loadI18n();
    setLocale('hi-Latn');
    expect(t('welcome.title')).toBe('Padhai ko game bana do');
  });

  it('falls back to English when a key is missing in the active locale', async () => {
    const { setLocale, t, previewIn } = await loadI18n();
    const { dictionaries } = await loadLocales();
    // Simulate an incomplete locale, which the engine must tolerate.
    delete dictionaries.es['nav.home'];
    setLocale('es');
    expect(t('nav.home')).toBe('Home');
    expect(previewIn('es', 'nav.home')).toBe('Home');
  });

  it('returns the raw key when nothing knows it — never crashes', async () => {
    const { t } = await loadI18n();
    expect(t('no.such.key' as never)).toBe('no.such.key');
  });

  it('interpolates {variables}', async () => {
    const { t } = await loadI18n();
    const { dictionaries } = await loadLocales();
    (dictionaries.en as Record<string, string>)['test.var' as never] = 'Hi {name}';
    expect(t('test.var' as never, { name: 'Ash' })).toBe('Hi Ash');
  });
});

describe('setLocale / getLocale', () => {
  it('persists the choice and updates <html lang>', async () => {
    const { getLocale, setLocale } = await loadI18n();
    expect(getLocale()).toBe('en');
    setLocale('hi');
    expect(getLocale()).toBe('hi');
    expect(JSON.parse(localStorage.getItem('nf_locale') || 'null')).toBe('hi');
    expect(document.documentElement.getAttribute('lang')).toBe('hi');
  });

  it('rejects unsupported codes and falls back to English', async () => {
    const { getLocale, setLocale } = await loadI18n();
    setLocale('klingon');
    expect(getLocale()).toBe('en');
  });

  it('restores the stored locale across reloads', async () => {
    const first = await loadI18n();
    first.setLocale('hi-Latn');
    vi.resetModules();
    const second = await loadI18n();
    second.initI18n();
    expect(second.getLocale()).toBe('hi-Latn');
  });
});

describe('detectInitialLocale', () => {
  it('prefers the stored choice over the browser language', async () => {
    localStorage.setItem('nf_locale', JSON.stringify('fr'));
    Object.defineProperty(window.navigator, 'language', { value: 'hi-IN', configurable: true });
    const { detectInitialLocale } = await loadI18n();
    expect(detectInitialLocale()).toBe('fr');
  });

  it('suggests Hinglish to Hindi-speaking browsers', async () => {
    Object.defineProperty(window.navigator, 'language', { value: 'hi-IN', configurable: true });
    const { detectInitialLocale } = await loadI18n();
    expect(detectInitialLocale()).toBe('hi-Latn');
  });

  it('defaults to English elsewhere', async () => {
    Object.defineProperty(window.navigator, 'language', { value: 'en-US', configurable: true });
    const { detectInitialLocale } = await loadI18n();
    expect(detectInitialLocale()).toBe('en');
  });
});

describe('language chosen flag', () => {
  it('starts unchosen and persists the choice', async () => {
    const first = await loadI18n();
    expect(first.hasChosenLanguage()).toBe(false);
    first.markLanguageChosen();
    expect(first.hasChosenLanguage()).toBe(true);
    vi.resetModules();
    const second = await loadI18n();
    expect(second.hasChosenLanguage()).toBe(true);
  });
});

describe('applyTranslations', () => {
  it('rewrites text, placeholder and aria-label in the active language', async () => {
    const i18n = await loadI18n();
    document.body.innerHTML = `
      <h1 data-i18n="welcome.title"></h1>
      <input data-i18n-placeholder="auth.local_name_ph" />
      <button data-i18n-aria-label="auth.show_password" data-i18n="auth.show"></button>
    `;
    i18n.setLocale('hi-Latn');
    expect(document.querySelector('h1')?.textContent).toBe('Padhai ko game bana do');
    expect(document.querySelector('input')?.getAttribute('placeholder')).toBe('Tumhara naam');
    const button = document.querySelector('button');
    expect(button?.textContent).toBe('Dikhao');
    expect(button?.getAttribute('aria-label')).toBe('Password dikhao');
  });
});
