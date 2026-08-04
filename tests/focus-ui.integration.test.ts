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
    // Exit immersive before the long advancement to keep JSDOM fast
    document.querySelector<HTMLButtonElement>('#focus-immersive-exit-btn')!.click();
    vi.advanceTimersByTime(25 * 60 * 1000);

    expect(focusBtn.textContent?.trim()).toBe('Start');
    expect(state.textContent?.trim()).toBe('Ready to begin');
    expect(ringWrap.classList.contains('running')).toBe(false);
    expect(document.querySelector<HTMLElement>('#focus-timer')?.textContent?.trim()).toBe('25:00');
  }, 10000);
});

describe('Immersive focus mode', () => {
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

  it('opens immersive mode when starting the timer and keeps it usable through pause/resume', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T13:00:00Z'));
    await loadApp();

    const focusBtn = document.querySelector<HTMLButtonElement>('#focus-btn')!;
    const overlay = document.querySelector<HTMLElement>('#focus-immersive-overlay')!;
    const immersiveTimer = document.querySelector<HTMLElement>('#focus-immersive-timer')!;
    const immersivePauseBtn = document.querySelector<HTMLButtonElement>(
      '#focus-immersive-pause-btn',
    )!;
    const immersiveStatus = document.querySelector<HTMLElement>('#focus-immersive-status')!;

    // Start timer
    focusBtn.click();
    expect(overlay.classList.contains('show')).toBe(true);
    expect(immersivePauseBtn.textContent?.trim()).toBe('Pause');
    expect(immersiveStatus.textContent?.trim()).toBe('In flow');

    // Timer should tick down
    vi.advanceTimersByTime(5000);
    expect(immersiveTimer.textContent?.trim()).toBe('24:55');

    // Pause from immersive
    immersivePauseBtn.click();
    expect(immersivePauseBtn.textContent?.trim()).toBe('Start');
    expect(immersiveStatus.textContent?.trim()).toBe('Paused');

    // Resume from immersive
    immersivePauseBtn.click();
    expect(immersivePauseBtn.textContent?.trim()).toBe('Pause');
    expect(immersiveStatus.textContent?.trim()).toBe('In flow');
  });

  it('closes immersive on Escape without resetting the timer', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T13:00:00Z'));
    await loadApp();

    const focusBtn = document.querySelector<HTMLButtonElement>('#focus-btn')!;
    const overlay = document.querySelector<HTMLElement>('#focus-immersive-overlay')!;
    const normalTimer = document.querySelector<HTMLElement>('#focus-timer')!;

    focusBtn.click();
    expect(overlay.classList.contains('show')).toBe(true);

    vi.advanceTimersByTime(10000);
    expect(normalTimer.textContent?.trim()).toBe('24:50');

    // Press Escape
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(overlay.classList.contains('show')).toBe(false);

    // Timer should still be running
    vi.advanceTimersByTime(5000);
    expect(normalTimer.textContent?.trim()).toBe('24:45');
  });

  it('resets timer and returns visual state to initial', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T13:00:00Z'));
    await loadApp();

    const focusBtn = document.querySelector<HTMLButtonElement>('#focus-btn')!;
    const resetBtn = document.querySelector<HTMLButtonElement>('#focus-reset-btn')!;
    const normalTimer = document.querySelector<HTMLElement>('#focus-timer')!;
    const ringWrap = document.querySelector<HTMLElement>('#tab-focus .timer-ring-wrap')!;
    const state = document.querySelector<HTMLElement>('#focus-session-state')!;

    focusBtn.click();
    vi.advanceTimersByTime(10000);
    expect(normalTimer.textContent?.trim()).toBe('24:50');

    resetBtn.click();
    expect(normalTimer.textContent?.trim()).toBe('25:00');
    expect(focusBtn.textContent?.trim()).toBe('Start');
    expect(state.textContent?.trim()).toBe('Ready to begin');
    expect(ringWrap.classList.contains('running')).toBe(false);
  });

  it('switches timer modes and updates immersive correctly', async () => {
    await loadApp();

    const mode52 = document.querySelector<HTMLButtonElement>('#mode-52')!;
    const mode90 = document.querySelector<HTMLButtonElement>('#mode-90')!;
    const focusBtn = document.querySelector<HTMLButtonElement>('#focus-btn')!;
    const immersiveMode = document.querySelector<HTMLElement>('#focus-immersive-mode')!;
    const immersiveTimer = document.querySelector<HTMLElement>('#focus-immersive-timer')!;
    const immersiveXP = document.querySelector<HTMLElement>('#focus-immersive-xp')!;

    mode52.click();
    focusBtn.click();
    expect(immersiveMode.textContent?.trim()).toBe('Deep Work');
    expect(immersiveTimer.textContent?.trim()).toBe('52:00');
    expect(immersiveXP.textContent?.trim()).toBe('+60 XP');

    // Reset and switch to 90
    document.querySelector<HTMLButtonElement>('#focus-immersive-reset-btn')!.click();
    mode90.click();
    focusBtn.click();
    expect(immersiveMode.textContent?.trim()).toBe('Flow State');
    expect(immersiveTimer.textContent?.trim()).toBe('90:00');
    expect(immersiveXP.textContent?.trim()).toBe('+100 XP');
  });

  it('restores a running session after page refresh', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T13:00:00Z'));
    await loadApp();

    const focusBtn = document.querySelector<HTMLButtonElement>('#focus-btn')!;
    focusBtn.click();
    vi.advanceTimersByTime(60_000);

    const saved = localStorage.getItem('nf_focusTimer');
    expect(saved).toBeTruthy();
    const parsed = JSON.parse(saved!);
    expect(parsed.running).toBe(true);

    // Simulate page refresh: reset modules and reload app
    vi.resetModules();
    await import('../src/main.ts');

    const normalTimer = document.querySelector<HTMLElement>('#focus-timer')!;
    const focusBtnAfter = document.querySelector<HTMLButtonElement>('#focus-btn')!;
    expect(focusBtnAfter.textContent?.trim()).toBe('Pause');
    expect(normalTimer.textContent?.trim()).toBe('24:00');
  });

  it('does not overflow horizontally on mobile or desktop', async () => {
    await loadApp();

    const overlay = document.querySelector<HTMLElement>('#focus-immersive-overlay')!;
    const surface = document.querySelector<HTMLElement>('.focus-immersive-surface')!;

    // Verify the overlay and surface have the overflow-prevention classes
    expect(overlay.classList.contains('focus-immersive-overlay')).toBe(true);
    expect(surface.classList.contains('focus-immersive-surface')).toBe(true);

    // Open immersive to verify it renders without error
    document.querySelector<HTMLButtonElement>('#focus-btn')!.click();
    expect(overlay.classList.contains('show')).toBe(true);
    expect(surface.style.overflowX).not.toBe('auto');
  });
});

