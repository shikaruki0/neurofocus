/**
 * Sound Engine v2 — Web Audio API based sound effects + Alarm System.
 * Generates tones programmatically (no external files) — works offline/PWA.
 * Supports 4 sound packs, volume control, loop-until-dismiss.
 */

import { data, persist } from './data.ts';
import type { SoundSettings } from './data.ts';

let audioCtx: AudioContext | null = null;

type LegacySoundType = 'success' | 'rank' | 'tick' | 'click';
export type SoundPack = SoundSettings['pack']; // 'pop' | 'bell' | 'chime' | 'zen'
export type AlarmType = 'focusComplete' | 'urgeComplete' | 'success' | 'rank' | 'tick' | 'click' | 'warning' | 'test' | 'pop';

let alarmLoopTimer: number | null = null;
let titleFlashTimer: number | null = null;
let originalTitle: string = typeof document !== 'undefined' ? document.title : 'NeuroFocusX';
let isFlashingTitle = false;

// ------------------------------------------------------------------
// AudioContext helpers
// ------------------------------------------------------------------

function getAudioContext(): AudioContext | null {
  try {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    return audioCtx;
  } catch {
    return null;
  }
}

async function ensureAudioReady(): Promise<AudioContext | null> {
  const ctx = getAudioContext();
  if (!ctx) return null;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      // resume failed, still try to play
    }
  }
  return ctx;
}

function currentSoundSettings(): SoundSettings {
  const s = data.soundSettings as SoundSettings;
  return {
    enabled: s?.enabled ?? true,
    volume: Math.min(1, Math.max(0, s?.volume ?? 0.8)),
    pack: (s?.pack as SoundPack) || 'pop',
    loop: s?.loop ?? true,
    notifications: s?.notifications ?? true,
    vibration: s?.vibration ?? true,
  };
}

export function getSoundSettings(): SoundSettings {
  return { ...currentSoundSettings() };
}

export function updateSoundSettings(patch: Partial<SoundSettings>): SoundSettings {
  const current = currentSoundSettings();
  const next: SoundSettings = { ...current, ...patch };
  // clamp volume
  next.volume = Math.min(1, Math.max(0, next.volume));
  (data.soundSettings as SoundSettings) = next;
  persist('soundSettings');
  return next;
}

// ------------------------------------------------------------------
// Low-level tone player
// ------------------------------------------------------------------

interface Tone {
  freq: number;
  at: number; // offset seconds from now
  duration: number;
  type?: OscillatorType;
  gain?: number;
}

function playTones(tones: Tone[], volumeScale = 1): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const settings = currentSoundSettings();
  if (!settings.enabled && volumeScale < 0.9) return; // allow test even if disabled? but check caller

  const baseVolume = Math.min(1, Math.max(0, settings.volume)) * volumeScale;

  const doPlay = (): void => {
    try {
      const now = ctx.currentTime;
      tones.forEach((t) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = t.type || 'sine';
        osc.frequency.setValueAtTime(t.freq, now + t.at);
        const g = (t.gain ?? 0.5) * baseVolume;
        gain.gain.setValueAtTime(Math.min(1, g), now + t.at);
        gain.gain.exponentialRampToValueAtTime(0.001, now + t.at + t.duration);
        osc.start(now + t.at);
        osc.stop(now + t.at + t.duration + 0.05);
      });
    } catch {
      // silent fail
    }
  };

  if (ctx.state === 'suspended') {
    ctx.resume().then(doPlay).catch(doPlay);
  } else {
    doPlay();
  }
}

// ------------------------------------------------------------------
// Sound Pack Definitions — loud, punchy, unmissable
// ------------------------------------------------------------------

// Pop: sharp double-pop like iOS timer — attention grabbing
function tonesPop(): Tone[] {
  return [
    { freq: 1200, at: 0, duration: 0.18, type: 'square', gain: 0.8 },
    { freq: 800, at: 0.02, duration: 0.2, type: 'sine', gain: 0.6 },
    { freq: 1400, at: 0.12, duration: 0.22, type: 'square', gain: 0.7 },
    { freq: 900, at: 0.14, duration: 0.25, type: 'triangle', gain: 0.5 },
  ];
}

function tonesBell(): Tone[] {
  // Temple bell — rich harmonic
  return [
    { freq: 523, at: 0, duration: 1.2, type: 'sine', gain: 0.7 },
    { freq: 659, at: 0.05, duration: 1.0, type: 'sine', gain: 0.5 },
    { freq: 784, at: 0.08, duration: 0.9, type: 'triangle', gain: 0.4 },
    { freq: 1046, at: 0.12, duration: 0.6, type: 'sine', gain: 0.3 },
  ];
}

