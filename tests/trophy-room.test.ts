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

/** Seeds onboarding/local settings so the app renders the dashboard directly. */
function seedLocal() {
  localStorage.setItem('nf_hasOnboarded', JSON.stringify(true));
  localStorage.setItem('nf_profileName', JSON.stringify('Aarav'));
  localStorage.setItem('nf_languageChosen', JSON.stringify(true));
}

function openTrophy() {
  const preview = document.querySelector<HTMLElement>('#trophy-preview');
  if (!preview) throw new Error('#trophy-preview missing');
  preview.click();
}

describe('Trophy Room — modal wiring', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useRealTimers();
    document.body.innerHTML = body;
    localStorage.clear();
    seedLocal();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('trophy preview opens the modal', async () => {
    await loadApp();
    const overlay = document.querySelector<HTMLElement>('#trophy-overlay')!;
    expect(overlay.classList.contains('show')).toBe(false);
    openTrophy();
    expect(overlay.classList.contains('show')).toBe(true);
    // Dialog semantics are applied for assistive tech
    expect(overlay.getAttribute('role')).toBe('dialog');
    expect(overlay.getAttribute('aria-modal')).toBe('true');
    expect(overlay.getAttribute('aria-labelledby')).toBeTruthy();
  });

  it('trophy count renders with the expected denominator', async () => {
    await loadApp();
    openTrophy();
    const count = document.querySelector<HTMLElement>('#trophy-count')!;
    expect(count.textContent).toMatch(/\/ 35$/);
  });

  it('current rank renders', async () => {
    await loadApp();
    openTrophy();
    expect(document.querySelector<HTMLElement>('#trophy-rank-name')!.textContent).toBe('Initiate');
    expect(document.querySelector<HTMLElement>('#trophy-rank-icon')!.textContent).toBe('🌱');
    expect(document.querySelector<HTMLElement>('#trophy-rank-tier')!.textContent).toBe(
      'Rank · Common',
    );
    // Next rank info is populated
    expect(document.querySelector<HTMLElement>('#trophy-rank-next')!.textContent).toContain(
      'Apprentice',
    );
  });

  it('renders all rank and special badges', async () => {
    await loadApp();
    openTrophy();
    const badges = document.querySelectorAll<HTMLElement>('#trophy-badges .badge-item');
    expect(badges.length).toBe(35);
    // First category is rank tiers (21), second is special (14)
    expect(badges[0].querySelector('.badge-name')!.textContent).toBe('Initiate');
  });

  it('renders locked and unlocked states', async () => {
    // Seed a few unlocked badges
    localStorage.setItem(
      'nf_badgesUnlocked',
      JSON.stringify(['rank_0', 'rank_5', 'first_focus', 'detox_3']),
    );
    await loadApp();
    openTrophy();
    const unlocked = document.querySelectorAll<HTMLElement>('#trophy-badges .badge-item.unlocked');
    const locked = document.querySelectorAll<HTMLElement>('#trophy-badges .badge-item.locked');
    expect(unlocked.length).toBeGreaterThan(0);
    expect(locked.length).toBeGreaterThan(0);
    expect(document.querySelector<HTMLElement>('#trophy-count')!.textContent).toBe('4 / 35');
    // Locked rank badges carry a progress rail
    const lockedWithRail = document.querySelectorAll<HTMLElement>(
      '#trophy-badges .badge-item.locked .progress-track',
    );
    expect(lockedWithRail.length).toBeGreaterThan(0);
  });

  it('close button closes the modal', async () => {
    await loadApp();
    openTrophy();
    const overlay = document.querySelector<HTMLElement>('#trophy-overlay')!;
    expect(overlay.classList.contains('show')).toBe(true);
    document.querySelector<HTMLElement>('#trophy-close-btn')!.click();
    expect(overlay.classList.contains('show')).toBe(false);
  });

  it('backdrop click closes the modal', async () => {
    await loadApp();
    openTrophy();
    const overlay = document.querySelector<HTMLElement>('#trophy-overlay')!;
    expect(overlay.classList.contains('show')).toBe(true);
    // jsdom click sets target === currentTarget for a bare element click
    overlay.click();
    expect(overlay.classList.contains('show')).toBe(false);
  });

  it('Escape key closes the modal', async () => {
    await loadApp();
    openTrophy();
    const overlay = document.querySelector<HTMLElement>('#trophy-overlay')!;
    expect(overlay.classList.contains('show')).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(overlay.classList.contains('show')).toBe(false);
  });

  it('does not duplicate content or listeners when opened repeatedly', async () => {
    await loadApp();
    openTrophy();
    openTrophy();
    const badges = document.querySelectorAll<HTMLElement>('#trophy-badges .badge-item');
    expect(badges.length).toBe(35);
    // Close still works after multiple opens
    document.querySelector<HTMLElement>('#trophy-close-btn')!.click();
    const overlay = document.querySelector<HTMLElement>('#trophy-overlay')!;
    expect(overlay.classList.contains('show')).toBe(false);
    // Re-open and close again — no duplicate listeners
    openTrophy();
    expect(overlay.classList.contains('show')).toBe(true);
    document.querySelector<HTMLElement>('#trophy-close-btn')!.click();
    expect(overlay.classList.contains('show')).toBe(false);
  });

  it('data persists across reload and existing badges do not disappear', async () => {
    localStorage.setItem(
      'nf_badgesUnlocked',
      JSON.stringify(['rank_0', 'rank_5', 'first_focus', 'detox_3', 'focus_10']),
    );
    await loadApp();
    openTrophy();
    expect(document.querySelector<HTMLElement>('#trophy-count')!.textContent).toBe('5 / 35');

    // Simulate a reload
    vi.resetModules();
    document.body.innerHTML = body;
    await import('../src/main.ts');

    openTrophy();
    expect(document.querySelector<HTMLElement>('#trophy-count')!.textContent).toBe('5 / 35');
    const names = Array.from(
      document.querySelectorAll<HTMLElement>('#trophy-badges .badge-item .badge-name'),
    ).map((el) => el.textContent);
    expect(names).toContain('Initiate');
    expect(names).toContain('Apprentice');
    expect(names).toContain('First Dive');
  });
});