describe('Custom focus duration', () => {
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

  it('reveals the manual input row when the Custom chip is clicked', async () => {
    await loadApp();

    const customChip = document.querySelector<HTMLButtonElement>('#mode-custom')!;
    const row = document.querySelector<HTMLElement>('#custom-timer-row')!;
    const timer = document.querySelector<HTMLElement>('#focus-timer')!;

    expect(row.classList.contains('hidden')).toBe(true);

    customChip.click();
    expect(row.classList.contains('hidden')).toBe(false);
    // Opening the row alone must not disturb the timer or chip state
    expect(timer.textContent?.trim()).toBe('25:00');
    expect(document.querySelector<HTMLElement>('#mode-25')!.classList.contains('active')).toBe(
      true,
    );
  });

  it('applies a manual duration to the focus timer on Set', async () => {
    await loadApp();

    document.querySelector<HTMLButtonElement>('#mode-custom')!.click();
    const input = document.querySelector<HTMLInputElement>('#custom-timer-minutes')!;
    input.value = '45';
    document.querySelector<HTMLButtonElement>('#custom-timer-set-btn')!.click();

    expect(document.querySelector<HTMLElement>('#focus-timer')!.textContent?.trim()).toBe('45:00');
    expect(document.querySelector<HTMLElement>('#focus-mode-label')!.textContent?.trim()).toBe(
      'Custom',
    );
    expect(document.querySelector<HTMLElement>('#focus-xp-hint')!.textContent?.trim()).toBe(
      '+45 XP',
    );
    expect(document.querySelector<HTMLElement>('#mode-custom')!.classList.contains('active')).toBe(
      true,
    );
    // No preset chip may stay highlighted while a custom block is selected
    expect(document.querySelector<HTMLElement>('#mode-25')!.classList.contains('active')).toBe(
      false,
    );
    expect(input.getAttribute('aria-invalid')).toBeNull();
  });

  it('falls back to the matching preset when the manual duration is 25/52/90', async () => {
    await loadApp();

    document.querySelector<HTMLButtonElement>('#mode-custom')!.click();
    const input = document.querySelector<HTMLInputElement>('#custom-timer-minutes')!;
    input.value = '52';
    document.querySelector<HTMLButtonElement>('#custom-timer-set-btn')!.click();

    expect(document.querySelector<HTMLElement>('#focus-timer')!.textContent?.trim()).toBe('52:00');
    expect(document.querySelector<HTMLElement>('#focus-xp-hint')!.textContent?.trim()).toBe(
      '+60 XP',
    );
    expect(document.querySelector<HTMLElement>('#mode-52')!.classList.contains('active')).toBe(
      true,
    );
    expect(document.querySelector<HTMLElement>('#mode-custom')!.classList.contains('active')).toBe(
      false,
    );
    expect(
      document.querySelector<HTMLElement>('#custom-timer-row')!.classList.contains('hidden'),
    ).toBe(true);
  });

  it('rejects out-of-range durations without changing the timer', async () => {
    await loadApp();

    document.querySelector<HTMLButtonElement>('#mode-custom')!.click();
    const input = document.querySelector<HTMLInputElement>('#custom-timer-minutes')!;
    input.value = '500';
    document.querySelector<HTMLButtonElement>('#custom-timer-set-btn')!.click();

    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(document.querySelector<HTMLElement>('#focus-timer')!.textContent?.trim()).toBe('25:00');
    expect(document.querySelector<HTMLElement>('#mode-custom')!.classList.contains('active')).toBe(
      false,
    );
  });

  it('restores a custom duration session after page refresh', async () => {
    await loadApp();

    document.querySelector<HTMLButtonElement>('#mode-custom')!.click();
    const input = document.querySelector<HTMLInputElement>('#custom-timer-minutes')!;
    input.value = '45';
    document.querySelector<HTMLButtonElement>('#custom-timer-set-btn')!.click();

    // Simulate page refresh: reset modules and reload app
    vi.resetModules();
    await import('../src/main.ts');

    expect(document.querySelector<HTMLElement>('#focus-timer')!.textContent?.trim()).toBe('45:00');
    expect(document.querySelector<HTMLElement>('#focus-mode-label')!.textContent?.trim()).toBe(
      'Custom',
    );
    expect(document.querySelector<HTMLElement>('#mode-custom')!.classList.contains('active')).toBe(
      true,
    );
    expect(
      document.querySelector<HTMLElement>('#custom-timer-row')!.classList.contains('hidden'),
    ).toBe(false);
  });
});