function tonesChime(): Tone[] {
  return [
    { freq: 659, at: 0, duration: 0.5, type: 'sine', gain: 0.6 },
    { freq: 784, at: 0.15, duration: 0.6, type: 'sine', gain: 0.6 },
    { freq: 1047, at: 0.3, duration: 0.8, type: 'sine', gain: 0.7 },
    { freq: 1318, at: 0.45, duration: 1.0, type: 'sine', gain: 0.5 },
  ];
}

function tonesZen(): Tone[] {
  return [
    { freq: 432, at: 0, duration: 2.0, type: 'sine', gain: 0.6 },
    { freq: 864, at: 0.05, duration: 1.5, type: 'triangle', gain: 0.25 },
    { freq: 1296, at: 0.1, duration: 1.2, type: 'sine', gain: 0.15 },
  ];
}

function tonesForPack(pack: SoundPack): Tone[] {
  switch (pack) {
    case 'bell':
      return tonesBell();
    case 'chime':
      return tonesChime();
    case 'zen':
      return tonesZen();
    case 'pop':
    default:
      return tonesPop();
  }
}

// Focus complete is LOUDER and more celebratory — based on pack + extra layer
function tonesFocusComplete(pack: SoundPack): Tone[] {
  const base = tonesForPack(pack);
  // Add extra celebratory lift
  const extra: Tone[] =
    pack === 'pop'
      ? [
          { freq: 600, at: 0.28, duration: 0.4, type: 'sine', gain: 0.8 },
          { freq: 900, at: 0.38, duration: 0.5, type: 'sine', gain: 0.7 },
          { freq: 1200, at: 0.5, duration: 0.6, type: 'sine', gain: 0.6 },
        ]
      : pack === 'bell'
        ? [{ freq: 1568, at: 0.6, duration: 1.0, type: 'sine', gain: 0.4 }]
        : pack === 'chime'
          ? [{ freq: 1568, at: 0.65, duration: 1.2, type: 'sine', gain: 0.6 }]
          : [{ freq: 528, at: 0.5, duration: 1.5, type: 'sine', gain: 0.4 }];

  return [...base, ...extra];
}

function tonesUrgeComplete(): Tone[] {
  // Soothing wave finish — not alarming
  return [
    { freq: 432, at: 0, duration: 1.0, type: 'sine', gain: 0.5 },
    { freq: 528, at: 0.2, duration: 1.2, type: 'sine', gain: 0.5 },
    { freq: 639, at: 0.4, duration: 1.0, type: 'triangle', gain: 0.4 },
  ];
}

// ------------------------------------------------------------------
// Public API
// ------------------------------------------------------------------

export function playSound(type: LegacySoundType | AlarmType): void {
  const settings = currentSoundSettings();
  if (!settings.enabled && type !== 'test') return;

  switch (type) {
    case 'success':
      playTones(
        [
          { freq: 523, at: 0, duration: 0.35, type: 'sine', gain: 0.5 },
          { freq: 659, at: 0.1, duration: 0.35, type: 'sine', gain: 0.5 },
          { freq: 784, at: 0.2, duration: 0.5, type: 'sine', gain: 0.6 },
        ],
        0.7,
      );
      break;
    case 'rank':
      playTones(
        [
          { freq: 392, at: 0, duration: 0.4, type: 'sine', gain: 0.5 },
          { freq: 523, at: 0.15, duration: 0.4, type: 'sine', gain: 0.5 },
          { freq: 659, at: 0.3, duration: 0.4, type: 'sine', gain: 0.5 },
          { freq: 784, at: 0.45, duration: 0.4, type: 'sine', gain: 0.5 },
          { freq: 1047, at: 0.6, duration: 0.6, type: 'sine', gain: 0.6 },
        ],
        0.7,
      );
      break;
    case 'tick':
      playTones([{ freq: 800, at: 0, duration: 0.15, type: 'sine', gain: 0.25 }], 0.5);
      break;
    case 'click':
      playTones([{ freq: 1200, at: 0, duration: 0.12, type: 'square', gain: 0.3 }], 0.4);
      break;
    case 'warning':
      playTones(
        [
          { freq: 880, at: 0, duration: 0.3, type: 'square', gain: 0.6 },
          { freq: 0, at: 0.3, duration: 0.1, type: 'sine', gain: 0 },
          { freq: 880, at: 0.4, duration: 0.3, type: 'square', gain: 0.6 },
        ],
        1,
      );
      break;
    case 'pop':
      playTones(tonesPop(), 1);
      break;
    case 'focusComplete':
      playFocusComplete();
      break;
    case 'urgeComplete':
      playUrgeComplete();
      break;
    default:
      playTones([{ freq: 440, at: 0, duration: 0.3, type: 'sine', gain: 0.4 }], 0.6);
  }
}

