/**
 * Cloud Sync — one shared progress per signed-in account.
 *
 * Why PC and phone used to disagree:
 *  1. Progress lived only in each device's localStorage.
 *  2. Cloud upload ran mainly on login, not after every change.
 *  3. On conflict the app defaulted to "merge" with local keys winning,
 *     so the emptier device could keep its empty backlog forever.
 *
 * Fix:
 *  - Bind local storage to the signed-in user id (account-scoped keys).
 *  - On login: empty device restores cloud; richer cloud wins over stale local;
 *    only true same-richness conflicts need a choice.
 *  - After every local change (debounced) push to Supabase.
 *  - Periodic + visibility refresh pulls newer cloud data.
 */

import { currentUser, supabase } from './auth.ts';
import { exportAll, get, importAll, set, remove } from './storage.ts';
import { data } from './data.ts';
import { restoreMission } from './mission.ts';

export type SyncChoice = 'local' | 'cloud' | 'merge';
export interface CloudState {
  app_data: Record<string, unknown>;
  updated_at: string;
}
export interface SyncResult {
  kind: 'uploaded' | 'restored' | 'conflict' | 'merged' | 'offline' | 'unchanged';
  cloud?: CloudState;
}

/** Keys that must never be uploaded / restored as "app progress". */
const META_KEYS = new Set([
  'authUser',
  'backupSnapshots',
  'lastCloudSyncAt',
  'lastCloudPushAt',
  'boundUserId',
  'cloudRevision',
]);

/** Keys that count as real user progress (for conflict detection). */
const PROGRESS_SIGNAL_KEYS = new Set([
  'xp',
  'backlogs',
  'habits',
  'battle',
  'sessions',
  'totalFocusMinutes',
  'focusMinutes',
  'badgesUnlocked',
  'detoxStreak',
  'consecutiveStreak',
  'weeklyStats',
  'studentProfile',
  'activeMission',
  'profileName',
  'mission',
  'subjects',
]);

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pullTimer: ReturnType<typeof setInterval> | null = null;
let syncing = false;
let autoSyncStarted = false;
let lastKnownCloudUpdatedAt: string | null = null;
/** True while we are writing restored cloud data into local storage. */
let applyingRemote = false;

function appSnapshot(): Record<string, unknown> {
  return Object.fromEntries(Object.entries(exportAll()).filter(([key]) => !META_KEYS.has(key)));
}

function isNonEmptyValue(item: unknown): boolean {
  if (item === null || item === undefined || item === '') return false;
  if (Array.isArray(item)) return item.length > 0;
  if (typeof item === 'number') return item !== 0;
  if (typeof item === 'boolean') return item;
  if (typeof item === 'object') return Object.keys(item as object).length > 0;
  return true;
}

function hasProgress(value: Record<string, unknown>): boolean {
  return Object.entries(value).some(([key, item]) => {
    if (key === 'hasOnboarded' || META_KEYS.has(key)) return false;
    return isNonEmptyValue(item);
  });
}

/** Rough "how much progress" score so we can pick the richer side automatically. */
export function progressScore(value: Record<string, unknown> = appSnapshot()): number {
  let score = 0;
  const xp = Number(value.xp) || 0;
  score += Math.max(0, xp);
  score += (Number(value.totalFocusMinutes) || 0) * 2;
  score += (Number(value.focusMinutes) || 0);
  score += (Number(value.detoxStreak) || 0) * 10;
  score += (Number(value.consecutiveStreak) || 0) * 10;
  const backlogs = Array.isArray(value.backlogs) ? value.backlogs : [];
  score += backlogs.length * 50;
  for (const b of backlogs) {
    const row = b as { total?: number; done?: number };
    score += (Number(row.total) || 0) * 3 + (Number(row.done) || 0) * 5;
  }
  const habits = Array.isArray(value.habits) ? value.habits : [];
  score += habits.length * 20;
  const battle = Array.isArray(value.battle) ? value.battle : [];
  score += battle.length * 10;
  const sessions = Array.isArray(value.sessions) ? value.sessions : [];
  score += sessions.length * 5;
  const badges = Array.isArray(value.badgesUnlocked)
    ? value.badgesUnlocked
    : Array.isArray(value.badges)
      ? value.badges
      : [];
  score += badges.length * 15;
  if (value.studentProfile) score += 40;
  if (value.activeMission) score += 25;
  // Tiny tie-breaker: count any progress-signal key that is present and non-empty.
  for (const key of PROGRESS_SIGNAL_KEYS) {
    if (key in value && isNonEmptyValue(value[key])) score += 1;
  }
  return score;
}

