/**
 * Shared-device account isolation.
 *
 * One phone/laptop, several people. Account A's progress must never reach
 * Account B — not on screen, not in B's cloud row, not through an in-flight
 * sync that finishes after the switch, and not through a backup export.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = { app_data: Record<string, unknown>; updated_at: string };

const hoisted = vi.hoisted(() => {
  const rows = new Map<string, Row>();
  /** When set, the next cloud read waits until the test releases it. */
  let readGate: Promise<void> | null = null;

  const upsertMock = vi.fn(
    async (row: { user_id: string; app_data: Record<string, unknown>; updated_at: string }) => {
      rows.set(row.user_id, {
        app_data: JSON.parse(JSON.stringify(row.app_data)),
        updated_at: row.updated_at,
      });
      return { error: null };
    },
  );

  const fakeSupabase = {
    auth: {
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: () => undefined } },
      })),
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    from: vi.fn(() => ({
      select: () => ({
        eq: (_column: string, userId: string) => ({
          maybeSingle: async () => {
            const gate = readGate;
            readGate = null;
            if (gate) await gate;
            return { data: rows.get(userId) ?? null, error: null };
          },
        }),
      }),
      upsert: upsertMock,
    })),
  };

  return {
    fakeSupabase,
    upsertMock,
    rows,
    holdNextRead(): () => void {
      let release!: () => void;
      readGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return release;
    },
  };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => hoisted.fakeSupabase) }));
vi.stubEnv('VITE_SUPABASE_URL', 'https://zgrwthwfbjzpwngfazwc.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-anon-key');

const userA = { id: 'user-a', email: 'a@example.com', email_confirmed_at: '2026-01-01T00:00:00Z' };
const userB = { id: 'user-b', email: 'b@example.com', email_confirmed_at: '2026-01-01T00:00:00Z' };

async function modules() {
  const auth = await import('../src/modules/auth.ts');
  const sync = await import('../src/modules/cloudSync.ts');
  const storage = await import('../src/modules/storage.ts');
  const { data } = await import('../src/modules/data.ts');
  return { ...auth, ...sync, ...storage, data };
}

/** Signs a user in the way the app does: remember → bind → login sync. */
async function signIn(m: Awaited<ReturnType<typeof modules>>, user: typeof userA) {
  m.rememberUser(user as never);
  m.bindLocalDataToUser(user.id);
  return m.syncOnLogin();
}

/** Signs out the way the app does: flush → forget the user → re-bind to device-only. */
async function signOut(m: Awaited<ReturnType<typeof modules>>) {
  await m.flushCloudSync();
  m.rememberUser(null);
  m.bindLocalDataToUser(null);
}

function giveAccountAProgress(m: Awaited<ReturnType<typeof modules>>) {
  m.data.xp = 900;
  m.data.profileName = 'Alice';
  m.data.backlogs = [{ id: 7, name: 'A private backlog', total: 9, done: 2, subject: 'Physics' }];
  m.set('xp', 900);
  m.set('profileName', 'Alice');
  m.set('backlogs', m.data.backlogs);
}

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
  vi.useRealTimers();
  hoisted.rows.clear();
  hoisted.upsertMock.mockClear();
});

