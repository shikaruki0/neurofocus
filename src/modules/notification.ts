/**
 * Notification System — Browser Notification + Permission handling
 * Works for Time's Up alerts even when tab is hidden.
 * PWA friendly, no external dependencies.
 */

import { data, persist } from './data.ts';
import type { SoundSettings } from './data.ts';

export type NotificationPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

function getSoundSettingsSafe(): SoundSettings {
  const s = data.soundSettings as SoundSettings;
  return {
    enabled: s?.enabled ?? true,
    volume: s?.volume ?? 0.8,
    pack: s?.pack ?? 'pop',
    loop: s?.loop ?? true,
    notifications: s?.notifications ?? true,
    vibration: s?.vibration ?? true,
  };
}

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermissionState {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission as NotificationPermissionState;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!isNotificationSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';

  try {
    const perm = await Notification.requestPermission();
    return perm as NotificationPermissionState;
  } catch {
    return getNotificationPermission();
  }
}

export function updateNotificationSetting(enabled: boolean): void {
  const current = getSoundSettingsSafe();
  (data.soundSettings as SoundSettings) = { ...current, notifications: enabled };
  persist('soundSettings');
}

interface ShowNotificationOptions {
  title: string;
  body: string;
  tag?: string;
  renotify?: boolean;
  requireInteraction?: boolean;
  silent?: boolean; // we play our own sound
}

export function showNotification(opts: ShowNotificationOptions): Notification | null {
  const settings = getSoundSettingsSafe();
  if (!settings.notifications) return null;
  if (!isNotificationSupported()) return null;
  if (Notification.permission !== 'granted') return null;

  try {
    const n = new Notification(opts.title, {
      body: opts.body,
      tag: opts.tag || 'neurofocus-timeup',
      requireInteraction: opts.requireInteraction ?? !!settings.loop,
      silent: opts.silent ?? true, // we handle sound ourselves
      icon: '/icon-192.png',
      badge: '/favicon.svg',
    } as NotificationOptions & { renotify?: boolean; badge?: string });

    n.onclick = () => {
      window.focus();
      n.close();
      // Dispatch custom event so main.ts can stop alarm loop
      window.dispatchEvent(new CustomEvent('neurofocus:notification-click'));
    };

    // Auto close after 10s if not looping
    if (!settings.loop) {
      setTimeout(() => n.close(), 10000);
    }

    return n;
  } catch {
    return null;
  }
}

export function showFocusCompleteNotification(modeLabel: string, xp: number): Notification | null {
  return showNotification({
    title: `🔔 Time's Up! ${modeLabel}`,
    body: `Great work! You earned +${xp} XP. Tap to return and claim your break.`,
    tag: 'focus-complete',
    requireInteraction: getSoundSettingsSafe().loop,
  });
}

export function showUrgeCompleteNotification(): Notification | null {
  return showNotification({
    title: `🌊 Urge Surfed!`,
    body: `You are stronger than your impulse. 20 minutes conquered.`,
    tag: 'urge-complete',
    requireInteraction: false,
  });
}

export function showMissionBlockCompleteNotification(blockNumber: number, totalBlocks: number): Notification | null {
  return showNotification({
    title: `✅ Block ${blockNumber}/${totalBlocks} Complete!`,
    body: `One more win. Ready for next block?`,
    tag: 'mission-block-complete',
    requireInteraction: false,
  });
}
