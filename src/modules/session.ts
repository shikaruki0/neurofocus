/**
 * Simple Local Session — frictionless profile login without external services.
 *
 * NeuroFocusX is an offline-first PWA. This module gives the user a professional
 * first-run "login" experience while keeping progress private and saved on the
 * current device. Real cross-device accounts can be added later with a backend.
 */

import { data, persist, persistMany } from './data.ts';
import { validateMission, validateProfileName } from '../utils/validation.ts';

export interface LocalLoginInput {
  name: string;
  mission?: string;
}

export interface LocalLoginResult {
  success: boolean;
  error?: string;
}

/**
 * Returns whether the user has completed the simple local login.
 */
export function isSessionStarted(): boolean {
  return !!data.hasOnboarded;
}

/**
 * Starts a local profile session and persists it to device storage.
 */
export function startLocalSession(input: LocalLoginInput): LocalLoginResult {
  const nameValidation = validateProfileName(input.name);
  if (!nameValidation.valid) {
    return { success: false, error: nameValidation.error };
  }

  const mission = String(input.mission || '').trim();
  if (mission) {
    const missionValidation = validateMission(mission);
    if (!missionValidation.valid) {
      return { success: false, error: missionValidation.error };
    }
    data.mission = missionValidation.data;
  }

  data.profileName = nameValidation.data;
  data.hasOnboarded = true;
  data.lastLoginAt = Date.now();
  persistMany(['profileName', 'mission', 'hasOnboarded', 'lastLoginAt']);

  return { success: true };
}

/**
 * Ends the local session without deleting progress.
 * Useful when the user wants to switch the display profile on the same device.
 */
export function endLocalSession(): void {
  data.hasOnboarded = false;
  persist('hasOnboarded');
}
