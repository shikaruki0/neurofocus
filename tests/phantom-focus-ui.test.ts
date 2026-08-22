/**
 * End-to-end (DOM) proof for the "app says I studied when I didn't" bug.
 *
 * Boots the real app against the real index.html and asserts that the Home tab's
 * focus tile and the "Today's Focus" panel always tell the same story.
 */

import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  fakeSupabase: {
    auth: {
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: () => undefined } },
      })),
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      resend: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      upsert: async () => ({ error: null }),
    })),
  },
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => hoisted.fakeSupabase) }));

vi.stubEnv('VITE_SUPABASE_URL', 'https://zgrwthwfbjzpwngfazwc.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-anon-key');

const html = readFileSync('index.html', 'utf8');
const bodyMatch = html.match(/<body>([\s\S]*)<\/body>/);
const body = bodyMatch ? bodyMatch[1] : '';

async function loadApp(): Promise<void> {
  (window as unknown as { scrollTo: () => void }).scrollTo = () => undefined;
  await import('../src/main.ts');
}

function homeFocusText(): string {
  return document.querySelector<HTMLElement>('#d-focus')?.textContent?.trim() ?? '';
}

function historyTotalText(): string {
  return document.querySelector<HTMLElement>('#focus-history-total')?.textContent?.trim() ?? '';
}

function historyRowCount(): number {
  return document.querySelectorAll('#focus-history .focus-history-item').length;
}

describe('Home focus tile vs Today\u2019s Focus panel', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useRealTimers();
    document.body.innerHTML = body;
    localStorage.clear();
    localStorage.setItem('nf_hasOnboarded', JSON.stringify(true));
    localStorage.setItem('nf_profileName', JSON.stringify('Aarav'));
    localStorage.setItem('nf_languageChosen', JSON.stringify(true));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows 0 study hours when a leftover counter claims minutes but no session exists', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T13:00:00'));
    // The reported bad state: minutes on record, empty session log.
    localStorage.setItem('nf_focusMinutes', JSON.stringify(120));
    localStorage.setItem('nf_focusDate', JSON.stringify(new Date().toDateString()));
    localStorage.setItem('nf_sessions', JSON.stringify([]));

    await loadApp();

    expect(homeFocusText()).toBe('0.0h');
    expect(historyTotalText()).toBe('0 min');
    expect(historyRowCount()).toBe(0);
    // The bad value is healed on disk too, so it cannot come back on reload.
    expect(JSON.parse(localStorage.getItem('nf_focusMinutes') || '-1')).toBe(0);
  });

  it('shows matching hours on both surfaces when real sessions exist', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T13:00:00'));
    const now = Date.now();
    localStorage.setItem('nf_focusMinutes', JSON.stringify(0));
    localStorage.setItem(
      'nf_sessions',
      JSON.stringify([
        { date: new Date(now - 7_200_000).toDateString(), time: now - 7_200_000, duration: 25 },
        { date: new Date(now - 3_600_000).toDateString(), time: now - 3_600_000, duration: 65 },
      ]),
    );

    await loadApp();

    // 90 minutes = 1.5 hours on Home, 90 min in the panel, 2 rows listed.
    expect(homeFocusText()).toBe('1.5h');
    expect(historyTotalText()).toBe('90 min');
    expect(historyRowCount()).toBe(2);
  });

  it('does not carry yesterday\u2019s minutes into today', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T09:00:00'));
    const yesterday = new Date('2026-07-29T20:00:00').getTime();
    localStorage.setItem('nf_focusMinutes', JSON.stringify(90));
    localStorage.setItem('nf_focusDate', JSON.stringify('Wed Jul 29 2026'));
    localStorage.setItem(
      'nf_sessions',
      JSON.stringify([{ date: new Date(yesterday).toDateString(), time: yesterday, duration: 90 }]),
    );

    await loadApp();

    expect(homeFocusText()).toBe('0.0h');
    expect(historyTotalText()).toBe('0 min');
    // Yesterday's record still exists — history is never destroyed.
    const stored = JSON.parse(localStorage.getItem('nf_sessions') || '[]');
    expect(stored).toHaveLength(1);
  });

  it('keeps both surfaces at zero after "Reset today" clears a real session', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T13:00:00'));
    const now = Date.now();
    localStorage.setItem(
      'nf_sessions',
      JSON.stringify([{ date: new Date(now).toDateString(), time: now, duration: 50 }]),
    );

    await loadApp();
    expect(homeFocusText()).toBe('0.8h');
    expect(historyRowCount()).toBe(1);

    // "Reset today" now asks through the branded in-app confirm dialog instead
    // of a native confirm(). Click the dialog's affirmative button to proceed.
    document.querySelector<HTMLButtonElement>('#reset-today-btn')!.click();
    const confirmBtn = document.querySelector<HTMLButtonElement>('.nf-confirm-confirm-btn');
    expect(confirmBtn).not.toBeNull();
    confirmBtn!.click();
    // Flush the async click handler's microtasks so the reset completes.
    await Promise.resolve();
    await Promise.resolve();

    expect(homeFocusText()).toBe('0.0h');
    expect(historyTotalText()).toBe('0 min');
    expect(historyRowCount()).toBe(0);
  });
});