describe('Trophy Room — robustness', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useRealTimers();
    document.body.innerHTML = body;
    localStorage.clear();
    seedLocal();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('theme switching does not break the modal', async () => {
    await loadApp();
    const lightBtn = document.querySelector<HTMLElement>('[data-theme="light"]');
    expect(lightBtn).toBeTruthy();
    lightBtn!.click();
    openTrophy();
    expect(document.querySelectorAll<HTMLElement>('#trophy-badges .badge-item').length).toBe(35);
    expect(document.querySelector<HTMLElement>('#trophy-count')!.textContent).toMatch(/\/ 35$/);
  });

  it('language switching does not break the modal', async () => {
    await loadApp();
    const hiBtn = document.querySelector<HTMLElement>('[data-locale="hi"]');
    expect(hiBtn).toBeTruthy();
    hiBtn!.click();
    openTrophy();
    expect(document.querySelectorAll<HTMLElement>('#trophy-badges .badge-item').length).toBe(35);
    expect(document.querySelector<HTMLElement>('#trophy-count')!.textContent).toMatch(/\/ 35$/);
  });

  it('malicious badge text remains safely escaped', async () => {
    const { SPECIAL_BADGES } = await import('../src/modules/badges.ts');
    const originalName = SPECIAL_BADGES[0].name;
    const malicious = '<img src=x onerror=alert(1)>';
    SPECIAL_BADGES[0].name = malicious;
    try {
      await loadApp();
      openTrophy();
      const inner = document.querySelector<HTMLElement>('#trophy-badges')!.innerHTML;
      expect(inner).toContain('&lt;img src=x onerror=alert(1)&gt;');
      expect(inner).not.toContain('<img src=x onerror');
    } finally {
      SPECIAL_BADGES[0].name = originalName;
    }
  });
});
