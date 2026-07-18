/**
 * Focus Timer — Pomodoro (25min), Deep Work (52min), Flow State (90min).
 * Tracks sessions, awards XP, and triggers flow state after 3 sessions.
 */

import { data, persist } from './data.js';
import { todayStr } from '../utils/date.js';
import { addXP } from './xp.js';

export const TIMER_MODES = [
  { minutes: 25, label: 'Pomodoro', xp: 40 },
  { minutes: 52, label: 'Deep Work', xp: 60 },
  { minutes: 90, label: 'Flow State', xp: 100 },
];

let currentMode = 0;
let remainingSeconds = TIMER_MODES[0].minutes * 60;
let totalSeconds = remainingSeconds;
let intervalId = null;
let isRunning = false;

/**
 * Sets the timer mode.
 * @param {number} modeIndex - Index into TIMER_MODES
 */
export function setMode(modeIndex) {
  if (modeIndex < 0 || modeIndex >= TIMER_MODES.length) return;
  stopTimer();
  currentMode = modeIndex;
  const mins = TIMER_MODES[modeIndex].minutes;
  remainingSeconds = mins * 60;
  totalSeconds = remainingSeconds;
}

/**
 * Starts or resumes the timer.
 */
export function startTimer() {
  if (isRunning) return;
  isRunning = true;

  intervalId = setInterval(() => {
    remainingSeconds--;
    notifyTick();

    if (remainingSeconds <= 0) {
      completeSession();
    }
  }, 1000);
}

/**
 * Pauses the timer.
 */
export function pauseTimer() {
  isRunning = false;
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

/**
 * Stops and resets the timer to mode start.
 */
export function stopTimer() {
  pauseTimer();
  const mins = TIMER_MODES[currentMode].minutes;
  remainingSeconds = mins * 60;
  totalSeconds = remainingSeconds;
}

/**
 * Handles session completion — awards XP, records session, updates flow.
 */
function completeSession() {
  pauseTimer();
  const mode = TIMER_MODES[currentMode];
  const today = todayStr();

  // Update focus minutes
  data.focusMinutes = (data.focusMinutes || 0) + mode.minutes;
  data.totalFocusMinutes = (data.totalFocusMinutes || 0) + mode.minutes;
  data.focusDate = today;

  // Record session
  data.sessions.push({
    date: today,
    time: Date.now(),
    duration: mode.minutes,
  });

  // Update flow state
  if (data.flowState.date !== today) {
    data.flowState = { date: today, sessions: 0 };
  }
  data.flowState.sessions = (data.flowState.sessions || 0) + 1;

  // Auto-check daily check #6 (neural training)
  data.dailyChecks.dc6 = true;

  persistMany(['focusMinutes', 'totalFocusMinutes', 'focusDate', 'sessions', 'flowState', 'dailyChecks']);

  // Award XP
  addXP(mode.minutes >= 52 ? 60 : 40, 'Deep Work XP');

  // Reset timer
  remainingSeconds = mode.minutes * 60;
  totalSeconds = remainingSeconds;

  notifyComplete(mode);
}

/**
 * Gets current timer state.
 * @returns {{minutes: number, seconds: number, total: number, running: boolean, mode: number}}
 */
export function getTimerState() {
  return {
    minutes: Math.floor(remainingSeconds / 60),
    seconds: remainingSeconds % 60,
    total: totalSeconds,
    running: isRunning,
    mode: currentMode,
    modeLabel: TIMER_MODES[currentMode].label,
  };
}

/**
 * Gets recent focus sessions (most recent first).
 * @param {number} [limit=10]
 * @returns {object[]}
 */
export function getRecentSessions(limit = 10) {
  return data.sessions.slice().reverse().slice(0, limit);
}

/**
 * Checks if flow state (3+ sessions) is active.
 * @returns {boolean}
 */
export function isFlowActive() {
  return data.flowState.date === todayStr() && data.flowState.sessions >= 3;
}

// --- Event callbacks (set by UI layer) ---
let onTickCallback = () => {};
let onCompleteCallback = () => {};

export function onTick(fn) {
  onTickCallback = fn;
}
export function onComplete(fn) {
  onCompleteCallback = fn;
}

function notifyTick() {
  onTickCallback(getTimerState());
}
function notifyComplete(mode) {
  onCompleteCallback(mode);
}

function persistMany(keys) {
  keys.forEach((k) => persist(k));
}
