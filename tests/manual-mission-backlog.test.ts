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

function resetEnv(profileOverrides: Record<string, unknown> = {}): void {
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
      ...profileOverrides,
    }),
  );
  localStorage.setItem('nf_hasCompletedInitialBacklogSetup', JSON.stringify(true));
}

function clickFocusTab(): void {
  document.querySelector<HTMLElement>('[data-tab="focus"]')?.click();
}

function openManualMissionSetup(): void {
  // Empty backlog → planner shows the "Create manual mission" CTA.
  document.querySelector<HTMLButtonElement>('#mission-manual-btn')?.click();
}

function setMissionDurations(total: string, block: string): void {
  document.querySelector<HTMLInputElement>('#mission-total')!.value = total;
  document.querySelector<HTMLInputElement>('#mission-block')!.value = block;
}

function confirmMission(): void {
  document.querySelector<HTMLButtonElement>('#mission-confirm-btn')?.click();
}

describe('Manual mission → chapter → backlog auto-link', () => {
  beforeEach(() => resetEnv());
  afterEach(() => vi.useRealTimers());

  it('creates a backlog row for the chosen chapter and links the mission to it', async () => {
    await loadApp();
    clickFocusTab();
    openManualMissionSetup();

    // Chapter picker is visible with NCERT options for the default subject.
    const chapterField = document.querySelector<HTMLElement>('#mission-chapter-field');
    expect(chapterField?.classList.contains('hidden')).toBe(false);
    const chapterSelect = document.querySelector<HTMLSelectElement>('#mission-chapter')!;
    const values = Array.from(chapterSelect.options).map((o) => o.value);
    expect(values).toContain('ncert10-science-11'); // Electricity

    // Choosing a chapter auto-fills the mission title.
    chapterSelect.value = 'ncert10-science-11';
    chapterSelect.dispatchEvent(new Event('change'));
    expect(document.querySelector<HTMLInputElement>('#mission-title')?.value).toBe('Electricity');

    setMissionDurations('60', '25');
    confirmMission();

    // A backlog row for the chapter exists and the mission points at it.
    const { getBacklogs } = await import('../src/modules/backlogs.ts');
    const { getActiveMission } = await import('../src/modules/mission.ts');
    const backlogs = getBacklogs();
    expect(backlogs.length).toBe(1);
    expect(backlogs[0].chapterId).toBe('ncert10-science-11');
    expect(backlogs[0].chapterName).toBe('Electricity');
    expect(backlogs[0].subject).toBe('Physics');
    expect(backlogs[0].total).toBe(1);
    expect(backlogs[0].done).toBe(0);
    expect(getActiveMission()?.backlogId).toBe(backlogs[0].id);
  });

  it('completing the linked manual mission crushes exactly one lecture in the backlog', async () => {
    await loadApp();
    clickFocusTab();
    openManualMissionSetup();

    const chapterSelect = document.querySelector<HTMLSelectElement>('#mission-chapter')!;
    chapterSelect.value = 'ncert10-science-11';
    chapterSelect.dispatchEvent(new Event('change'));
    setMissionDurations('60', '25');
    confirmMission();

    const { getBacklogs } = await import('../src/modules/backlogs.ts');
    const { getActiveMission, isMissionComplete, completeCurrentBlock } = await import(
      '../src/modules/mission.ts'
    );

    let guard = 0;
    while (getActiveMission() && !isMissionComplete() && guard < 10) {
      completeCurrentBlock({ sessionId: Date.now() + guard });
      guard += 1;
    }
    expect(isMissionComplete()).toBe(true);

    const after = getBacklogs()[0];
    expect(after.done).toBe(1);
    expect(Math.max(0, after.total - after.done)).toBe(0);
  });

  it('links to an existing backlog row without duplicating or inflating it', async () => {
    const { addBacklog } = await import('../src/modules/backlogs.ts');
    const added = addBacklog({
      name: 'Physics — Electricity',
      count: 3,
      subject: 'Physics',
      subjectLabel: 'Physics',
      chapterId: 'ncert10-science-11',
      chapterName: 'Electricity',
      bookId: 'ncert10-science',
      bookName: 'Science',
      unitName: 'Physics',
      source: 'ncert-class10',
      createdFrom: 'manual',
    });
    expect(added.success).toBe(true);

    await loadApp();
    clickFocusTab();
    // A pending backlog exists → recommendation card shows "Create manual".
    document.querySelector<HTMLButtonElement>('#mission-create-btn')?.click();

    const chapterSelect = document.querySelector<HTMLSelectElement>('#mission-chapter')!;
    chapterSelect.value = 'ncert10-science-11';
    chapterSelect.dispatchEvent(new Event('change'));
    setMissionDurations('60', '25');
    confirmMission();

    const { getBacklogs, getActiveMission } = await import('../src/modules/backlogs.ts');
    const missionModule = await import('../src/modules/mission.ts');
    const backlogs = getBacklogs();
    expect(backlogs.length).toBe(1);
    expect(backlogs[0].total).toBe(3); // not inflated
    expect(missionModule.getActiveMission()?.backlogId).toBe(backlogs[0].id);
  });

  it('hides the chapter picker and keeps missions unlinked outside NCERT mode', async () => {
    resetEnv({ country: 'USA', syllabusPackId: 'manual' });
    await loadApp();
    clickFocusTab();
    openManualMissionSetup();

    const chapterField = document.querySelector<HTMLElement>('#mission-chapter-field');
    expect(chapterField?.classList.contains('hidden')).toBe(true);

    document.querySelector<HTMLInputElement>('#mission-title')!.value = 'Revision round';
    setMissionDurations('60', '25');
    confirmMission();

    const { getBacklogs } = await import('../src/modules/backlogs.ts');
    const { getActiveMission } = await import('../src/modules/mission.ts');
    expect(getBacklogs().length).toBe(0);
    expect(getActiveMission()?.backlogId).toBeNull();
  });
});