export async function playFocusComplete(packOverride?: SoundPack): Promise<void> {
  const settings = currentSoundSettings();
  if (!settings.enabled) return;
  await ensureAudioReady();
  const pack = packOverride || settings.pack || 'pop';
  playTones(tonesFocusComplete(pack), 1.0);
}

export async function playUrgeComplete(): Promise<void> {
  const settings = currentSoundSettings();
  if (!settings.enabled) return;
  await ensureAudioReady();
  playTones(tonesUrgeComplete(), 0.85);
}

export async function playTestSound(pack: SoundPack = 'pop'): Promise<void> {
  await ensureAudioReady();
  // Always play test even if disabled, but use current volume
  const settings = currentSoundSettings();
  const vol = Math.max(0.3, settings.volume); // ensure audible even if volume low
  playTones(tonesFocusComplete(pack), vol);
}

// ------------------------------------------------------------------
// Alarm Loop System — pop every 2s until dismissed
// ------------------------------------------------------------------

export function startAlarmLoop(
  type: AlarmType = 'focusComplete',
  intervalMs = 2200,
  packOverride?: SoundPack,
): void {
  stopAlarmLoop(); // clear previous

  const settings = currentSoundSettings();
  // If looping disabled, just play once
  if (!settings.loop) {
    if (type === 'focusComplete') void playFocusComplete(packOverride);
    else if (type === 'urgeComplete') void playUrgeComplete();
    else playSound(type);
    return;
  }

  // Play immediately
  const playOnce = (): void => {
    const s = currentSoundSettings();
    if (!s.enabled) return;
    const pack = packOverride || s.pack;
    if (type === 'focusComplete') void playFocusComplete(pack);
    else if (type === 'urgeComplete') void playUrgeComplete();
    else playSound(type);

    if (s.vibration && navigator.vibrate) {
      navigator.vibrate([200, 100, 200]);
    }
  };

  playOnce();

  // Then repeat
  alarmLoopTimer = window.setInterval(() => {
    const s = currentSoundSettings();
    if (!s.enabled) {
      stopAlarmLoop();
      return;
    }
    playOnce();
  }, intervalMs);
}

export function stopAlarmLoop(): void {
  if (alarmLoopTimer !== null) {
    clearInterval(alarmLoopTimer);
    alarmLoopTimer = null;
  }
  if (navigator.vibrate) navigator.vibrate(0);
}

export function isAlarmLooping(): boolean {
  return alarmLoopTimer !== null;
}

// ------------------------------------------------------------------
// Title Flash
// ------------------------------------------------------------------

export function startTitleFlash(alertText = "🔔 Time's Up!"): void {
  stopTitleFlash();
  if (typeof document === 'undefined') return;
  originalTitle = document.title;
  isFlashingTitle = true;
  let showAlert = true;

  titleFlashTimer = window.setInterval(() => {
    if (!isFlashingTitle) return;
    document.title = showAlert ? `${alertText} - ${originalTitle}` : originalTitle;
    showAlert = !showAlert;
  }, 900);
}

export function stopTitleFlash(): void {
  isFlashingTitle = false;
  if (titleFlashTimer !== null) {
    clearInterval(titleFlashTimer);
    titleFlashTimer = null;
  }
  if (typeof document !== 'undefined' && originalTitle) {
    document.title = originalTitle;
  }
}

// ------------------------------------------------------------------
// Vibration patterns
// ------------------------------------------------------------------

export function vibrateStrong(): void {
  const settings = currentSoundSettings();
  if (!settings.vibration) return;
  if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);
}

export function vibrateSoft(): void {
  const settings = currentSoundSettings();
  if (!settings.vibration) return;
  if (navigator.vibrate) navigator.vibrate([60, 30, 60]);
}

export function stopVibration(): void {
  if (navigator.vibrate) navigator.vibrate(0);
}

// ------------------------------------------------------------------
// Cleanup on visibility/page hide
// ------------------------------------------------------------------

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    // Don't auto-stop loop when hidden — we WANT it to continue when tab hidden
    // Only stop title flash when visible again and user returned
    if (document.visibilityState === 'visible' && !isAlarmLooping()) {
      stopTitleFlash();
    }
  });
}
