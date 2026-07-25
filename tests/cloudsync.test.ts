import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const cloudData = {
    app_data: {
      xp: 777,
      profileName: 'CloudUser',
      badgesUnlocked: ['rank_9'],
      habits: [],
      backlogs: [],
      battle: [],
      hasOnboarded: true,
    },
    updated_at: '2026-07-25T00:00:00Z',
  };
  const fakeSupabase = {
    auth: {
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: () => undefined } },
      })),
      getUser: vi.fn(async () => ({ data: { user: { id: 'u1', email: 'a@b.c' } }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: cloudData, error: null }) }),
      }),
      upsert: async () => ({ error: null }),
    })),
  };
  return { fakeSupabase };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => hoisted.fakeSupabase) }));
vi.stubEnv('VITE_SUPABASE_URL', 'https://zgrwthwfbjzpwngfazwc.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-anon-key');

beforeEach(() => {
  localStorage.clear();
});

describe('cloudSync.syncOnLogin (cloud restore)', () => {
  it('restores cloud data into the in-memory store when choosing cloud', async () => {
    const { data } = await import('../src/modules/data.ts');
    const { currentUser } = await import('../src/modules/auth.ts');
    const { syncOnLogin } = await import('../src/modules/cloudSync.ts');

    const { rememberUser } = await import('../src/modules/auth.ts');
    rememberUser({ id: 'u1', email: 'a@b.c' } as never);
    data.xp = 0;
    data.profileName = 'Local';
    data.badgesUnlocked = [];

    const result = await syncOnLogin('cloud');
    expect(result.kind).toBe('restored');
    expect(data.xp).toBe(777);
    expect(data.profileName).toBe('CloudUser');
    expect(data.badgesUnlocked).toEqual(['rank_9']);
    expect(currentUser()?.id).toBe('u1');
  });
});
