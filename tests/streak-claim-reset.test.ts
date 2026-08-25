/**
 * REGRESSION — "Reset today" used to reopen a farming loop:
 *
 *   claim streak (+50 XP) → Settings → Reset today → re-check the 7 boxes →
 *   claim again (+50 XP) → repeat forever. At every 7-day streak boundary the
 *   same loop also minted a streak-freeze token per cycle.
 *
 * On top of that, reset regenerated the daily quest pool with every quest
 * un-completed, so quests whose check remained satisfied (e.g. "Claim daily
 * streak" after re-claiming) paid out again.
 *
 * The fix records exactly what a claim credits (`streakClaimToday`) and has
 * reset revoke precisely that, while leaving the day's quest pool intact.
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

const ALL_CHECKS = ['dc1', 'dc2', 'dc3', 'dc4', 'dc5', 'dc6', 'dc7'];

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

let dataModule: typeof import('../src/modules/data.ts');
let todayStr: () => string;

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toDateString();
}

/**
 * Checks the 7 daily boxes the way a user does — clicking the rendered rows.
 * (Writing data.dailyChecks directly leaves #claim-btn DISABLED: jsdom does
 * not dispatch clicks on disabled buttons, and only renderDailyChecks()
 * re-enables it once everything is checked.)
 */
function checkAllDailyBoxes(): void {
  for (const id of ALL_CHECKS) {
    if (!dataModule.data.dailyChecks[id]) {
      document.querySelector<HTMLElement>(`#row-${id}`)?.click();
    }
  }
  expect(ALL_CHECKS.every((id) => !!dataModule.data.dailyChecks[id])).toBe(true);
  expect(document.querySelector<HTMLButtonElement>('#claim-btn')!.disabled).toBe(false);
}

function clickClaim(): void {
  document.querySelector<HTMLButtonElement>('#claim-btn')!.click();
}

async function clickResetToday(): Promise<void> {
  document.querySelector<HTMLButtonElement>('#reset-today-btn')!.click();
  // Let the async handler reach the confirm dialog, then confirm it.
  await vi.waitFor(() => {
    const btn = document.querySelector<HTMLButtonElement>('.nf-confirm-confirm-btn');
    if (!btn) throw new Error('confirm dialog not rendered yet');
    btn.click();
  });
  // Flush the handler continuation after the dialog resolves.
  await Promise.resolve();
}

describe('streak claim → reset today → re-claim cannot farm XP or freezes', () => {
  beforeEach(async () => {
    resetEnv();
    dataModule = await import('../src/modules/data.ts');
    ({ todayStr } = await import('../src/utils/date.ts'));
  });
  afterEach(() => vi.useRealTimers());

  it('claim, reset, re-claim nets one claim of XP and zero freeze farming', async () => {
    // Day 7 boundary: claiming today crosses consecutive streak 6 → 7,
    // which also earns a freeze token — the second farmed resource.
    dataModule.data.consecutiveStreak = 6;
    dataModule.data.lastStreakDate = yesterdayStr();
    dataModule.data.detoxStreak = 6;
    dataModule.data.streakFreezes = 0;

    await loadApp();
    checkAllDailyBoxes(); // rows exist only after the app booted

    // Deterministic pool with quests that cannot complete in this scenario.
    dataModule.data.dailyQuests = {
      date: todayStr(),
      quests: [
        { id: 'q_habit', label: 'Complete 2 habits', reward: 20, completed: false },
        { id: 'q_backlog', label: 'Clear 2 backlog lectures', reward: 25, completed: false },
        { id: 'q_focus', label: 'Complete 1 focus session', reward: 20, completed: false },
      ],
    };

    clickClaim();
    expect(dataModule.data.xp).toBe(50);
    expect(dataModule.data.consecutiveStreak).toBe(7);
    expect(dataModule.data.streakFreezes).toBe(1); // day-7 freeze earned
    expect(dataModule.data.detoxLastDate).toBe(todayStr());

    await clickResetToday();
    // Reset must revoke exactly what the claim credited — not more, not less.
    expect(dataModule.data.xp).toBe(0);
    expect(dataModule.data.streakFreezes).toBe(0);
    expect(dataModule.data.consecutiveStreak).toBe(6);
    expect(dataModule.data.detoxLastDate).toBeNull();

    // Legitimate redo: re-check everything and claim again — exactly one
    // claim's worth comes back (XP and the freeze), never a profit.
    checkAllDailyBoxes();
    clickClaim();
    expect(dataModule.data.xp).toBe(50);
    expect(dataModule.data.consecutiveStreak).toBe(7);
    expect(dataModule.data.streakFreezes).toBe(1);

    // A second reset + claim cycle still nets exactly one claim's worth.
    await clickResetToday();
    expect(dataModule.data.xp).toBe(0);
    expect(dataModule.data.streakFreezes).toBe(0);

    checkAllDailyBoxes();
    clickClaim();
    expect(dataModule.data.xp).toBe(50);
    expect(dataModule.data.streakFreezes).toBe(1);
  });

  it('reset today keeps the quest pool so the streak quest cannot pay out twice', async () => {
    const { data } = dataModule;
    data.consecutiveStreak = 0;
    data.lastStreakDate = yesterdayStr();
    data.detoxStreak = 0;

    await loadApp();
    checkAllDailyBoxes(); // rows exist only after the app booted

    // Force a deterministic pool that includes the streak quest.
    data.dailyQuests = {
      date: todayStr(),
      quests: [
        { id: 'q_streak', label: 'Claim daily streak', reward: 15, completed: false },
        { id: 'q_habit', label: 'Complete 2 habits', reward: 20, completed: false },
        { id: 'q_backlog', label: 'Clear 2 backlog lectures', reward: 25, completed: false },
      ],
    };

    clickClaim(); // +50 claim; checkQuests also completes q_streak (+15)
    const afterFirstClaim = data.xp;
    expect(afterFirstClaim).toBe(65);
    expect(data.dailyQuests.quests[0].completed).toBe(true);

    await clickResetToday();
    expect(data.xp).toBe(15); // claim XP revoked; quest XP was earned once — stays

    // The pool survived the reset with its completion state intact.
    expect(data.dailyQuests.quests[0].completed).toBe(true);

    checkAllDailyBoxes();
    clickClaim(); // re-claim restores the 50 XP but the quest must NOT pay again
    expect(data.xp).toBe(65);
  });
});