describe('shared device: sign-out → another account', () => {
  it("never uploads Account A's progress into Account B's empty cloud row", async () => {
    const m = await modules();
    await signIn(m, userA);
    giveAccountAProgress(m);
    await signOut(m);

    // A's progress left the screen and is parked in A's device cache.
    expect(m.data.xp).toBe(0);
    expect(m.data.backlogs).toEqual([]);
    expect(m.data.profileName).not.toBe('Alice');
    expect((m.get('accountCache:user-a', {}) as Record<string, unknown>).xp).toBe(900);

    const result = await signIn(m, userB);
    expect(result.kind).toBe('uploaded');

    const rowB = JSON.stringify(hoisted.rows.get('user-b')?.app_data ?? {});
    expect(rowB).not.toContain('Alice');
    expect(rowB).not.toContain('A private backlog');
    expect(hoisted.rows.get('user-b')?.app_data.xp ?? 0).toBe(0);
    // A's own row still has A's progress (flushed on sign-out).
    expect(hoisted.rows.get('user-a')?.app_data.xp).toBe(900);
  });

  it("restores B's own cloud progress without merging A's into it", async () => {
    hoisted.rows.set('user-b', {
      app_data: {
        xp: 50,
        profileName: 'Bob',
        backlogs: [{ id: 1, name: 'B backlog', total: 3, done: 0, subject: 'Math' }],
      },
      updated_at: '2026-10-01T00:00:00Z',
    });
    const m = await modules();
    await signIn(m, userA);
    giveAccountAProgress(m);
    await signOut(m);

    const result = await signIn(m, userB);
    expect(result.kind).toBe('restored');
    expect(m.data.profileName).toBe('Bob');
    expect(m.data.xp).toBe(50);
    expect(JSON.stringify(m.data.backlogs)).not.toContain('A private backlog');
    expect(JSON.stringify(hoisted.rows.get('user-b')?.app_data)).not.toContain('Alice');
  });

  it("brings A's progress back when A signs in again on the same device", async () => {
    const m = await modules();
    await signIn(m, userA);
    giveAccountAProgress(m);
    await signOut(m);
    await signIn(m, userB);
    await signOut(m);

    await signIn(m, userA);
    expect(m.data.xp).toBe(900);
    expect(m.data.profileName).toBe('Alice');
    expect(JSON.stringify(m.data.backlogs)).toContain('A private backlog');
  });

  it('direct A → B switch (no sign-out step) also starts B empty', async () => {
    const m = await modules();
    await signIn(m, userA);
    giveAccountAProgress(m);

    await signIn(m, userB);
    expect(JSON.stringify(hoisted.rows.get('user-b')?.app_data ?? {})).not.toContain('Alice');
    expect(m.data.xp).toBe(0);
  });
});

describe('shared device: guest progress', () => {
  it('lets the first account adopt guest progress, but never hands it to a second account', async () => {
    const m = await modules();
    m.bindLocalDataToUser(null);
    m.data.xp = 120;
    m.data.profileName = 'Guest';
    m.set('xp', 120);
    m.set('profileName', 'Guest');

    // First sign-in keeps the guest progress (it is uploaded to A).
    await signIn(m, userA);
    expect(hoisted.rows.get('user-a')?.app_data.xp).toBe(120);
    expect(m.get('accountCache:local', null)).toBeNull();

    await signOut(m);
    expect(m.data.xp).toBe(0);

    await signIn(m, userB);
    const rowB = JSON.stringify(hoisted.rows.get('user-b')?.app_data ?? {});
    expect(rowB).not.toContain('Guest');
    expect(hoisted.rows.get('user-b')?.app_data.xp ?? 0).toBe(0);
  });

  it('restores the device-only profile when it existed before an account with a cache signed in', async () => {
    const m = await modules();
    await signIn(m, userA);
    giveAccountAProgress(m);
    await signOut(m);

    // Someone uses the device without an account.
    m.data.xp = 33;
    m.data.profileName = 'Visitor';
    m.set('xp', 33);
    m.set('profileName', 'Visitor');

    // A returns (A has a cache) → visitor progress is parked, A restored.
    await signIn(m, userA);
    expect(m.data.profileName).toBe('Alice');
    expect(JSON.stringify(hoisted.rows.get('user-a')?.app_data)).not.toContain('Visitor');

    // A signs out again → the visitor's device-only profile comes back.
    await signOut(m);
    expect(m.data.profileName).toBe('Visitor');
    expect(m.data.xp).toBe(33);
  });
});