function backup(): void {
  const snapshots = (exportAll().backupSnapshots as unknown[] | undefined) ?? [];
  snapshots.push({ createdAt: new Date().toISOString(), appData: appSnapshot() });
  set('backupSnapshots', snapshots.slice(-5));
}

export function createLocalBackup(): void {
  backup();
}
export function localData(): Record<string, unknown> {
  return appSnapshot();
}
export function dataHasProgress(value = appSnapshot()): boolean {
  return hasProgress(value);
}

// Maps storage keys (as written into cloud app_data) to the in-memory data field
// names. This keeps restores correct even when a storage key differs from the
// data object's property name (e.g. legacy 'badges' -> 'badgesUnlocked').
const STORAGE_KEY_TO_DATA_FIELD: Record<string, keyof typeof data> = {
  badges: 'badgesUnlocked',
};

function restoreApp(value: Record<string, unknown>): void {
  applyingRemote = true;
  try {
    // Never let cloud wipe/override auth session keys.
    const safe: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value || {})) {
      if (META_KEYS.has(key)) continue;
      safe[key] = item;
    }
    importAll(safe);
    // Sync every data field that the restored snapshot contains.
    for (const key of Object.keys(data) as Array<keyof typeof data>) {
      if (key in safe) (data[key] as unknown) = safe[key];
    }
    // Sync any aliased storage keys into their canonical data field.
    for (const [storageKey, dataField] of Object.entries(STORAGE_KEY_TO_DATA_FIELD)) {
      if (storageKey in safe && dataField in data) {
        (data[dataField] as unknown) = safe[storageKey];
      }
    }
    // Mission lives outside the main `data` object — reload it after restore.
    try {
      restoreMission();
    } catch {
      // ignore
    }
  } finally {
    applyingRemote = false;
    // Cancel any debounced pushes scheduled by the restore writes themselves.
    if (pushTimer) {
      clearTimeout(pushTimer);
      pushTimer = null;
    }
  }
}

/**
 * When the signed-in user changes, isolate their local cache so one account
 * never silently inherits another account's progress.
 *
 * Important: the first time a guest (or unbound device) signs in, we KEEP the
 * current local progress so syncOnLogin can upload/merge it into the new
 * account. We only wipe when switching between two different real accounts.
 */
export function bindLocalDataToUser(userId: string | null): void {
  const previous = get<string | null>('boundUserId', null);
  const next = userId || 'local';
  if (previous === next) return;

  const prevIsRealAccount = Boolean(previous && previous !== 'local');
  const nextIsRealAccount = Boolean(userId);

  // Snapshot the previous account's local view before switching.
  if (previous) {
    try {
      set(`accountCache:${previous}`, appSnapshot());
    } catch {
      // ignore
    }
  }

  const cached = get<Record<string, unknown> | null>(`accountCache:${next}`, null);
  if (cached && typeof cached === 'object') {
    // Returning to an account we already used on this device — restore its cache.
    wipeProgressKeys();
    restoreApp(cached);
  } else if (prevIsRealAccount && nextIsRealAccount) {
    // Switching from User A → User B with no cache for B: start empty so A's
    // backlog never leaks into B. Cloud restore will fill B if it exists.
    wipeProgressKeys();
  }
  // else: guest/unbound → first sign-in, or sign-out to local.
  // Keep current local data so the first cloud upload isn't empty.

  set('boundUserId', next);
}

