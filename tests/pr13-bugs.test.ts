import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubEnv('VITE_SUPABASE_URL', 'https://zgrwthwfbjzpwngfazwc.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-anon-key');

beforeEach(() => {
  localStorage.clear();
});

describe('progressImport.applyImport', () => {
  it('applies validated fields to the in-memory data store', async () => {
    const { data } = await import('../src/modules/data.ts');
    const { applyImport } = await import('../src/modules/progressImport.ts');
    data.xp = 0;
    data.profileName = 'Warrior';
    data.badgesUnlocked = [];

    const result = applyImport({
      xp: 750,
      profileName: 'Importer',
      badgesUnlocked: ['rank_1', 'first_focus'],
    });
    expect(result.ok).toBe(true);
    expect(data.xp).toBe(750);
    expect(data.profileName).toBe('Importer');
    expect(data.badgesUnlocked).toEqual(['rank_1', 'first_focus']);
  });

  it('badges persist across a reload (storage key consistency)', async () => {
    const { data, persist } = await import('../src/modules/data.ts');
    const { get } = await import('../src/modules/storage.ts');
    data.badgesUnlocked = ['rank_1', 'first_focus'];
    persist('badgesUnlocked');

    // data.ts reads the same storage key it writes to, so a reload restores badges.
    const reloaded = get('badgesUnlocked', [] as string[]);
    expect(reloaded).toEqual(['rank_1', 'first_focus']);
  });
});
