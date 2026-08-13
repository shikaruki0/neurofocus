/**
 * REGRESSION — Daily quest "Clear 2 backlog lectures" completes after a single
 * 25-minute focus block, even though the linked mission (4 × 25 min) is far
 * from finished.
 *
 * Guards the fix:
 *  A) The quest's check counts LIFETIME backlog completions (`b.done` summed
 *     over all backlogs) instead of TODAY's completions (`backlogsToday`), so
 *     it auto-completes forever once ≥2 lectures were ever cleared.
 *  B) A single 25-min session itself double-increments the backlog.
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

function resetEnv(): void {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = body;
  localStorage.clear();
  localStorage.setItem('nf_hasOnboarded', JSON.stringify(true));
  localStorage.setItem('nf_profileName', JSON.stringify('Aarav'));
  localStorage.setItem('nf_languageChosen', JSON.stringify(true));
  localStorage.setItem(
    'nf_studentProfile',
    JSON.stringify({
      name: 'Aarav',
      country: 'India',
      classLevel: 10,
      board: 'CBSE',
      syllabusPackId: 'india-ncert-class-10',
    }),
  );
  localStorage.setItem('nf_hasCompletedInitialBacklogSetup', JSON.stringify(true));
}

/** Forces the backlog quest into today's quest pool so tests are deterministic. */
function forceBacklogQuest(): void {
  const { data } = dataModule;
  data.dailyQuests = {
    date: todayStr(),
    quests: [{ id: 'q_backlog', label: 'Clear 2 backlog lectures', reward: 25, completed: false }],
  };
}

let dataModule: typeof import('../src/modules/data.ts');
let todayStr: () => string;

describe('daily quest backlog loophole', () => {
  beforeEach(async () => {
    resetEnv();
    dataModule = await import('../src/modules/data.ts');
    ({ todayStr } = await import('../src/utils/date.ts'));
  });
  afterEach(() => vi.useRealTimers());

  it('Hypothesis B: one 25-min block of a 100-min mission must NOT touch backlog at all', async () => {
    const { addBacklog, getBacklogs } = await import('../src/modules/backlogs.ts');
    addBacklog({ name: 'Physics Lecture 100min', count: 1, subject: 'Physics' });

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T13:00:00Z'));
    await loadApp();

    // Start a 100 min / 25 min block mission linked to the backlog (4 blocks).
    document.querySelector<HTMLElement>('[data-tab="focus"]')?.click();
    document.querySelector<HTMLButtonElement>('#mission-use-btn')?.click();
    document.querySelector<HTMLInputElement>('#mission-total')!.value = '100';
    document.querySelector<HTMLInputElement>('#mission-block')!.value = '25';
    document.querySelector<HTMLButtonElement>('#mission-confirm-btn')!.click();

    // Do exactly ONE 25-minute focus session.
    const focusBtn = document.querySelector<HTMLButtonElement>('#focus-btn')!;
    focusBtn.click();
    document.querySelector<HTMLButtonElement>('#focus-immersive-exit-btn')?.click();
    vi.advanceTimersByTime(25 * 60 * 1000);

    const bl = getBacklogs()[0];
    expect(bl.done).toBe(0); // 1 block of 4 → lecture NOT cleared
    expect(bl.total).toBe(1);
  }, 20000);

  it('Hypothesis A: quest completes with ZERO work today (the loophole)', async () => {
    const { checkQuests, getQuests } = await import('../src/modules/quests.ts');
    const { addBacklog } = await import('../src/modules/backlogs.ts');

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T13:00:00Z'));

    // Simulate lifetime history: 2 lectures cleared on previous days.
    addBacklog({ name: 'Old lecture A', count: 1, subject: 'Physics' });
    addBacklog({ name: 'Old lecture B', count: 1, subject: 'Math' });
    dataModule.data.backlogs[0].done = 1;
    dataModule.data.backlogs[1].done = 1;

    await loadApp();
    forceBacklogQuest();

    // Zero work today — no sessions, no backlog increments.
    expect(dataModule.data.backlogsToday).toBe(0);
    expect(dataModule.data.sessions.length).toBe(0);

    const newlyDone = checkQuests();
    const q = getQuests().find((x) => x.id === 'q_backlog');
    expect(q?.completed).toBe(false); // ← fixme: today nothing was cleared
    expect(newlyDone.some((x) => x.id === 'q_backlog')).toBe(false);
  }, 20000);

  it('Full user story: 1 session + 2 lifetime lectures → quest claims 2 done', async () => {
    const { addBacklog, getBacklogs } = await import('../src/modules/backlogs.ts');

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T13:00:00Z'));

    // Past activity: user already cleared 2 lectures via previous missions.
    addBacklog({ name: 'Physics Lecture', count: 3, subject: 'Physics' });
    dataModule.data.backlogs[0].done = 2;

    await loadApp();
    forceBacklogQuest();

    // New mission for the remaining lecture: 100 min → 4 × 25 min.
    document.querySelector<HTMLElement>('[data-tab="focus"]')?.click();
    document.querySelector<HTMLButtonElement>('#mission-use-btn')?.click();
    document.querySelector<HTMLInputElement>('#mission-total')!.value = '100';
    document.querySelector<HTMLInputElement>('#mission-block')!.value = '25';
    document.querySelector<HTMLButtonElement>('#mission-confirm-btn')!.click();

    // Today: exactly ONE 25-min session (block 1 of 4).
    const focusBtn = document.querySelector<HTMLButtonElement>('#focus-btn')!;
    focusBtn.click();
    document.querySelector<HTMLButtonElement>('#focus-immersive-exit-btn')?.click();
    vi.advanceTimersByTime(25 * 60 * 1000);

    expect(getBacklogs()[0].done).toBe(2); // lecture still NOT cleared today
    expect(dataModule.data.backlogsToday).toBe(0); // zero backlog completions today

    const q = (await import('../src/modules/quests.ts'))
      .getQuests()
      .find((x) => x.id === 'q_backlog');
    // The quest "Clear 2 backlog lectures" should NOT be done — the user did not
    // clear 2 lectures today.
    expect(q?.completed).toBe(false);
  }, 20000);
});
