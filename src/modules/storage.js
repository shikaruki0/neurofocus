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
const memoryStore = new Map();

/**
 * Gets a value from storage.
 * @param {string} key - Storage key (without prefix)
 * @param {*} fallback - Default if key doesn't exist
 * @returns {*} Parsed value or fallback
 */
export function get(key, fallback = null) {
  const fullKey = PREFIX + key;
  try {
    if (useLS) {
      const val = localStorage.getItem(fullKey);
      return val === null ? fallback : JSON.parse(val);
    }
    return memoryStore.has(fullKey) ? memoryStore.get(fullKey) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Sets a value in storage.
 * @param {string} key - Storage key (without prefix)
 * @param {*} value - Value to store (will be JSON.stringify'd)
 */
export function set(key, value) {
  const fullKey = PREFIX + key;
  try {
    memoryStore.set(fullKey, value);
    if (useLS) {
      localStorage.setItem(fullKey, JSON.stringify(value));
    }
  } catch {
    // Storage full or unavailable — keep in memory only
  }
}

/**
 * Removes a key from storage.
 * @param {string} key
 */
export function remove(key) {
  const fullKey = PREFIX + key;
  try {
    memoryStore.delete(fullKey);
    if (useLS) localStorage.removeItem(fullKey);
  } catch {
    // Ignore
  }
}

/**
 * Clears ALL NeuroFocus data from storage.
 * Used by "Delete All Data" — irreversible.
 */
export function clearAll() {
  try {
    if (useLS) {
      const toRemove = [];
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
export function isPersistent() {
  return useLS;
}

/**
 * Exports all data as a JSON object (for backup/export feature).
 * Falls back to memory store if localStorage is unavailable.
 * @returns {object}
 */
export function exportAll() {
  const data = {};
  try {
    if (useLS) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX)) {
          try {
            data[k.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(k));
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
 * @param {object} data
 * @returns {number} Number of keys imported
 */
export function importAll(data) {
  let count = 0;
  if (!data || typeof data !== 'object') return 0;
  for (const [key, value] of Object.entries(data)) {
    set(key, value);
    count++;
  }
  return count;
}
