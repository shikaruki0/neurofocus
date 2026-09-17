/**
 * Sync isolation — the cloud row and per-account local caches must stay
 * strictly separated.
 *
 *  1. `accountCache:*` keys hold ANOTHER account's full progress (written by
 *     bindLocalDataToUser on shared devices). They must never be uploaded
 *     into the signed-in account's cloud row, and a cloud row must never be
 *     allowed to seed them locally.
 *  2. Restores apply only known app keys, so a cloud row (or any imported
 *     snapshot) cannot act as an arbitrary write primitive into localStorage.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  let cloudRow: {
    app_data: Record<string, unknown>;
    updated_at: string;
  } | null = null;

  const upsertMock = vi.fn(
    async (row: { app_data: Record<string, unknown>; updated_at: string }) => {
      cloudRow = {
        app_data: row.app_data,
        updated_at: row.updated_at || new Date().toISOString(),
      };
      return { error: null };
    },
  );

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
      delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    })),
  };
  return {
    fakeSupabase,
    upsertMock,
    getCloud: () => cloudRow,
    setCloud: (v: typeof cloudRow) => {
      cloudRow = v;
    },
  };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => hoisted.fakeSupabase) }));
vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-anon-key');

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
  hoisted.setCloud(null);
  hoisted.upsertMock.mockClear();
});

describe('cloudSync account-cache isolation', () => {
  it("never uploads other accounts' local caches into the signed-in account's cloud row", async () => {
    const { rememberUser } = await import('../src/modules/auth.ts');
    const { syncOnLogin } = await import('../src/modules/cloudSync.ts');
    const { set } = await import('../src/modules/storage.ts');

    rememberUser({
      id: 'u-b',
      email: 'b@b.c',
      email_confirmed_at: '2026-01-01T00:00:00Z',
    } as never);

    // Shared device: Account A's cached progress exists in localStorage.
    set('accountCache:u-a', {
      profileName: 'AccountA',
      xp: 500,
      backlogs: [{ id: 1, name: 'A secret', total: 5, done: 0, subject: 'Physics' }],
    });
    // Account B has their own (small) local progress.
    set('xp', 10);
    set('profileName', 'B');

    const result = await syncOnLogin();
    expect(result.kind).toBe('uploaded');

    const uploaded = hoisted.getCloud()?.app_data || {};
    expect(uploaded['accountCache:u-a']).toBeUndefined();
    // No trace of A's private data may reach B's cloud row.
    expect(JSON.stringify(uploaded)).not.toContain('AccountA');
    expect(JSON.stringify(uploaded)).not.toContain('A secret');
    // B's own progress is still uploaded.
    expect(uploaded.xp).toBe(10);
  });

  it('does not apply account-cache or unknown keys when restoring from the cloud row', async () => {
    hoisted.setCloud({
      app_data: {
        xp: 777,
        profileName: 'CloudUser',
        'accountCache:u-evil': { xp: 999, profileName: 'Evil' },
        totallyUnknownKey: '<script>alert(1)</script>',
      },
      updated_at: '2026-07-25T00:00:00Z',
    });

    const { rememberUser } = await import('../src/modules/auth.ts');
    const { syncOnLogin } = await import('../src/modules/cloudSync.ts');
    const { exportAll } = await import('../src/modules/storage.ts');

    rememberUser({
      id: 'u1',
      email: 'a@b.c',
      email_confirmed_at: '2026-01-01T00:00:00Z',
    } as never);

    const result = await syncOnLogin('cloud');
    expect(result.kind).toBe('restored');

    const local = exportAll();
    // Known keys are restored as normal...
    expect(local.xp).toBe(777);
    expect(local.profileName).toBe('CloudUser');
    // ...but nothing unknown or cache-shaped reaches localStorage.
    expect(local['accountCache:u-evil']).toBeUndefined();
    expect(local['totallyUnknownKey']).toBeUndefined();
  });

  it('keeps meta/auth keys out of both the snapshot and the restore', async () => {
    const { rememberUser } = await import('../src/modules/auth.ts');
    const { syncOnLogin } = await import('../src/modules/cloudSync.ts');
    const { set, exportAll } = await import('../src/modules/storage.ts');

    // A hostile row tries to override the signed-in identity and sync bookkeeping.
    hoisted.setCloud({
      app_data: {
        xp: 5,
        authUser: { id: 'attacker', email: 'attacker@evil.example' },
        boundUserId: 'attacker',
        lastCloudPushAt: '1970-01-01T00:00:00Z',
      },
      updated_at: '2026-07-25T00:00:00Z',
    });

    rememberUser({
      id: 'u1',
      email: 'a@b.c',
      email_confirmed_at: '2026-01-01T00:00:00Z',
    } as never);

    await syncOnLogin('cloud');

    const local = exportAll();
    expect(local.authUser).toEqual({
      id: 'u1',
      email: 'a@b.c',
      email_confirmed_at: '2026-01-01T00:00:00Z',
    });
    expect(local.boundUserId).not.toBe('attacker');

    // And the upload path must not send auth/meta keys either.
    hoisted.setCloud(null);
    set('xp', 3);
    await syncOnLogin();
    const uploaded = hoisted.getCloud()?.app_data || {};
    expect(uploaded.authUser).toBeUndefined();
    expect(uploaded.boundUserId).toBeUndefined();
  });
});
