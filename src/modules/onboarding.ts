/**
 * Onboarding — first-run experience state.
 *
 * Tracks whether the (one-time) welcome screen has been seen.
 * The welcome screen explains what the app is, why it matters and how to use it
 * BEFORE asking for any account — it answers the three questions every new
 * visitor has: what is this, why should I care, what do I do first.
 */

import { get as storageGet, set as storageSet } from './storage.ts';

const WELCOME_SEEN_KEY = 'welcomeSeen';

/** True once the user has seen (and dismissed) the welcome screen. */
export function hasSeenWelcome(): boolean {
  return storageGet<boolean>(WELCOME_SEEN_KEY, false) === true;
}

/** Marks the welcome screen as seen so it never blocks returning users. */
export function markWelcomeSeen(): void {
  storageSet(WELCOME_SEEN_KEY, true);
}