function wipeProgressKeys(): void {
  // Reset in-memory data to empty-ish defaults, then persist.
  data.xp = 0;
  data.backlogs = [];
  data.habits = [];
  data.battle = [];
  data.sessions = [];
  data.badgesUnlocked = [];
  data.focusMinutes = 0;
  data.totalFocusMinutes = 0;
  data.detoxStreak = 0;
  data.consecutiveStreak = 0;
  data.weeklyStats = [];
  data.studentProfile = null;
  data.initialBacklogSetupComplete = false;
  data.dailyClassCheck = null;
  data.dailyQuests = null;
  data.backlogsToday = 0;
  data.habitsToday = 0;
  data.profileName = 'Warrior';
  data.hasOnboarded = false;
  data.subjects = {
    Physics: 0,
    Chemistry: 0,
    Math: 0,
    Biology: 0,
    History: 0,
    Geography: 0,
    Economics: 0,
    Hindi: 0,
    English: 0,
    IT: 0,
    Other: 0,
  };

  const keys: Array<keyof typeof data> = [
    'xp',
    'backlogs',
    'habits',
    'battle',
    'sessions',
    'badgesUnlocked',
    'focusMinutes',
    'totalFocusMinutes',
    'detoxStreak',
    'consecutiveStreak',
    'weeklyStats',
    'studentProfile',
    'initialBacklogSetupComplete',
    'dailyClassCheck',
    'dailyQuests',
    'backlogsToday',
    'habitsToday',
    'profileName',
    'hasOnboarded',
    'subjects',
  ];
  for (const key of keys) set(key, data[key]);
  remove('activeMission');
}

async function readCloud(userId: string): Promise<CloudState | null> {
  if (!supabase) return null;
  const { data: row, error } = await supabase
    .from('user_states')
    .select('app_data, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return row as CloudState | null;
}

async function writeCloud(userId: string, appData: Record<string, unknown>): Promise<string> {
  if (!supabase) throw new Error('Cloud sync is not configured.');
  const updatedAt = new Date().toISOString();
  const { error } = await supabase
    .from('user_states')
    .upsert({ user_id: userId, app_data: appData, updated_at: updatedAt });
  if (error) throw error;
  lastKnownCloudUpdatedAt = updatedAt;
  set('lastCloudPushAt', updatedAt);
  set('lastCloudSyncAt', updatedAt);
  return updatedAt;
}

/**
 * Deep-ish merge that prefers the richer side for array/progress fields,
 * instead of blindly letting empty local arrays win.
 */
export function smartMerge(
  cloudData: Record<string, unknown>,
  local: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...cloudData };

  for (const [key, localVal] of Object.entries(local)) {
    if (META_KEYS.has(key)) continue;
    const cloudVal = out[key];

    // Arrays of entities (backlogs/habits/etc.): take the longer / richer one.
    if (Array.isArray(localVal) || Array.isArray(cloudVal)) {
      const localArr = Array.isArray(localVal) ? localVal : [];
      const cloudArr = Array.isArray(cloudVal) ? cloudVal : [];
      if (key === 'backlogs' || key === 'habits' || key === 'battle' || key === 'sessions') {
        out[key] = mergeEntityArrays(cloudArr, localArr, key);
        continue;
      }
      if (key === 'badgesUnlocked' || key === 'badges') {
        const setIds = new Set<string>();
        for (const item of [...cloudArr, ...localArr]) {
          if (typeof item === 'string') setIds.add(item);
        }
        out[key] = [...setIds];
        continue;
      }
      // Default: longer array wins; tie → local.
      out[key] = localArr.length >= cloudArr.length ? localArr : cloudArr;
      continue;
    }

    // Numbers: keep the higher value for cumulative stats.
    if (typeof localVal === 'number' || typeof cloudVal === 'number') {
      const ln = Number(localVal) || 0;
      const cn = Number(cloudVal) || 0;
      if (
        key === 'xp' ||
        key === 'totalFocusMinutes' ||
        key === 'detoxStreak' ||
        key === 'consecutiveStreak' ||
        key === 'streakFreezes' ||
        key === 'backlogsToday' ||
        key === 'habitsToday'
      ) {
        out[key] = Math.max(ln, cn);
        continue;
      }
    }

    // Objects: shallow merge, local fields override when present & non-empty.
    if (
      localVal &&
      typeof localVal === 'object' &&
      cloudVal &&
      typeof cloudVal === 'object' &&
      !Array.isArray(localVal) &&
      !Array.isArray(cloudVal)
    ) {
      out[key] = { ...(cloudVal as object), ...(localVal as object) };
      continue;
    }

    // Prefer non-empty local; otherwise keep cloud.
    if (isNonEmptyValue(localVal)) out[key] = localVal;
    else if (!(key in out)) out[key] = localVal;
  }

  return out;
}

