/**
 * Urge Surfing Timer — 20-minute countdown for urge resistance.
 * Based on the technique that urges peak at 20-30 min then fade.
 */

const DEFAULT_DURATION = 20 * 60; // 20 minutes in seconds
let remainingSeconds = DEFAULT_DURATION;
let totalSeconds = DEFAULT_DURATION;
let intervalId: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

export interface UrgeState {
  minutes: number;
  seconds: number;
  total: number;
  running: boolean;
  pct: number;
}

let onTickCallback: (state: UrgeState) => void = () => {};
let onCompleteCallback: () => void = () => {};

/**
 * Starts the urge timer.
 */
export function startTimer(): void {
  if (isRunning) return;
  isRunning = true;

  intervalId = setInterval(() => {
    remainingSeconds--;
    onTickCallback(getState());

    if (remainingSeconds <= 0) {
      completeTimer();
    }
  }, 1000);
}

/**
 * Resets the timer to 20:00.
 */
export function resetTimer(): void {
  stopTimer();
  remainingSeconds = DEFAULT_DURATION;
  totalSeconds = DEFAULT_DURATION;
}

function stopTimer(): void {
  isRunning = false;
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function completeTimer(): void {
  stopTimer();
  remainingSeconds = DEFAULT_DURATION;
  totalSeconds = DEFAULT_DURATION;
  onCompleteCallback();
}

/**
 * Gets current timer state.
 * @returns Urge state
 */
export function getState(): UrgeState {
  return {
    minutes: Math.floor(remainingSeconds / 60),
    seconds: remainingSeconds % 60,
    total: totalSeconds,
    running: isRunning,
    pct: (remainingSeconds / totalSeconds) * 100,
  };
}

export function onTick(fn: (state: UrgeState) => void): void {
  onTickCallback = fn;
}
export function onComplete(fn: () => void): void {
  onCompleteCallback = fn;
}
