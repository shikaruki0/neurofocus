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

function resetEnv(): void {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = body;
  localStorage.clear();
  localStorage.setItem('nf_hasOnboarded', JSON.stringify(true));
  localStorage.setItem('nf_profileName', JSON.stringify('Aarav'));
  localStorage.setItem('nf_languageChosen', JSON.stringify(true));
  // Set academic setup as complete
  localStorage.setItem('nf_studentProfile', JSON.stringify({
      name: 'Aarav',
      country: 'India',
      classLevel: 10,
      board: 'CBSE',
      syllabusPackId: 'india-ncert-class-10'
  }));
  localStorage.setItem('nf_hasCompletedInitialBacklogSetup', JSON.stringify(true));
}

describe('Milestone 3: Mission ↔ Backlog ↔ XP Integration', () => {
  beforeEach(resetEnv);
  afterEach(() => vi.useRealTimers());

  it('Partial block completion does not decrement backlog', async () => {
    const { addBacklog, getBacklogs } = await import('../src/modules/backlogs.ts');
    addBacklog({ name: 'Physics Lecture', count: 3, subject: 'Physics' });

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T13:00:00Z'));
    await loadApp();
    
    document.querySelector<HTMLElement>('[data-tab="focus"]')?.click();
    document.querySelector<HTMLButtonElement>('#mission-use-btn')?.click();
    document.querySelector<HTMLInputElement>('#mission-total')!.value = '60';
    document.querySelector<HTMLInputElement>('#mission-block')!.value = '25';
    document.querySelector<HTMLButtonElement>('#mission-confirm-btn')!.click();

    const focusBtn = document.querySelector<HTMLButtonElement>('#focus-btn')!;
    focusBtn.click();
    document.querySelector<HTMLButtonElement>('#focus-immersive-exit-btn')?.click();
    vi.advanceTimersByTime(25 * 60 * 1000);

    const blAfter = getBacklogs()[0];
    expect(blAfter.done).toBe(0);
  }, 15000);

  it('Full mission completion decrements exactly one lecture and awards XP', async () => {
    const { addBacklog, getBacklogs } = await import('../src/modules/backlogs.ts');
    addBacklog({ name: 'Physics Lecture', count: 3, subject: 'Physics' });

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T13:00:00Z'));
    await loadApp();
    
    const { data } = await import('../src/modules/data.ts');
    const xpBefore = data.xp;
    
    document.querySelector<HTMLElement>('[data-tab="focus"]')?.click();
    document.querySelector<HTMLButtonElement>('#mission-use-btn')?.click();
    document.querySelector<HTMLInputElement>('#mission-total')!.value = '60';
    document.querySelector<HTMLInputElement>('#mission-block')!.value = '25';
    document.querySelector<HTMLButtonElement>('#mission-confirm-btn')!.click();

    // Block 1
    document.querySelector<HTMLButtonElement>('#focus-btn')!.click();
    document.querySelector<HTMLButtonElement>('#focus-immersive-exit-btn')?.click();
    vi.advanceTimersByTime(25 * 60 * 1000);
    
    // Block 2
    document.querySelector<HTMLButtonElement>('#mission-next-block-btn')!.click();
    document.querySelector<HTMLButtonElement>('#focus-immersive-exit-btn')?.click();
    vi.advanceTimersByTime(25 * 60 * 1000);
    
    // Block 3
    document.querySelector<HTMLButtonElement>('#mission-next-block-btn')!.click();
    document.querySelector<HTMLButtonElement>('#focus-immersive-exit-btn')?.click();
    vi.advanceTimersByTime(10 * 60 * 1000);

    const blAfter = getBacklogs()[0];
    expect(blAfter.done).toBe(1);
    expect(data.xp).toBeGreaterThan(xpBefore);
    
    const card = document.querySelector<HTMLElement>('#mission-confirmed-card')!;
    expect(card.textContent).toContain('MISSION COMPLETE');
    expect(card.textContent).toContain('Backlog updated');
    expect(card.textContent).toContain('1 lecture completed');
    
    expect(document.querySelector('#mission-finish-btn')).not.toBeNull();
    expect(document.querySelector('#mission-view-backlog-btn')).not.toBeNull();
    expect(document.querySelector('#mission-dashboard-btn')).not.toBeNull();
  }, 30000);

  it('Multiple lectures decrement correctly across separate missions', async () => {
    const { addBacklog, getBacklogs } = await import('../src/modules/backlogs.ts');
    addBacklog({ name: 'Physics Lecture', count: 3, subject: 'Physics' });

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T13:00:00Z'));
    await loadApp();
    
    for (let i = 0; i < 2; i++) {
        document.querySelector<HTMLElement>('[data-tab="focus"]')?.click();
        document.querySelector<HTMLButtonElement>('#mission-use-btn')?.click();
        document.querySelector<HTMLInputElement>('#mission-total')!.value = '10';
        document.querySelector<HTMLInputElement>('#mission-block')!.value = '10';
        document.querySelector<HTMLButtonElement>('#mission-confirm-btn')!.click();

        document.querySelector<HTMLButtonElement>('#focus-btn')!.click();
        document.querySelector<HTMLButtonElement>('#focus-immersive-exit-btn')?.click();
        vi.advanceTimersByTime(10 * 60 * 1000);
        
        document.querySelector<HTMLButtonElement>('#mission-finish-btn')!.click();
    }

    const blAfter = getBacklogs()[0];
    expect(blAfter.done).toBe(2);
  }, 40000);

  it('Mission resumed and completed later updates backlog correctly', async () => {
    const { addBacklog, getBacklogs } = await import('../src/modules/backlogs.ts');
    addBacklog({ name: 'Physics Lecture', count: 3, subject: 'Physics' });

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T13:00:00Z'));
    await loadApp();
    
    document.querySelector<HTMLElement>('[data-tab="focus"]')?.click();
    document.querySelector<HTMLButtonElement>('#mission-use-btn')?.click();
    document.querySelector<HTMLInputElement>('#mission-total')!.value = '20';
    document.querySelector<HTMLInputElement>('#mission-block')!.value = '10';
    document.querySelector<HTMLButtonElement>('#mission-confirm-btn')!.click();

    // Block 1
    document.querySelector<HTMLButtonElement>('#focus-btn')!.click();
    document.querySelector<HTMLButtonElement>('#focus-immersive-exit-btn')?.click();
    vi.advanceTimersByTime(10 * 60 * 1000);

    // End mission early (Paused)
    document.querySelector<HTMLButtonElement>('#mission-end-btn')!.click();
    expect(getBacklogs()[0].done).toBe(0);
    
    const card = document.querySelector<HTMLElement>('#mission-confirmed-card')!;
    expect(card.textContent).toContain('MISSION PAUSED');
    expect(card.textContent).toContain('1 block remaining');
    expect(card.textContent).toContain('Lecture still pending');

    // Resume
    document.querySelector<HTMLButtonElement>('#mission-resume-btn')!.click();
    
    // Complete Block 2
    document.querySelector<HTMLButtonElement>('#focus-btn')!.click();
    document.querySelector<HTMLButtonElement>('#focus-immersive-exit-btn')?.click();
    vi.advanceTimersByTime(10 * 60 * 1000);

    expect(getBacklogs()[0].done).toBe(1);
  }, 30000);
});