function mergeEntityArrays(cloudArr: unknown[], localArr: unknown[], key: string): unknown[] {
  // Index by id when present; otherwise fall back to JSON identity.
  const map = new Map<string, Record<string, unknown>>();
  const put = (item: unknown) => {
    if (!item || typeof item !== 'object') return;
    const row = item as Record<string, unknown>;
    const id =
      row.id !== undefined && row.id !== null
        ? String(row.id)
        : key === 'sessions' && row.time !== undefined
          ? `t:${row.time}`
          : JSON.stringify(row);
    const existing = map.get(id);
    if (!existing) {
      map.set(id, { ...row });
      return;
    }
    // Prefer the row with the higher updatedAt / done / streak.
    const existingScore =
      Number(existing.updatedAt || existing.done || existing.streak || existing.completedDuration || 0) ||
      0;
    const nextScore =
      Number(row.updatedAt || row.done || row.streak || row.completedDuration || 0) || 0;
    if (nextScore >= existingScore) map.set(id, { ...existing, ...row });
    else map.set(id, { ...row, ...existing });
  };
  cloudArr.forEach(put);
  localArr.forEach(put);
  return [...map.values()];
}

/**
 * Login / restore path.
 * - No cloud yet → upload local.
 * - No local progress → restore cloud.
 * - Both have progress → auto-pick richer side, or merge when close.
 * - Explicit choice still supported for the Settings UI.
 */
export async function syncOnLogin(choice?: SyncChoice): Promise<SyncResult> {
  const user = currentUser();
  if (!user || !supabase) return { kind: 'offline' };

  bindLocalDataToUser(user.id);

  const local = appSnapshot();
  const cloud = await readCloud(user.id);
  const localExists = hasProgress(local);
  const cloudExists = Boolean(cloud && hasProgress(cloud.app_data || {}));

  if (!cloudExists) {
    await writeCloud(user.id, local);
    startAutoSync();
    return { kind: 'uploaded' };
  }

  lastKnownCloudUpdatedAt = cloud!.updated_at;

  if (!localExists) {
    restoreApp(cloud!.app_data);
    set('lastCloudSyncAt', cloud!.updated_at);
    startAutoSync();
    return { kind: 'restored', cloud: cloud! };
  }

  const localScore = progressScore(local);
  const cloudScore = progressScore(cloud!.app_data || {});

  // Explicit user choice always wins when provided.
  if (choice === 'local') {
    backup();
    await writeCloud(user.id, local);
    startAutoSync();
    return { kind: 'uploaded', cloud: cloud! };
  }
  if (choice === 'cloud') {
    backup();
    restoreApp(cloud!.app_data);
    set('lastCloudSyncAt', cloud!.updated_at);
    startAutoSync();
    return { kind: 'restored', cloud: cloud! };
  }
  if (choice === 'merge') {
    backup();
    const merged = smartMerge(cloud!.app_data || {}, local);
    restoreApp(merged);
    await writeCloud(user.id, appSnapshot());
    startAutoSync();
    return { kind: 'merged', cloud: cloud! };
  }

  // Automatic resolution — never leave devices stuck with different data.
  // If cloud is clearly richer (other device has the real progress), take cloud.
  if (cloudScore > localScore * 1.15 + 30) {
    backup();
    restoreApp(cloud!.app_data);
    set('lastCloudSyncAt', cloud!.updated_at);
    startAutoSync();
    return { kind: 'restored', cloud: cloud! };
  }
  // If local is clearly richer, push it up.
  if (localScore > cloudScore * 1.15 + 30) {
    backup();
    await writeCloud(user.id, local);
    startAutoSync();
    return { kind: 'uploaded', cloud: cloud! };
  }

  // Close scores → smart merge so neither device loses backlog/XP.
  backup();
  const merged = smartMerge(cloud!.app_data || {}, local);
  restoreApp(merged);
  await writeCloud(user.id, appSnapshot());
  startAutoSync();
  return { kind: 'merged', cloud: cloud! };
}

