/**
 * Storage Module — LocalStorage abstraction with in-memory fallback.
 * All data access goes through this module for consistency and safety.
 */

const PREFIX = 'nf_';
let useLS = false;

// Test localStorage availability once at module load
try {
  const testKey = '__nf_test__';
  localStorage.setItem(testKey, '1');
  localStorage.removeItem(testKey);
  useLS = true;
} catch {
  useLS = false;
}

/** In-memory fallback when localStorage is unavailable (private mode, etc.) */
const memoryStore = new Map<string, unknown>();

/**
 * Gets a value from storage.
 * @param key - Storage key (without prefix)
 * @param fallback - Default if key doesn't exist
 * @returns Parsed value or fallback
 */
export function get<T = unknown>(key: string, fallback: T = null as T): T {
  const fullKey = PREFIX + key;
  try {
    if (useLS) {
      const val = localStorage.getItem(fullKey);
      return val === null ? fallback : JSON.parse(val);
    }
    return memoryStore.has(fullKey) ? (memoryStore.get(fullKey) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Keys that are meta / auth and must not trigger a cloud push. */
const NO_CLOUD_PUSH_KEYS = new Set([
  'authUser',
  'backupSnapshots',
  'lastCloudSyncAt',
  'lastCloudPushAt',
  'boundUserId',
  'cloudRevision',
  'welcomeSeen',
  'locale',
  'languageChosen',
]);

/**
 * Sets a value in storage.
 * @param key - Storage key (without prefix)
 * @param value - Value to store (will be JSON.stringify'd)
 */
export function set(key: string, value: unknown): void {
  const fullKey = PREFIX + key;
  try {
    memoryStore.set(fullKey, value);
    if (useLS) {
      localStorage.setItem(fullKey, JSON.stringify(value));
    }
  } catch {
    // Storage full or unavailable — keep in memory only
  }

  // Keep signed-in accounts in sync across devices after every real progress write.
  // Lazy import avoids a circular dependency (cloudSync → storage).
  if (!NO_CLOUD_PUSH_KEYS.has(key) && !key.startsWith('accountCache:')) {
    try {
      void import('./cloudSync.ts')
        .then((mod) => {
          if (typeof mod.scheduleCloudPush === 'function') mod.scheduleCloudPush();
        })
        .catch(() => undefined);
    } catch {
      // ignore
    }
  }
}

/**
 * Removes a key from storage.
 * @param key
 */
export function remove(key: string): void {
  const fullKey = PREFIX + key;
  try {
    memoryStore.delete(fullKey);
    if (useLS) localStorage.removeItem(fullKey);
  } catch {
    // Ignore
  }
}

/**
 * Clears ALL NeuroFocusX data from storage.
 * Used by "Delete All Data" — irreversible.
 */
export function clearAll(): void {
  try {
    if (useLS) {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX)) toRemove.push(k);
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
    }
    // Clear memory store of nf_ keys
    for (const k of memoryStore.keys()) {
      if (k.startsWith(PREFIX)) memoryStore.delete(k);
    }
  } catch {
    // Ignore
  }
}

/**
 * Returns whether localStorage is available.
 * @returns {boolean}
 */
export function isPersistent(): boolean {
  return useLS;
}

/**
 * Exports all data as a JSON object (for backup/export feature).
 * Falls back to memory store if localStorage is unavailable.
 * @returns {object}
 */
export function exportAll(): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  try {
    if (useLS) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX)) {
          try {
            data[k.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(k) ?? 'null');
          } catch {
            // skip
          }
        }
      }
    } else {
      // Fallback to memory store
      for (const [k, v] of memoryStore.entries()) {
        if (k.startsWith(PREFIX)) {
          data[k.slice(PREFIX.length)] = v;
        }
      }
    }
  } catch {
    // Ignore
  }
  return data;
}

/**
 * Imports data from a previously exported JSON object.
 * @param data
 * @returns Number of keys imported
 */
export function importAll(data: unknown): number {
  let count = 0;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 0;
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    set(key, value);
    count++;
  }
  return count;
}
