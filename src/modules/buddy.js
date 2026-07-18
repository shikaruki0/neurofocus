/**
 * Accountability Partner — Share progress with a friend/mentor.
 * Uses Web Share API with clipboard fallback.
 */

import { data, persist } from './data.js';
import { xpLevel } from './xp.js';
import { getCurrentRank } from './ranks.js';
import { validateBuddyName } from '../utils/validation.js';

/**
 * Sets the accountability partner name.
 * @param {string} name
 * @returns {{success: boolean, error?: string}}
 */
export function setBuddy(name) {
  const validation = validateBuddyName(name);
  if (!validation.valid) return { success: false, error: validation.error };

  data.buddyName = validation.data;
  persist('buddyName');
  return { success: true };
}

/**
 * Removes the accountability partner.
 */
export function removeBuddy() {
  data.buddyName = '';
  persist('buddyName');
}

/**
 * Gets the buddy name.
 * @returns {string}
 */
export function getBuddy() {
  return data.buddyName || '';
}

/**
 * Generates a progress summary for sharing.
 * @returns {string}
 */
export function generateShareText() {
  const rank = getCurrentRank(xpLevel(data.xp).level);
  const info = xpLevel(data.xp);
  const remaining = data.backlogs.reduce(
    (sum, b) => sum + ((b.total || 0) - (b.done || 0)),
    0,
  );

  return [
    '🔥 NeuroFocus Progress',
    `Rank: ${rank.name} (Level ${info.level})`,
    `Streak: ${data.consecutiveStreak} days`,
    `Focus: ${Math.floor((data.totalFocusMinutes || 0) / 60)}h total`,
    `Backlogs: ${remaining} left`,
    '',
    `Accountability partner: ${data.buddyName}`,
  ].join('\n');
}

/**
 * Shares progress via Web Share API or clipboard.
 * @returns {Promise<{success: boolean}>}
 */
export async function shareProgress() {
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
