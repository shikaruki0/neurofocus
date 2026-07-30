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

/** Fills the mission setup form and confirms it, producing an active mission. */
function confirmMission(opts: { title: string; total: number; block: number }): void {
  document.querySelector<HTMLInputElement>('#mission-title')!.value = opts.title;
  document.querySelector<HTMLInputElement>('#mission-total')!.value = String(opts.total);
  document.querySelector<HTMLInputElement>('#mission-block')!.value = String(opts.block);
  document.querySelector<HTMLButtonElement>('#mission-confirm-btn')!.click();
}

function resetEnv(): void {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = body;
  localStorage.clear();
  localStorage.setItem('nf_hasOnboarded', JSON.stringify(true));
  localStorage.setItem('nf_profileName', JSON.stringify('Aarav'));
  localStorage.setItem('nf_languageChosen', JSON.stringify(true));
}

describe('Mission ↔ Focus timer integration', () => {
  beforeEach(resetEnv);
  afterEach(() => vi.useRealTimers());

  // 1. Mission start + 2. Current block display
  it('shows the active mission and current block once confirmed', async () => {
    await loadApp();
    confirmMission({ title: 'Complete Ray Optics lecture', total: 60, block: 25 });

    const card = document.querySelector<HTMLElement>('#mission-confirmed-card')!;
    expect(card.classList.contains('hidden')).toBe(false);
    expect(document.querySelector('#mission-confirmed-kicker')?.textContent).toBe('ACTIVE MISSION');
    expect(document.querySelector('#mission-confirmed-title')?.textContent).toBe(
      'Complete Ray Optics lecture',
    );

    const blocks = document.querySelector<HTMLElement>('#mission-confirmed-blocks')!;
    expect(blocks.textContent).toContain('BLOCK 1 OF 3');
    expect(blocks.textContent).toContain('25 minutes');
    expect(blocks.textContent).toContain('0 / 60 minutes completed');
  });

  // Timer start → mission visible, block visible, session state "In flow"
  it('runs the EXISTING focus timer for the mission block and shows In flow', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T13:00:00Z'));
    await loadApp();
    confirmMission({ title: 'Ray Optics', total: 60, block: 25 });

    const focusBtn = document.querySelector<HTMLButtonElement>('#focus-btn')!;
    const state = document.querySelector<HTMLElement>('#focus-session-state')!;
    const timer = document.querySelector<HTMLElement>('#focus-timer')!;

    // Mission block prepared the single existing timer to 25:00.
    expect(timer.textContent?.trim()).toBe('25:00');

    focusBtn.click(); // start existing timer
    expect(focusBtn.textContent?.trim()).toBe('Pause');
    expect(state.textContent?.trim()).toBe('In flow');

    document.querySelector<HTMLButtonElement>('#focus-immersive-exit-btn')!.click();
    vi.advanceTimersByTime(5000);
    expect(timer.textContent?.trim()).toBe('24:55');
    // Mission card still visible during the run.
    expect(
      document.querySelector<HTMLElement>('#mission-confirmed-card')!.classList.contains('hidden'),
    ).toBe(false);
  });

  // 3. Timer pause/resume preserves mission progress + current block
  it('pause preserves mission progress and keeps the current block active', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T13:00:00Z'));
    await loadApp();
    confirmMission({ title: 'Ray Optics', total: 60, block: 25 });

    const focusBtn = document.querySelector<HTMLButtonElement>('#focus-btn')!;
    focusBtn.click();
    document.querySelector<HTMLButtonElement>('#focus-immersive-exit-btn')!.click();
    vi.advanceTimersByTime(10_000);

    focusBtn.click(); // pause
    expect(focusBtn.textContent?.trim()).toBe('Start');
    // Mission still on block 1, still 0 completed.
    const blocks = document.querySelector<HTMLElement>('#mission-confirmed-blocks')!;
    expect(blocks.textContent).toContain('BLOCK 1 OF 3');
    expect(blocks.textContent).toContain('0 / 60 minutes completed');

    focusBtn.click(); // resume
    expect(focusBtn.textContent?.trim()).toBe('Pause');
    vi.advanceTimersByTime(5000);
    // 15s elapsed total → 24:45
    expect(document.querySelector('#focus-timer')?.textContent?.trim()).toBe('24:45');
  });

  // Timer reset → timer resets, mission data preserved
  it('reset returns the timer to the block length without deleting the mission', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T13:00:00Z'));
    await loadApp();
    confirmMission({ title: 'Ray Optics', total: 60, block: 25 });

    const focusBtn = document.querySelector<HTMLButtonElement>('#focus-btn')!;
    focusBtn.click();
    document.querySelector<HTMLButtonElement>('#focus-immersive-exit-btn')!.click();
    vi.advanceTimersByTime(10_000);

    document.querySelector<HTMLButtonElement>('#focus-reset-btn')!.click();
    expect(document.querySelector('#focus-timer')?.textContent?.trim()).toBe('25:00');
    // Mission preserved.
    expect(
      document.querySelector<HTMLElement>('#mission-confirmed-card')!.classList.contains('hidden'),
    ).toBe(false);
    expect(document.querySelector('#mission-confirmed-blocks')?.textContent).toContain(
      'BLOCK 1 OF 3',
    );
  });

  // 4. Block completion + 5. next block does not auto-start + XP behavior
  it('completes a block via the existing timer, awards XP once, and does NOT auto-start next', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T13:00:00Z'));
    await loadApp();
    confirmMission({ title: 'Ray Optics', total: 60, block: 25 });

    const { data } = await import('../src/modules/data.ts');
    const xpBefore = data.xp;
    const sessionsBefore = data.sessions.length;

    const focusBtn = document.querySelector<HTMLButtonElement>('#focus-btn')!;
    focusBtn.click();
    document.querySelector<HTMLButtonElement>('#focus-immersive-exit-btn')!.click();
    vi.advanceTimersByTime(25 * 60 * 1000); // finish block 1

    // Existing focus XP + session behavior fired exactly once.
    expect(data.xp).toBeGreaterThan(xpBefore);
    expect(data.sessions.length).toBe(sessionsBefore + 1);

    const blocks = document.querySelector<HTMLElement>('#mission-confirmed-blocks')!;
    expect(blocks.textContent).toContain('BLOCK COMPLETE');
    expect(blocks.textContent).toContain('25 minutes completed');
    expect(blocks.textContent).toContain('25 / 60 minutes completed');
    // Next block pending — options shown, timer not auto-running.
    expect(document.querySelector('#mission-next-block-btn')).not.toBeNull();
    expect(document.querySelector('#mission-break-btn')).not.toBeNull();
    expect(document.querySelector('#mission-end-btn')).not.toBeNull();
    expect(document.querySelector<HTMLButtonElement>('#focus-btn')!.textContent?.trim()).toBe(
      'Start',
    );
  }, 15000);

  // 6. Start next block manually
  it('manually starts the next block, which runs on the same timer', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T13:00:00Z'));
    await loadApp();
    confirmMission({ title: 'Ray Optics', total: 60, block: 25 });

    const focusBtn = document.querySelector<HTMLButtonElement>('#focus-btn')!;
    focusBtn.click();
    document.querySelector<HTMLButtonElement>('#focus-immersive-exit-btn')!.click();
    vi.advanceTimersByTime(25 * 60 * 1000); // finish block 1

    document.querySelector<HTMLButtonElement>('#mission-next-block-btn')!.click();
    document.querySelector<HTMLButtonElement>('#focus-immersive-exit-btn')!.click();
    expect(document.querySelector('#mission-confirmed-blocks')?.textContent).toContain(
      'BLOCK 2 OF 3',
    );
    expect(document.querySelector('#focus-timer')?.textContent?.trim()).toBe('25:00');
    expect(document.querySelector<HTMLButtonElement>('#focus-btn')!.textContent?.trim()).toBe(
      'Pause',
    );
  }, 15000);

  // 10. Duplicate XP protection across the same block
  it('does not award XP twice for the same block', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T13:00:00Z'));
    await loadApp();
    confirmMission({ title: 'Ray Optics', total: 60, block: 25 });

    const { data } = await import('../src/modules/data.ts');
    const focusBtn = document.querySelector<HTMLButtonElement>('#focus-btn')!;
    focusBtn.click();
    document.querySelector<HTMLButtonElement>('#focus-immersive-exit-btn')!.click();
    vi.advanceTimersByTime(25 * 60 * 1000); // finish block 1

    const xpAfterBlock1 = data.xp;
    const sessionsAfterBlock1 = data.sessions.length;

    // "Take a break" then let time pass — must not re-award the completed block.
    document.querySelector<HTMLButtonElement>('#mission-break-btn')!.click();
    vi.advanceTimersByTime(60_000);
    expect(data.xp).toBe(xpAfterBlock1);
    expect(data.sessions.length).toBe(sessionsAfterBlock1);
  }, 15000);

  // 7. End mission early — preserves progress, does not complete backlog
  it('ends the mission early, preserving completed minutes and not touching backlog', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T13:00:00Z'));
    await loadApp();
    confirmMission({ title: 'Ray Optics', total: 60, block: 25 });

    const focusBtn = document.querySelector<HTMLButtonElement>('#focus-btn')!;
    focusBtn.click();
    document.querySelector<HTMLButtonElement>('#focus-immersive-exit-btn')!.click();
    vi.advanceTimersByTime(25 * 60 * 1000); // finish block 1

    document.querySelector<HTMLButtonElement>('#mission-end-btn')!.click();

    const { getActiveMission } = await import('../src/modules/mission.ts');
    const mission = getActiveMission()!;
    expect(mission.status).toBe('paused');
    expect(mission.completedDuration).toBe(25);
    // Unfinished blocks preserved.
    expect(mission.blocks.filter((b) => b.status === 'pending').length).toBe(2);
    // Card shows a resume option.
    expect(document.querySelector('#mission-resume-btn')).not.toBeNull();
  }, 15000);

  // 8. Mission refresh restore
  it('restores the active mission and completed blocks after a page refresh', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T13:00:00Z'));
    await loadApp();
    confirmMission({ title: 'Ray Optics', total: 60, block: 25 });

    const focusBtn = document.querySelector<HTMLButtonElement>('#focus-btn')!;
    focusBtn.click();
    document.querySelector<HTMLButtonElement>('#focus-immersive-exit-btn')!.click();
    vi.advanceTimersByTime(25 * 60 * 1000); // finish block 1
    document.querySelector<HTMLButtonElement>('#mission-break-btn')!.click();

    // Simulate refresh.
    vi.resetModules();
    await import('../src/main.ts');

    const card = document.querySelector<HTMLElement>('#mission-confirmed-card')!;
    expect(card.classList.contains('hidden')).toBe(false);
    expect(document.querySelector('#mission-confirmed-title')?.textContent).toBe('Ray Optics');
    const blocks = document.querySelector<HTMLElement>('#mission-confirmed-blocks')!;
    expect(blocks.textContent).toContain('25 / 60 minutes completed');
    // Block 1 remains completed after refresh.
    const { getActiveMission } = await import('../src/modules/mission.ts');
    expect(getActiveMission()!.blocks[0].status).toBe('completed');
  }, 15000);

  // Security: mission title is rendered safely (no HTML injection)
  it('renders a malicious mission title safely (escaped, no script node)', async () => {
    await loadApp();
    confirmMission({ title: '<img src=x onerror=alert(1)>', total: 25, block: 25 });

    const titleEl = document.querySelector<HTMLElement>('#mission-confirmed-title')!;
    // textContent holds the raw string; no <img> element is created.
    expect(titleEl.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(titleEl.querySelector('img')).toBeNull();
  });

  // Accessibility: block-completion region is announced via aria-live
  it('marks the mission block region as an aria-live region', async () => {
    await loadApp();
    confirmMission({ title: 'Ray Optics', total: 60, block: 25 });
    const blocks = document.querySelector<HTMLElement>('#mission-confirmed-blocks')!;
    expect(blocks.getAttribute('aria-live')).toBe('polite');
  });

  // Change/clear preserves ability to plan again and does not leave stale timer state
  it('clearing the mission hides the card and returns to the planner', async () => {
    await loadApp();
    confirmMission({ title: 'Ray Optics', total: 60, block: 25 });
    document.querySelector<HTMLButtonElement>('#mission-clear-btn')!.click();
    expect(
      document.querySelector<HTMLElement>('#mission-confirmed-card')!.classList.contains('hidden'),
    ).toBe(true);
    const { getActiveMission } = await import('../src/modules/mission.ts');
    expect(getActiveMission()).toBeNull();
  });
});
