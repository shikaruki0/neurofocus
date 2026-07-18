/**
 * Urge Surfing Timer — 20-minute countdown for urge resistance.
 * Based on the technique that urges peak at 20-30 min then fade.
 */

const DEFAULT_DURATION = 20 * 60; // 20 minutes in seconds
let remainingSeconds = DEFAULT_DURATION;
let totalSeconds = DEFAULT_DURATION;
let intervalId = null;
let isRunning = false;
let onTickCallback = () => {};
let onCompleteCallback = () => {};

/**
 * Starts the urge timer.
 */
export function startTimer() {
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
export function resetTimer() {
  stopTimer();
  remainingSeconds = DEFAULT_DURATION;
  totalSeconds = DEFAULT_DURATION;
}

function stopTimer() {
  isRunning = false;
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function completeTimer() {
  stopTimer();
  remainingSeconds = DEFAULT_DURATION;
  totalSeconds = DEFAULT_DURATION;
  onCompleteCallback();
}

/**
 * Gets current timer state.
 * @returns {{minutes: number, seconds: number, total: number, running: boolean, pct: number}}
 */
export function getState() {
  return {
    minutes: Math.floor(remainingSeconds / 60),
    seconds: remainingSeconds % 60,
    total: totalSeconds,
    running: isRunning,
    pct: (remainingSeconds / totalSeconds) * 100,
  };
}

export function onTick(fn) {
  onTickCallback = fn;
}
export function onComplete(fn) {
  onCompleteCallback = fn;
}
