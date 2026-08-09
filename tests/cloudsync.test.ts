import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  let cloudRow: {
    app_data: Record<string, unknown>;
    updated_at: string;
  } | null = {
    app_data: {
      xp: 777,
      profileName: 'CloudUser',
      badgesUnlocked: ['rank_9'],
      habits: [],
      backlogs: [
        {
          id: 1,
          name: 'Physics — Motion',
          total: 10,
          done: 3,
          subject: 'Physics',
        },
      ],
      battle: [],
      hasOnboarded: true,
    },
    updated_at: '2026-07-25T00:00:00Z',
  };

  const upsertMock = vi.fn(async (row: { app_data: Record<string, unknown>; updated_at: string }) => {
    cloudRow = {
      app_data: row.app_data,
      updated_at: row.updated_at || new Date().toISOString(),
    };
    return { error: null };
  });

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
        eq: () => ({
          maybeSingle: async () => ({ data: cloudRow, error: null }),
        }),
      }),
      upsert: upsertMock,
    })),
  };
  return { fakeSupabase, upsertMock, getCloud: () => cloudRow, setCloud: (v: typeof cloudRow) => {
    cloudRow = v;
  } };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => hoisted.fakeSupabase) }));
vi.stubEnv('VITE_SUPABASE_URL', 'https://zgrwthwfbjzpwngfazwc.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-anon-key');

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
  hoisted.setCloud({
    app_data: {
      xp: 777,
      profileName: 'CloudUser',
      badgesUnlocked: ['rank_9'],
      habits: [],
      backlogs: [
        {
          id: 1,
          name: 'Physics — Motion',
          total: 10,
          done: 3,
          subject: 'Physics',
        },
      ],
      battle: [],
      hasOnboarded: true,
    },
    updated_at: '2026-07-25T00:00:00Z',
  });
  hoisted.upsertMock.mockClear();
});

describe('cloudSync.syncOnLogin (cloud restore)', () => {
  it('restores cloud data into the in-memory store when choosing cloud', async () => {
    const { data } = await import('../src/modules/data.ts');
    const { currentUser, rememberUser } = await import('../src/modules/auth.ts');
    const { syncOnLogin } = await import('../src/modules/cloudSync.ts');

    rememberUser({
      id: 'u1',
      email: 'a@b.c',
      email_confirmed_at: '2026-01-01T00:00:00Z',
    } as never);
    data.xp = 0;
    data.profileName = 'Local';
    data.badgesUnlocked = [];
    data.backlogs = [];

    const result = await syncOnLogin('cloud');
    expect(result.kind).toBe('restored');
    expect(data.xp).toBe(777);
    expect(data.profileName).toBe('CloudUser');
    expect(data.badgesUnlocked).toEqual(['rank_9']);
    expect(data.backlogs.length).toBe(1);
    expect(currentUser()?.id).toBe('u1');
  });

  it('auto-restores richer cloud data on a fresh/empty device (no choice needed)', async () => {
    const { data } = await import('../src/modules/data.ts');
    const { rememberUser } = await import('../src/modules/auth.ts');
    const { syncOnLogin } = await import('../src/modules/cloudSync.ts');
    const { set } = await import('../src/modules/storage.ts');

    rememberUser({
      id: 'u1',
      email: 'a@b.c',
      email_confirmed_at: '2026-01-01T00:00:00Z',
    } as never);
    // Simulate phone with almost no local progress.
    data.xp = 0;
    data.backlogs = [];
    data.habits = [];
    data.badgesUnlocked = [];
    data.profileName = 'Warrior';
    set('xp', 0);
    set('backlogs', []);
    set('habits', []);
    set('badgesUnlocked', []);

    const result = await syncOnLogin(); // no explicit choice
    expect(['restored', 'merged']).toContain(result.kind);
    expect(data.xp).toBe(777);
    expect(data.backlogs.length).toBe(1);
  });

  it('smartMerge keeps backlog rows from both devices instead of wiping one side', async () => {
    const { smartMerge, progressScore } = await import('../src/modules/cloudSync.ts');
    const cloud = {
      xp: 100,
      backlogs: [{ id: 1, name: 'A', total: 5, done: 1, subject: 'Physics' }],
    };
    const local = {
      xp: 150,
      backlogs: [{ id: 2, name: 'B', total: 3, done: 0, subject: 'Math' }],
    };
    const merged = smartMerge(cloud, local);
    expect(merged.xp).toBe(150);
    expect((merged.backlogs as unknown[]).length).toBe(2);
    expect(progressScore(merged)).toBeGreaterThan(progressScore(cloud));
  });

  it('uploads local progress when cloud is empty', async () => {
    hoisted.setCloud(null);
    const { data } = await import('../src/modules/data.ts');
    const { rememberUser } = await import('../src/modules/auth.ts');
    const { syncOnLogin } = await import('../src/modules/cloudSync.ts');
    const { set } = await import('../src/modules/storage.ts');

    rememberUser({
      id: 'u1',
      email: 'a@b.c',
      email_confirmed_at: '2026-01-01T00:00:00Z',
    } as never);
    data.xp = 42;
    data.backlogs = [{ id: 9, name: 'Local only', total: 2, done: 0, subject: 'Other' }] as never;
    set('xp', 42);
    set('backlogs', data.backlogs);

    const result = await syncOnLogin();
    expect(result.kind).toBe('uploaded');
    expect(hoisted.upsertMock).toHaveBeenCalled();
    const cloud = hoisted.getCloud();
    expect(cloud?.app_data.xp).toBe(42);
  });
});
