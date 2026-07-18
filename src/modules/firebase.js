/**
 * Firebase Cloud Sync — Optional cloud backup via Firebase Firestore.
 * Users configure this in-app; no keys are hardcoded.
 *
 * Security note: Firebase config is stored in localStorage.
 * This is acceptable for client-side Firebase (keys are public by design),
 * but we validate the structure before use.
 */

import { set as storageSet, get as storageGet } from './storage.js';
import { isValidFirebaseConfig } from '../utils/sanitize.js';

/* global firebase */

let firebaseAuth = null;
let firebaseDb = null;
let currentUser = null;
let syncTimer = null;

/**
 * Loads Firebase SDK scripts dynamically.
 * @returns {Promise<void>}
 */
function loadFirebaseScripts() {
  return new Promise((resolve) => {
    if (typeof firebase !== 'undefined' && firebase.apps) {
      resolve();
      return;
    }
    const scripts = [
      'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',
      'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js',
      'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js',
    ];
    let loaded = 0;
    for (const src of scripts) {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => {
        loaded++;
        if (loaded === scripts.length) resolve();
      };
      s.onerror = () => {
        loaded++;
        if (loaded === scripts.length) resolve();
      };
      document.head.appendChild(s);
    }
  });
}

/**
 * Initializes Firebase from stored config.
 */
export async function initFirebase() {
  const configStr = storageGet('firebase_config', '');
  if (!configStr) return;

  let config;
  try {
    config = JSON.parse(configStr);
  } catch {
    return;
  }

  if (!isValidFirebaseConfig(config)) return;

  await loadFirebaseScripts();

  if (typeof firebase === 'undefined' || !firebase.initializeApp) return;

  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(config);
      firebaseAuth = firebase.auth();
      firebaseDb = firebase.firestore();
      firebaseAuth.onAuthStateChanged(onAuthStateChanged);
    }
  } catch (e) {
    console.error('Firebase init failed', e);
  }
}

/**
 * Handles auth state changes.
 * @param {object} user
 */
function onAuthStateChanged(user) {
  currentUser = user;
  if (user) {
    loadCloudData(user.uid);
  }
}

/**
 * Saves Firebase config to storage and initializes.
 * @param {string} configStr - JSON config string
 * @returns {{success: boolean, error?: string}}
 */
export function saveConfig(configStr) {
  if (!configStr) return { success: false, error: 'Paste config first' };

  let parsed;
  try {
    parsed = JSON.parse(configStr);
  } catch {
    return { success: false, error: 'Invalid JSON' };
  }

  if (!isValidFirebaseConfig(parsed)) {
    return { success: false, error: 'Config missing required fields' };
  }

  storageSet('firebase_config', configStr);
  initFirebase();
  return { success: true };
}

/**
 * Signs in with email/password.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function login(email, password) {
  if (!firebaseAuth) return { success: false, error: 'Firebase not ready' };
  try {
    await firebaseAuth.signInWithEmailAndPassword(email, password);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Signs up with email/password.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function signup(email, password) {
  if (!firebaseAuth) return { success: false, error: 'Firebase not ready' };
  try {
    await firebaseAuth.createUserWithEmailAndPassword(email, password);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Signs out the current user.
 */
export function logout() {
  if (firebaseAuth) firebaseAuth.signOut();
}

/**
 * Gets the current user.
 * @returns {object|null}
 */
export function getCurrentUser() {
  return currentUser;
}

/**
 * Syncs local data to Firestore.
 * @param {object} data - App data object
 */
export function syncToCloud(data) {
  if (!currentUser || !firebaseDb) return;

  firebaseDb
    .collection('users')
    .doc(currentUser.uid)
    .set({ ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })
    .catch((e) => console.error('Sync failed', e));
}

/**
 * Loads cloud data and merges with local.
 * @param {string} uid
 */
function loadCloudData(uid) {
  if (!firebaseDb) return;

  firebaseDb
    .collection('users')
    .doc(uid)
    .get()
    .then((doc) => {
      if (doc.exists) {
        // Return data for merging — UI layer handles the merge
        const event = new CustomEvent('cloud-data-loaded', { detail: doc.data() });
        window.dispatchEvent(event);
      }
    })
    .catch((e) => console.error('Load cloud failed', e));
}

/**
 * Schedules a debounced sync.
 * @param {object} data
 * @param {number} [delay=5000]
 */
export function scheduleSync(data, delay = 5000) {
  if (!currentUser || !firebaseDb) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncToCloud(data), delay);
}

/**
 * Checks if user is logged in.
 * @returns {boolean}
 */
export function isLoggedIn() {
  return currentUser !== null;
}
