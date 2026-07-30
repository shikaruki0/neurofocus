/**
 * i18n — In-app internationalization engine.
 *
 * NeuroFocusX ships its own translation system instead of relying on the
 * browser's page translator, so language is a product feature:
 * users pick it inside the app and it works offline, instantly.
 *
 * Design:
 *  - `locales.ts` holds the dictionaries (`en` is the full source of truth).
 *  - Static markup uses `data-i18n`, `data-i18n-placeholder`, `data-i18n-aria-label`;
 *    `applyTranslations()` rewrites the DOM in the active language.
 *  - Dynamic strings call `t(key)`.
 *  - Missing keys fall back to English, then to the raw key (never crashes).
 *  - Choice persists in local storage (`nf_locale`, `nf_languageChosen`).
 */

import { get as storageGet, set as storageSet } from './storage.ts';
import { dictionaries, FALLBACK_LOCALE } from './locales.ts';
import type { LocaleCode, TranslationKey } from './locales.ts';

export type { LocaleCode, TranslationKey } from './locales.ts';

/** Display info for one language in the picker. */
export interface LocaleInfo {
  code: LocaleCode;
  /** Name shown in the language itself, e.g. "हिन्दी". */
  nativeName: string;
  /** Short helper line shown under the native name. */
  blurb: string;
  /** Emoji icon shown left of the name. */
  icon: string;
  /** Featured locales are pinned to the top with a "suggested" badge. */
  featured?: boolean;
}

/**
 * Language list in display order. Hinglish is first AND featured:
 * early adopters are Indian students, and Hinglish is how they actually speak.
 */
export const LOCALES: LocaleInfo[] = [
  {
    code: 'hi-Latn',
    nativeName: 'Hinglish',
    blurb: 'Hindi + English mix',
    icon: '⭐',
    featured: true,
  },
  { code: 'en', nativeName: 'English', blurb: 'Default', icon: '🌐' },
  { code: 'hi', nativeName: 'हिन्दी', blurb: 'Hindi (Devanagari)', icon: '🇮🇳' },
  { code: 'es', nativeName: 'Español', blurb: 'Spanish', icon: '🇪🇸' },
  { code: 'fr', nativeName: 'Français', blurb: 'French', icon: '🇫🇷' },
  { code: 'de', nativeName: 'Deutsch', blurb: 'German', icon: '🇩🇪' },
];

const LOCALE_KEY = 'locale';
const LANGUAGE_CHOSEN_KEY = 'languageChosen';

type LocaleChangeListener = (locale: LocaleCode) => void;
const listeners = new Set<LocaleChangeListener>();

const supportedCodes = new Set<string>(LOCALES.map((locale) => locale.code));

let currentLocale: LocaleCode = FALLBACK_LOCALE;

/** Returns a valid locale code, or null if the value is unsupported. */
function normalizeLocale(code: unknown): LocaleCode | null {
  return typeof code === 'string' && supportedCodes.has(code) ? (code as LocaleCode) : null;
}

/** All supported languages, featured ones pinned to the top. */
export function getSupportedLocales(): LocaleInfo[] {
  return [...LOCALES].sort((a, b) => Number(b.featured ?? false) - Number(a.featured ?? false));
}

/** Currently active locale. */
export function getLocale(): LocaleCode {
  return currentLocale;
}

/** Registers a listener callback invoked whenever the active locale changes. */
export function onLocaleChange(listener: LocaleChangeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Translates a key into the active (or given) locale.
 * Falls back: requested locale → English → raw key. Supports `{name}` interpolation.
 */
export function t(
  key: TranslationKey,
  vars: Record<string, string | number> = {},
  locale: LocaleCode = currentLocale,
): string {
  const dict = dictionaries[locale];
  const fallback = dictionaries[FALLBACK_LOCALE];
  let template = (dict && dict[key]) || fallback[key] || key;
  for (const [name, value] of Object.entries(vars)) {
    template = template.split(`{${name}}`).join(String(value));
  }
  return template;
}

/** Translates a key into a specific locale — used for the picker's live preview. */
export function previewIn(locale: LocaleCode, key: TranslationKey): string {
  return t(key, {}, locale);
}

/**
 * Picks the locale to start with: stored choice → Hindi browsers get Hinglish → English.
 */
export function detectInitialLocale(): LocaleCode {
  const stored = normalizeLocale(storageGet<string | null>(LOCALE_KEY, null));
  if (stored) return stored;
  try {
    const browserLang = typeof navigator !== 'undefined' ? navigator.language || '' : '';
    if (browserLang.toLowerCase().startsWith('hi')) return 'hi-Latn';
  } catch {
    // navigator unavailable — keep fallback
  }
  return FALLBACK_LOCALE;
}

/** Whether the user has ever explicitly picked a language. */
export function hasChosenLanguage(): boolean {
  return storageGet<boolean>(LANGUAGE_CHOSEN_KEY, false) === true;
}

/** Records that the user explicitly picked a language. */
export function markLanguageChosen(): void {
  storageSet(LANGUAGE_CHOSEN_KEY, true);
}

/** Rewrites every `[data-i18n*]` element under `root` in the active language. */
export function applyTranslations(root: ParentNode = document): void {
  if (typeof document === 'undefined' || !root?.querySelectorAll) return;
  const elements = root.querySelectorAll<HTMLElement>(
    '[data-i18n], [data-i18n-placeholder], [data-i18n-aria-label]',
  );
  elements.forEach((element) => {
    const textKey = element.getAttribute('data-i18n');
    if (textKey) element.textContent = t(textKey as TranslationKey);
    const placeholderKey = element.getAttribute('data-i18n-placeholder');
    if (placeholderKey && 'placeholder' in element) {
      (element as HTMLInputElement).placeholder = t(placeholderKey as TranslationKey);
    }
    const ariaKey = element.getAttribute('data-i18n-aria-label');
    if (ariaKey) element.setAttribute('aria-label', t(ariaKey as TranslationKey));
  });
}

/**
 * Switches the active language, persists it, updates `<html lang>`
 * and re-translates the whole document.
 */
export function setLocale(locale: LocaleCode | string): LocaleCode {
  currentLocale = normalizeLocale(locale) ?? FALLBACK_LOCALE;
  storageSet(LOCALE_KEY, currentLocale);
  try {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('lang', currentLocale);
    }
  } catch {
    // document unavailable (tests, SSR) — ignore
  }
  applyTranslations();
  listeners.forEach((listener) => {
    try {
      listener(currentLocale);
    } catch (e) {
      console.error('Error in locale change listener:', e);
    }
  });
  return currentLocale;
}

/** Initializes i18n once at app start: restores the locale and translates the DOM. */
export function initI18n(): void {
  currentLocale = detectInitialLocale();
  storageSet(LOCALE_KEY, currentLocale);
  try {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('lang', currentLocale);
    }
  } catch {
    // ignore
  }
  applyTranslations();
}
