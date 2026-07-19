/**
 * Accountability Partner — Share progress with a friend/mentor.
 * Uses Web Share API with clipboard fallback.
 */

import { data, persist } from './data.ts';
import { xpLevel } from './xp.ts';
import { getCurrentRank } from './ranks.ts';
import { validateBuddyName } from '../utils/validation.ts';

export interface BuddyResult {
  success: boolean;
  error?: string;
  copied?: boolean;
}

/**
 * Sets the accountability partner name.
 * @param name - Partner name
 * @returns Result
 */
export function setBuddy(name: string): BuddyResult {
  const validation = validateBuddyName(name);
  if (!validation.valid) return { success: false, error: validation.error };

  data.buddyName = validation.data;
  persist('buddyName');
  return { success: true };
}

/**
 * Removes the accountability partner.
 */
export function removeBuddy(): void {
  data.buddyName = '';
  persist('buddyName');
}

/**
 * Gets the buddy name.
 * @returns Buddy name
 */
export function getBuddy(): string {
  return (data.buddyName as string) ?? '';
}

/**
 * Generates a progress summary for sharing.
 * @returns Share text
 */
export function generateShareText(): string {
  const rank = getCurrentRank(xpLevel(data.xp).level);
  const info = xpLevel(data.xp);
  const remaining = data.backlogs.reduce((sum, b) => sum + ((b.total || 0) - (b.done || 0)), 0);

  return [
    '🔥 NeuroFocus Progress',
    `Rank: ${rank.name} (Level ${info.level})`,
    `Streak: ${data.consecutiveStreak} days`,
    `Focus: ${Math.floor((data.totalFocusMinutes || 0) / 60)}h total`,
    `Backlogs: ${remaining} left`,
    '',
    `Accountability partner: ${data.buddyName ?? ''}`,
  ].join('\n');
}

/**
 * Shares progress via Web Share API or clipboard.
 * @returns Result
 */
export async function shareProgress(): Promise<BuddyResult> {
  const text = generateShareText();

  if (navigator.share) {
    try {
      await navigator.share({ title: 'NeuroFocus Progress', text });
      return { success: true };
    } catch {
      // User cancelled or share failed — fall through to clipboard
    }
  }

  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return { success: true, copied: true };
    } catch {
      return { success: false };
    }
  }

  return { success: false };
}