describe('shared device: in-flight sync never crosses accounts', () => {
  it("a push started for A that finishes after the switch never writes B's data into A's row", async () => {
    const m = await modules();
    await signIn(m, userA);
    giveAccountAProgress(m);
    await m.syncNow();
    hoisted.upsertMock.mockClear();

    const release = hoisted.holdNextRead();
    const pending = m.syncNow(); // waiting on A's cloud read

    // Device switches to B while A's request is in flight.
    m.rememberUser(userB as never);
    m.bindLocalDataToUser(userB.id);
    m.data.profileName = 'Bob';
    m.set('profileName', 'Bob');

    release();
    await pending;

    const writesToA = hoisted.upsertMock.mock.calls.filter(([row]) => row.user_id === 'user-a');
    expect(writesToA).toHaveLength(0);
    expect(hoisted.rows.get('user-a')?.app_data.profileName).toBe('Alice');
  });

  it("a pull started for A that finishes after the switch never merges A's row into B", async () => {
    const m = await modules();
    await signIn(m, userA);
    giveAccountAProgress(m);
    await m.syncNow();
    // Another device of A pushes newer progress.
    hoisted.rows.set('user-a', {
      app_data: { ...hoisted.rows.get('user-a')!.app_data, xp: 5000 },
      updated_at: new Date(Date.now() + 60_000).toISOString(),
    });

    const release = hoisted.holdNextRead();
    const pending = m.pullIfCloudNewer();

    m.rememberUser(userB as never);
    m.bindLocalDataToUser(userB.id);

    release();
    await pending;

    expect(m.data.xp).toBe(0);
    expect(JSON.stringify(m.data.backlogs)).not.toContain('A private backlog');
  });

  it('the account switch itself never schedules a blank upload over real cloud progress', async () => {
    hoisted.rows.set('user-b', {
      app_data: { xp: 400, profileName: 'Bob' },
      updated_at: '2026-10-01T00:00:00Z',
    });
    const m = await modules();
    await signIn(m, userA);
    giveAccountAProgress(m);
    hoisted.upsertMock.mockClear();

    vi.useFakeTimers();
    m.rememberUser(userB as never);
    m.bindLocalDataToUser(userB.id); // wipes A's view — must not push it
    await vi.advanceTimersByTimeAsync(5_000);
    vi.useRealTimers();

    const writesToB = hoisted.upsertMock.mock.calls.filter(([row]) => row.user_id === 'user-b');
    // Any write that does happen must already contain B's real cloud progress
    // (merged in first) — never a blank or A-shaped snapshot.
    for (const [row] of writesToB) {
      expect(row.app_data.xp).toBe(400);
      expect(row.app_data.profileName).toBe('Bob');
      expect(JSON.stringify(row.app_data)).not.toContain('Alice');
    }
    expect(hoisted.rows.get('user-b')?.app_data.xp).toBe(400);
    expect(hoisted.rows.get('user-b')?.app_data.profileName).toBe('Bob');
  });

  it('a plain "Sync now" before the first login sync runs the full login sync instead', async () => {
    hoisted.rows.set('user-b', {
      app_data: { xp: 400, profileName: 'Bob' },
      updated_at: '2026-10-01T00:00:00Z',
    });
    const m = await modules();
    await signIn(m, userA);
    giveAccountAProgress(m);

    m.rememberUser(userB as never);
    m.bindLocalDataToUser(userB.id);
    const result = await m.syncNow();

    expect(result.kind).toBe('restored');
    expect(m.data.xp).toBe(400);
    expect(hoisted.rows.get('user-b')?.app_data.xp).toBe(400);
  });

  it('never pushes when local data is not bound to the signed-in account', async () => {
    const m = await modules();
    m.bindLocalDataToUser(null);
    m.set('xp', 77);
    m.rememberUser(userB as never); // signed in, but not bound yet

    await m.syncNow();
    await m.flushCloudSync();
    expect(hoisted.upsertMock).not.toHaveBeenCalled();
  });

  it("resets sync bookkeeping so B's newer cloud edits are merged, not overwritten", async () => {
    const m = await modules();
    await signIn(m, userA);
    giveAccountAProgress(m);
    await m.syncNow();
    expect(m.get('lastCloudPushAt', '')).not.toBe('');

    m.rememberUser(userB as never);
    m.bindLocalDataToUser(userB.id);
    expect(m.get('lastCloudPushAt', '')).toBe('');
    expect(m.get('lastCloudSyncAt', '')).toBe('');
  });
});

describe('shared device: backup export', () => {
  it("exports only the current account's data and snapshots", async () => {
    const m = await modules();
    await signIn(m, userA);
    giveAccountAProgress(m);
    m.createLocalBackup(); // snapshot owned by A
    await signOut(m);
    await signIn(m, userB);
    m.set('profileName', 'Bob');
    m.createLocalBackup(); // snapshot owned by B

    const exported = m.exportCurrentAccountData();
    const text = JSON.stringify(exported);
    expect(Object.keys(exported).some((key) => key.startsWith('accountCache:'))).toBe(false);
    expect(text).not.toContain('Alice');
    expect(text).not.toContain('A private backlog');
    const snapshots = exported.backupSnapshots as Array<{ owner: string }>;
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots.every((item) => item.owner === 'user-b')).toBe(true);
  });
});

describe('shared device: running timers', () => {
  it('resets a running focus timer so its completion cannot credit the next account', async () => {
    const m = await modules();
    const focus = await import('../src/modules/focus.ts');
    await signIn(m, userA);
    focus.startTimer();
    expect(focus.getTimerState().running).toBe(true);

    await signOut(m);
    expect(focus.getTimerState().running).toBe(false);
  });
});