/** Immediate push of current local state (Settings → Sync now). */
export async function syncNow(): Promise<SyncResult> {
  const user = currentUser();
  if (!user || !supabase) return { kind: 'offline' };
  if (syncing) return { kind: 'unchanged' };
  syncing = true;
  try {
    // Pull first so we don't clobber newer phone edits with stale PC data.
    const cloud = await readCloud(user.id);
    const local = appSnapshot();
    if (cloud && hasProgress(cloud.app_data || {})) {
      lastKnownCloudUpdatedAt = cloud.updated_at;
      const cloudTime = Date.parse(cloud.updated_at || '') || 0;
      const localPush = Date.parse(String(get('lastCloudPushAt', '') || '')) || 0;
      // If cloud was updated after our last push, merge it in first.
      if (cloudTime > localPush + 500) {
        const merged = smartMerge(cloud.app_data || {}, local);
        restoreApp(merged);
      }
    }
    await writeCloud(user.id, appSnapshot());
    return { kind: 'uploaded', cloud: cloud || undefined };
  } finally {
    syncing = false;
  }
}

/** Best-effort immediate flush used on logout / page hide. */
export async function flushCloudSync(): Promise<void> {
  const user = currentUser();
  if (!user || !supabase) return;
  try {
    await writeCloud(user.id, appSnapshot());
  } catch {
    // ignore — offline is fine
  }
}

/**
 * Pull newer cloud data if another device pushed since our last sync.
 * Safe to call often; no-ops when nothing changed.
 */
export async function pullIfCloudNewer(): Promise<SyncResult> {
  const user = currentUser();
  if (!user || !supabase || syncing) return { kind: 'offline' };
  syncing = true;
  try {
    const cloud = await readCloud(user.id);
    if (!cloud) return { kind: 'unchanged' };
    const cloudTime = Date.parse(cloud.updated_at || '') || 0;
    const known = Date.parse(lastKnownCloudUpdatedAt || '') || 0;
    const lastPush = Date.parse(String(get('lastCloudPushAt', '') || '')) || 0;
    if (cloudTime && cloudTime <= Math.max(known, lastPush) + 500) {
      return { kind: 'unchanged' };
    }
    lastKnownCloudUpdatedAt = cloud.updated_at;
    if (!hasProgress(cloud.app_data || {})) return { kind: 'unchanged' };
    const merged = smartMerge(cloud.app_data || {}, appSnapshot());
    restoreApp(merged);
    set('lastCloudSyncAt', cloud.updated_at);
    return { kind: 'restored', cloud };
  } catch {
    return { kind: 'offline' };
  } finally {
    syncing = false;
  }
}

/** Debounced push after local edits (backlog, XP, habits, …). */
export function scheduleCloudPush(delayMs = 1200): void {
  if (applyingRemote || syncing) return;
  if (!currentUser() || !supabase) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    if (applyingRemote) return;
    void syncNow().catch(() => undefined);
  }, delayMs);
}

/** Starts background pull + visibility flush. Idempotent. */
export function startAutoSync(): void {
  if (autoSyncStarted) return;
  if (!supabase) return;
  autoSyncStarted = true;

  // Pull every 45s while the tab is open so the other device's edits show up.
  pullTimer = setInterval(() => {
    if (document.visibilityState === 'hidden') return;
    void pullIfCloudNewer().catch(() => undefined);
  }, 45_000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void flushCloudSync();
    } else {
      void pullIfCloudNewer().catch(() => undefined);
    }
  });

  window.addEventListener('online', () => {
    void syncNow().catch(() => undefined);
  });

  window.addEventListener('pagehide', () => {
    void flushCloudSync();
  });
}

export function stopAutoSync(): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
  if (pullTimer) clearInterval(pullTimer);
  pullTimer = null;
  autoSyncStarted = false;
}
