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

describe('Focus mode UI wiring', () => {
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
  });

  it('updates the live focus state immediately when starting and pausing', async () => {
    await loadApp();

    const focusBtn = document.querySelector<HTMLButtonElement>('#focus-btn')!;
    const ringWrap = document.querySelector<HTMLElement>('#tab-focus .timer-ring-wrap')!;
    const state = document.querySelector<HTMLElement>('#focus-session-state')!;

    expect(focusBtn.textContent?.trim()).toBe('Start');
    expect(state.textContent?.trim()).toBe('Ready to begin');
    expect(ringWrap.classList.contains('running')).toBe(false);

    focusBtn.click();
    expect(focusBtn.textContent?.trim()).toBe('Pause');
    expect(state.textContent?.trim()).toBe('In flow');
    expect(ringWrap.classList.contains('running')).toBe(true);

    focusBtn.click();
    expect(focusBtn.textContent?.trim()).toBe('Start');
    expect(state.textContent?.trim()).toBe('Ready to begin');
    expect(ringWrap.classList.contains('running')).toBe(false);
  });

  it('returns the live focus state to idle after a session completes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T13:00:00Z'));
    await loadApp();

    const focusBtn = document.querySelector<HTMLButtonElement>('#focus-btn')!;
    const ringWrap = document.querySelector<HTMLElement>('#tab-focus .timer-ring-wrap')!;
    const state = document.querySelector<HTMLElement>('#focus-session-state')!;

    focusBtn.click();
    vi.advanceTimersByTime(25 * 60 * 1000);

    expect(focusBtn.textContent?.trim()).toBe('Start');
    expect(state.textContent?.trim()).toBe('Ready to begin');
    expect(ringWrap.classList.contains('running')).toBe(false);
    expect(document.querySelector<HTMLElement>('#focus-timer')?.textContent?.trim()).toBe('25:00');
  });
});
