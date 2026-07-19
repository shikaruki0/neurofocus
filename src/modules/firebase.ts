/**
 * Firebase Cloud Sync — Optional cloud backup via Firebase Firestore.
 * Users configure this in-app; no keys are hardcoded.
 *
 * Security note: Firebase config is stored in localStorage.
 * This is acceptable for client-side Firebase (keys are public by design),
 * but we validate the structure before use.
 */

import { set as storageSet, get as storageGet } from './storage.ts';
import { isValidFirebaseConfig } from '../utils/sanitize.ts';

interface FirebaseConfig {
  apiKey: string;
  projectId: string;
  authDomain: string;
  [key: string]: unknown;
}

// Firebase namespace types (compat SDK)
interface FirebaseApp {
  name: string;
}

interface FirebaseAuth {
  signInWithEmailAndPassword(email: string, password: string): Promise<unknown>;
  createUserWithEmailAndPassword(email: string, password: string): Promise<unknown>;
  signOut(): Promise<void>;
  onAuthStateChanged(callback: (user: User | null) => void): () => void;
  currentUser: User | null;
}

interface User {
  uid: string;
  email: string | null;
}

interface Firestore {
  collection(path: string): CollectionReference;
  FieldValue: {
    serverTimestamp(): unknown;
  };
}

interface CollectionReference {
  doc(path: string): DocumentReference;
}

interface DocumentReference {
  set(data: unknown, options?: { merge?: boolean }): Promise<void>;
  get(): Promise<DocumentSnapshot>;
}

interface DocumentSnapshot {
  exists: boolean;
  data(): unknown;
}

interface FirebaseNamespace {
  apps: FirebaseApp[];
  initializeApp(config: FirebaseConfig): void;
  auth(): FirebaseAuth;
  firestore(): Firestore;
}

declare global {
  interface Window {
    firebase?: FirebaseNamespace;
  }
}

let firebaseAuth: FirebaseAuth | null = null;
let firebaseDb: Firestore | null = null;
let currentUser: User | null = null;
let syncTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Loads Firebase SDK scripts dynamically.
 * @returns Promise that resolves when scripts are loaded
 */
function loadFirebaseScripts(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && window.firebase?.apps) {
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
export async function initFirebase(): Promise<void> {
  const configStr = storageGet<string>('firebase_config', '');
  if (!configStr) return;

  let config: unknown;
  try {
    config = JSON.parse(configStr);
  } catch {
    return;
  }

  if (!isValidFirebaseConfig(config)) return;

  await loadFirebaseScripts();

  if (typeof window === 'undefined' || !window.firebase?.initializeApp) return;

  try {
    if (!window.firebase.apps.length) {
      window.firebase.initializeApp(config as FirebaseConfig);
      firebaseAuth = window.firebase.auth();
      firebaseDb = window.firebase.firestore();
      firebaseAuth.onAuthStateChanged(onAuthStateChanged);
    }
  } catch (e) {
    console.error('Firebase init failed', e);
  }
}

/**
 * Handles auth state changes.
 * @param user - Firebase user
 */
function onAuthStateChanged(user: User | null): void {
  currentUser = user;
  if (user) {
    loadCloudData(user.uid);
  }
}

export interface AuthResult {
  success: boolean;
  error?: string;
}

/**
 * Saves Firebase config to storage and initializes.
 * @param configStr - JSON config string
 * @returns Result
 */
export function saveConfig(configStr: string): AuthResult {
  if (!configStr) return { success: false, error: 'Paste config first' };

  let parsed: unknown;
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
 * @param email - User email
 * @param password - User password
 * @returns Result
 */
export async function login(email: string, password: string): Promise<AuthResult> {
  if (!firebaseAuth) return { success: false, error: 'Firebase not ready' };
  try {
    await firebaseAuth.signInWithEmailAndPassword(email, password);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Login failed' };
  }
}

/**
 * Signs up with email/password.
 * @param email - User email
 * @param password - User password
 * @returns Result
 */
export async function signup(email: string, password: string): Promise<AuthResult> {
  if (!firebaseAuth) return { success: false, error: 'Firebase not ready' };
  try {
    await firebaseAuth.createUserWithEmailAndPassword(email, password);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Sign up failed' };
  }
}

/**
 * Signs out the current user.
 */
export function logout(): void {
  if (firebaseAuth) firebaseAuth.signOut();
}

/**
 * Gets the current user.
 * @returns Current user or null
 */
export function getCurrentUser(): User | null {
  return currentUser;
}

/**
 * Syncs local data to Firestore.
 * @param data - App data object
 */
export function syncToCloud(data: Record<string, unknown>): void {
  if (!currentUser || !firebaseDb || !window.firebase) return;

  firebaseDb
    .collection('users')
    .doc(currentUser.uid)
    .set({ ...data, updatedAt: firebaseDb.FieldValue.serverTimestamp() }, { merge: true })
    .catch((e) => console.error('Sync failed', e));
}

/**
 * Loads cloud data and merges with local.
 * @param uid - User ID
 */
function loadCloudData(uid: string): void {
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
 * @param data - App data object
 * @param delay - Delay in ms
 */
export function scheduleSync(data: Record<string, unknown>, delay = 5000): void {
  if (!currentUser || !firebaseDb) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncToCloud(data), delay);
}

/**
 * Checks if user is logged in.
 * @returns True if logged in
 */
export function isLoggedIn(): boolean {
  return currentUser !== null;
}
