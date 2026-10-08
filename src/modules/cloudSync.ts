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
import { exportAll, get, importAll, remove, runWithoutCloudPush, set } from './storage.ts';
import { data, DEFAULT_MISSION } from './data.ts';
import { reconcileDailyFocus } from './focusDaily.ts';
import { clearMission, restoreMission } from './mission.ts';
import { stopTimer as stopFocusTimer } from './focus.ts';
import { resetTimer as resetUrgeTimer } from './urge.ts';

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

/**
 * Per-account local caches written by bindLocalDataToUser (key =
 * `accountCache:<userId>`). These contain ANOTHER account's full progress and
 * are strictly per-device. They must never be uploaded to a cloud row — doing
 * so leaked Account A's private data into Account B's synced state on shared
 * devices — and must never be applied from a cloud row.
 */
const EXCLUDED_KEY_PREFIXES = ['accountCache:'];

function isExcludedSyncKey(key: string): boolean {
  if (META_KEYS.has(key)) return true;
  for (const prefix of EXCLUDED_KEY_PREFIXES) {
    if (key.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * The complete set of storage keys this app version knows how to use. Restores
 * (from cloud rows or account caches) apply ONLY these keys; anything else is
 * dropped. This makes a cloud row / imported snapshot a read-only source of
 * known app state instead of an arbitrary write primitive into localStorage —
 * a defense-in-depth layer on top of Supabase RLS.
 */
const RESTORE_ALLOWED_KEYS = new Set<string>([
  // data.ts fields (the shared progress object)
  'profileName',
  'mission',
  'xp',
  'detoxStreak',
  'consecutiveStreak',
  'lastStreakDate',
  'detoxLastDate',
  'dailyChecks',
  'dailyCheckDate',
  'studentProfile',
  'initialBacklogSetupComplete',
  'dailyClassCheck',
  'backlogs',
  'habits',
  'battle',
  'focusMinutes',
  'totalFocusMinutes',
  'focusDate',
  'flowState',
  'badgesUnlocked',
  'dailyQuests',
  'morningRitual',
  'subjects',
  'weeklyStats',
  'streakFreezes',
  'buddyName',
  'hasOnboarded',
  'lastLoginAt',
  'streakClaimToday',
  'backlogsToday',
  'habitsToday',
  'sessions',
  'autoTheme',
  'theme',
  'soundSettings',
  // app-level keys (ephemeral timers, UI prefs, missions, import legacy alias)
  'statCheck',
  'habitCheck',
  'quoteDate',
  'quoteText',
  'welcomeSeen',
  'locale',
  'languageChosen',
  'focusTimer',
  'urgeTimer',
  'activeMission',
  'badges',
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

/**
 * Increments every time local storage is re-bound to a different account (or
 * to device-only mode). Every network-backed sync operation captures it at the
 * start and re-checks it after each await: a read/write that started for
 * Account A must never apply its result after the device switched to Account
 * B — that would merge A's cloud row into B's local data, or upload B's local
 * data into A's row.
 */
let accountEpoch = 0;

/**
 * Account the local data was just switched to, until its first full login
 * sync finishes. While set, a plain push (`syncNow`) or pull is upgraded to a
 * full `syncOnLogin`, so a freshly emptied device can never overwrite the
 * account's real cloud progress with a blank snapshot.
 */
let loginSyncPendingFor: string | null = null;
let loginSyncInFlight: { userId: string; epoch: number; promise: Promise<SyncResult> } | null =
  null;

/** Snapshot of who owns the local data right now, for stale-result checks. */
interface SyncTicket {
  userId: string;
  epoch: number;
}

/**
 * Starts a sync operation for the signed-in account — but only when the local
 * data is actually bound to that account. Returns null otherwise, so no
 * account ever pushes data that belongs to another account (or to the
 * device-only profile).
 */
function openTicket(): SyncTicket | null {
  const user = currentUser();
  if (!user || !supabase) return null;
  if (get<string | null>('boundUserId', null) !== user.id) return null;
  return { userId: user.id, epoch: accountEpoch };
}

/** True while the ticket's account still owns the local data. */
function ticketValid(ticket: SyncTicket): boolean {
  return (
    ticket.epoch === accountEpoch &&
    currentUser()?.id === ticket.userId &&
    get<string | null>('boundUserId', null) === ticket.userId
  );
}

function cancelPendingPush(): void {
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
}

function appSnapshot(): Record<string, unknown> {
  return Object.fromEntries(Object.entries(exportAll()).filter(([key]) => !isExcludedSyncKey(key)));
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
  score += Number(value.focusMinutes) || 0;
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
  snapshots.push({
    createdAt: new Date().toISOString(),
    // Who this snapshot belongs to, so a backup export on a shared device only
    // contains the current account's snapshots.
    owner: get<string | null>('boundUserId', null) || 'local',
    appData: appSnapshot(),
  });
  set('backupSnapshots', snapshots.slice(-5));
}

/**
 * Data for the "Export backup" file: the current account's progress only.
 * Other accounts' device caches and their safety snapshots stay out of it, so
 * one person on a shared device can never download another person's data.
 */
export function exportCurrentAccountData(): Record<string, unknown> {
  const owner = get<string | null>('boundUserId', null) || 'local';
  const all = exportAll();
  const deviceHasOtherAccounts = Object.keys(all).some(
    (key) => key.startsWith('accountCache:') && key !== `accountCache:${owner}`,
  );
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(all)) {
    if (EXCLUDED_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
    if (key === 'backupSnapshots') {
      const list = Array.isArray(value) ? value : [];
      out[key] = list.filter((item) => {
        const snapshotOwner = (item as { owner?: unknown } | null)?.owner;
        // Legacy snapshots carry no owner; keep them only on a device that has
        // never hosted a second account.
        if (snapshotOwner === undefined) return !deviceHasOtherAccounts;
        return snapshotOwner === owner;
      });
      continue;
    }
    out[key] = value;
  }
  return out;
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
    // Never let cloud wipe/override auth session keys or account caches, and
    // only accept keys this app version actually uses (see RESTORE_ALLOWED_KEYS).
    const safe: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value || {})) {
      if (isExcludedSyncKey(key)) continue;
      if (!RESTORE_ALLOWED_KEYS.has(key)) {
        console.debug('cloudSync: ignoring unknown key from restore', key);
        continue;
      }
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
    // A restored snapshot can carry another day's focus counters (e.g. the cloud
    // copy was saved yesterday). Realign them with the restored session log so the
    // app never claims focus time that has no session behind it.
    try {
      reconcileDailyFocus();
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
 * Rules (shared-device safe):
 *  - Leaving a real account (sign-out or switch) parks its progress in a
 *    per-device cache (`accountCache:<id>`) and clears the screen. The next
 *    person — guest or another account — never sees or uploads it.
 *  - Returning to an account that has a cache restores exactly that cache.
 *  - The first time a guest signs in, the guest progress is KEPT and adopted
 *    by the account (so syncOnLogin can upload/merge it). The guest copy is
 *    consumed so it cannot be handed to a second account later.
 *
 * Returns true when the local data was re-bound (the UI should redraw).
 */
export function bindLocalDataToUser(userId: string | null): boolean {
  const previous = get<string | null>('boundUserId', null);
  const next = userId || 'local';
  if (previous === next) return false;

  const prevIsRealAccount = Boolean(previous && previous !== 'local');
  const nextIsRealAccount = Boolean(userId);

  // Anything still in flight for the previous owner is stale from here on.
  accountEpoch += 1;
  cancelPendingPush();
  lastKnownCloudUpdatedAt = null;
  loginSyncPendingFor = nextIsRealAccount ? next : null;

  // The writes below re-bind the device; they are not user edits and must not
  // schedule a cloud push (which could upload a blank snapshot).
  const wasApplyingRemote = applyingRemote;
  applyingRemote = true;
  try {
    runWithoutCloudPush(() =>
      rebindLocalData(previous, next, prevIsRealAccount, nextIsRealAccount),
    );
  } finally {
    applyingRemote = wasApplyingRemote;
    cancelPendingPush();
  }
  return true;
}

function rebindLocalData(
  previous: string | null,
  next: string,
  prevIsRealAccount: boolean,
  nextIsRealAccount: boolean,
): void {
  // Snapshot the previous owner's local view before switching. A guest's
  // progress that is about to be adopted by a brand-new account is not
  // cached — see below.
  const cached = get<Record<string, unknown> | null>(`accountCache:${next}`, null);
  const hasCache = Boolean(cached && typeof cached === 'object');
  const adoptGuestProgress = previous === 'local' && nextIsRealAccount && !hasCache;

  if (previous && !adoptGuestProgress) {
    try {
      set(`accountCache:${previous}`, appSnapshot());
    } catch {
      // ignore
    }
  }

  if (hasCache) {
    // Returning to an owner we already used on this device — restore its cache.
    stopAccountTimers();
    wipeProgressKeys();
    restoreApp(cached!);
  } else if (prevIsRealAccount) {
    // Leaving a real account with nothing to restore (sign-out to a clean
    // device-only profile, or User A → User B): start empty so A's progress
    // never leaks. Cloud restore fills B if B has data.
    stopAccountTimers();
    wipeProgressKeys();
  } else if (adoptGuestProgress) {
    // Guest → first sign-in: the account takes over the guest progress.
    // Drop the guest copy so it cannot be adopted by another account later.
    remove('accountCache:local');
  }
  // else: unbound (legacy/fresh) device → keep current local data.

  // Sync bookkeeping belongs to the previous account's cloud row; reusing
  // it would make the next account skip merging its newer cloud edits.
  remove('lastCloudPushAt');
  remove('lastCloudSyncAt');
  set('boundUserId', next);
}

/**
 * A running focus/urge countdown belongs to the person who started it. When
 * the device switches owner it is reset, so its completion can never award
 * XP or a session to the next account.
 */
function stopAccountTimers(): void {
  try {
    stopFocusTimer();
  } catch {
    // ignore
  }
  try {
    resetUrgeTimer();
  } catch {
    // ignore
  }
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
  // Clearing minutes without clearing the day stamp used to leave the reset guard
  // thinking "today is already handled", so the empty state could look like study time.
  data.focusDate = '';
  data.flowState = { date: '', sessions: 0 };
  data.totalFocusMinutes = 0;
  data.detoxStreak = 0;
  data.consecutiveStreak = 0;
  data.lastStreakDate = null;
  data.detoxLastDate = null;
  data.streakFreezes = 0;
  data.dailyChecks = {};
  data.dailyCheckDate = '';
  data.morningRitual = {
    date: '',
    completed: false,
    steps: [false, false, false, false, false],
  };
  data.weeklyStats = [];
  data.studentProfile = null;
  data.initialBacklogSetupComplete = false;
  data.dailyClassCheck = null;
  data.dailyQuests = null;
  data.backlogsToday = 0;
  data.habitsToday = 0;
  data.profileName = 'Warrior';
  data.mission = DEFAULT_MISSION;
  data.streakClaimToday = null;
  data.buddyName = '';
  data.hasOnboarded = false;
  data.subjects = {
    Physics: 0,
    Chemistry: 0,
    Math: 0,
    Biology: 0,
    History: 0,
    Geography: 0,
    'Political Science': 0,
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
    'focusDate',
    'flowState',
    'totalFocusMinutes',
    'detoxStreak',
    'consecutiveStreak',
    'lastStreakDate',
    'detoxLastDate',
    'streakFreezes',
    'dailyChecks',
    'dailyCheckDate',
    'morningRitual',
    'weeklyStats',
    'studentProfile',
    'initialBacklogSetupComplete',
    'dailyClassCheck',
    'dailyQuests',
    'backlogsToday',
    'habitsToday',
    'profileName',
    'mission',
    'streakClaimToday',
    'buddyName',
    'hasOnboarded',
    'subjects',
  ];
  for (const key of keys) set(key, data[key]);
  // clearMission resets the mission module's IN-MEMORY state too — plain
  // remove('activeMission') only cleared storage, so User A's active mission
  // kept running in memory and silently re-persisted into User B's account.
  clearMission();
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

async function writeCloud(
  userId: string,
  appData: Record<string, unknown>,
  ticket?: SyncTicket,
): Promise<string> {
  if (!supabase) throw new Error('Cloud sync is not configured.');
  const updatedAt = new Date().toISOString();
  const { error } = await supabase
    .from('user_states')
    .upsert({ user_id: userId, app_data: appData, updated_at: updatedAt });
  if (error) throw error;
  // Bookkeeping describes the CURRENT account's row; skip it if the device
  // switched accounts while the upload was in flight.
  if (!ticket || ticketValid(ticket)) {
    lastKnownCloudUpdatedAt = updatedAt;
    set('lastCloudPushAt', updatedAt);
    set('lastCloudSyncAt', updatedAt);
  }
  return updatedAt;
}

/** Result for an operation abandoned because the device switched accounts. */
const STALE_RESULT: SyncResult = { kind: 'unchanged' };

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

    // Merge subjects by taking the maximum XP for each subject key
    if (
      key === 'subjects' &&
      localVal &&
      typeof localVal === 'object' &&
      cloudVal &&
      typeof cloudVal === 'object'
    ) {
      const mergedSubjects: Record<string, number> = {
        ...(cloudVal as Record<string, number>),
      };
      for (const [sKey, sVal] of Object.entries(localVal as Record<string, number>)) {
        mergedSubjects[sKey] = Math.max(Number(sVal) || 0, Number(mergedSubjects[sKey]) || 0);
      }
      out[key] = mergedSubjects;
      continue;
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
      Number(
        existing.updatedAt || existing.done || existing.streak || existing.completedDuration || 0,
      ) || 0;
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
 *
 * Concurrent automatic calls for the same account share one run (sign-in
 * fires both the session restore and the auth listener), and every step is
 * abandoned if the device switches accounts mid-way.
 */
export function syncOnLogin(choice?: SyncChoice): Promise<SyncResult> {
  const user = currentUser();
  if (!user || !supabase) return Promise.resolve({ kind: 'offline' });

  bindLocalDataToUser(user.id);

  if (
    !choice &&
    loginSyncInFlight &&
    loginSyncInFlight.userId === user.id &&
    loginSyncInFlight.epoch === accountEpoch
  ) {
    return loginSyncInFlight.promise;
  }

  const ticket: SyncTicket = { userId: user.id, epoch: accountEpoch };
  const promise = runLoginSync(ticket, choice).finally(() => {
    if (loginSyncInFlight?.promise === promise) loginSyncInFlight = null;
  });
  loginSyncInFlight = { userId: user.id, epoch: ticket.epoch, promise };
  return promise;
}

async function runLoginSync(ticket: SyncTicket, choice?: SyncChoice): Promise<SyncResult> {
  const userId = ticket.userId;
  const cloud = await readCloud(userId);
  if (!ticketValid(ticket)) return STALE_RESULT;

  // Snapshot AFTER the read, so edits made while it was in flight are included.
  const local = appSnapshot();
  const localExists = hasProgress(local);
  const cloudExists = Boolean(cloud && hasProgress(cloud.app_data || {}));

  const done = (result: SyncResult): SyncResult => {
    if (ticketValid(ticket) && loginSyncPendingFor === userId) loginSyncPendingFor = null;
    startAutoSync();
    return result;
  };

  if (!cloudExists) {
    await writeCloud(userId, local, ticket);
    if (!ticketValid(ticket)) return STALE_RESULT;
    return done({ kind: 'uploaded' });
  }

  lastKnownCloudUpdatedAt = cloud!.updated_at;

  if (!localExists) {
    restoreApp(cloud!.app_data);
    set('lastCloudSyncAt', cloud!.updated_at);
    return done({ kind: 'restored', cloud: cloud! });
  }

  const localScore = progressScore(local);
  const cloudScore = progressScore(cloud!.app_data || {});

  const uploadLocal = async (): Promise<SyncResult> => {
    backup();
    await writeCloud(userId, local, ticket);
    if (!ticketValid(ticket)) return STALE_RESULT;
    return done({ kind: 'uploaded', cloud: cloud! });
  };
  const restoreCloud = (): SyncResult => {
    backup();
    restoreApp(cloud!.app_data);
    set('lastCloudSyncAt', cloud!.updated_at);
    return done({ kind: 'restored', cloud: cloud! });
  };
  const mergeBoth = async (): Promise<SyncResult> => {
    backup();
    const merged = smartMerge(cloud!.app_data || {}, local);
    restoreApp(merged);
    await writeCloud(userId, appSnapshot(), ticket);
    if (!ticketValid(ticket)) return STALE_RESULT;
    return done({ kind: 'merged', cloud: cloud! });
  };

  // Explicit user choice always wins when provided.
  if (choice === 'local') return uploadLocal();
  if (choice === 'cloud') return restoreCloud();
  if (choice === 'merge') return mergeBoth();

  // Automatic resolution — never leave devices stuck with different data.
  // If cloud is clearly richer (other device has the real progress), take cloud.
  if (cloudScore > localScore * 1.15 + 30) return restoreCloud();
  // If local is clearly richer, push it up.
  if (localScore > cloudScore * 1.15 + 30) return uploadLocal();
  // Close scores → smart merge so neither device loses backlog/XP.
  return mergeBoth();
}

/** Immediate push of current local state (Settings → Sync now). */
export async function syncNow(): Promise<SyncResult> {
  const ticket = openTicket();
  if (!ticket) return { kind: 'offline' };
  // The account's first full sync has not finished on this device yet: run it
  // instead of a blind push, so an emptied device cannot overwrite real
  // cloud progress.
  if (loginSyncPendingFor === ticket.userId) return syncOnLogin();
  if (syncing) return { kind: 'unchanged' };
  syncing = true;
  try {
    // Pull first so we don't clobber newer phone edits with stale PC data.
    const cloud = await readCloud(ticket.userId);
    if (!ticketValid(ticket)) return STALE_RESULT;
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
    await writeCloud(ticket.userId, appSnapshot(), ticket);
    return { kind: 'uploaded', cloud: cloud || undefined };
  } finally {
    syncing = false;
  }
}

/** Best-effort immediate flush used on logout / page hide. */
export async function flushCloudSync(): Promise<void> {
  const ticket = openTicket();
  if (!ticket) return;
  // Never flush before the first login sync: the local data may still be the
  // blank state of a freshly switched device.
  if (loginSyncPendingFor === ticket.userId) return;
  try {
    await writeCloud(ticket.userId, appSnapshot(), ticket);
  } catch {
    // ignore — offline is fine
  }
}

/**
 * Pull newer cloud data if another device pushed since our last sync.
 * Safe to call often; no-ops when nothing changed.
 */
export async function pullIfCloudNewer(): Promise<SyncResult> {
  const ticket = openTicket();
  if (!ticket || syncing) return { kind: 'offline' };
  if (loginSyncPendingFor === ticket.userId) {
    try {
      return await syncOnLogin();
    } catch {
      return { kind: 'offline' };
    }
  }
  syncing = true;
  try {
    const cloud = await readCloud(ticket.userId);
    if (!ticketValid(ticket)) return STALE_RESULT;
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
  if (!openTicket()) return;
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
