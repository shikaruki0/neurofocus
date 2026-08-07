import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  startTimer,
  resetTimer,
  getState,
  onTick,
  onComplete,
  consumePendingCompletion,
} from '../src/modules/urge.ts';
import { get } from '../src/modules/storage.ts';

describe('Urge timer — deadline-based reliability (FIX C)', () => {
  beforeEach(() => {
    resetTimer();
    onTick(() => {});
    onComplete(() => {});
    vi.useRealTimers();
  });

  afterEach(() => {
    resetTimer();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // (a) 20s advance at fake timers reads 19:40
  it('counts down accurately using deadline-based calculation', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T10:00:00'));

    startTimer();
    vi.advanceTimersByTime(20_000); // 20 seconds

    const state = getState();
    expect(state.minutes).toBe(19);
    expect(state.seconds).toBe(40);
    expect(state.running).toBe(true);
  });

  // (b) persisted running state + reload simulation completes correctly exactly once
  it('persists running state and completes exactly once after reload', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T10:00:00'));

    const complete = vi.fn();
    onComplete(complete);

    startTimer();
    // Advance partway
    vi.advanceTimersByTime(10 * 60 * 1000); // 10 minutes in

    // Verify persistence
    const saved = get<{ version: number; running: boolean } | null>('urgeTimer', null);
    expect(saved).not.toBeNull();
    expect(saved!.running).toBe(true);

    // Simulate reload: reset modules and reload
    vi.resetModules();
    vi.setSystemTime(new Date('2026-07-24T10:30:01')); // well past the 20-min deadline

    const {
      startTimer: reStart,
      resetTimer: reReset,
      onComplete: reOnComplete,
      consumePendingCompletion: reConsume,
      getState: reGetState,
    } = await import('../src/modules/urge.ts');

    // Register the completion listener (as main.ts does during init)
    const reComplete = vi.fn();
    reOnComplete(reComplete);

    // Consume the pending completion that fired during restore
    const pending = reConsume();
    expect(pending).toBe(true);

    // The completion was replayed via consumePendingCompletion
    expect(reComplete).toHaveBeenCalledOnce();
    // Guard against double completion
    const secondPending = reConsume();
    expect(secondPending).toBe(false);

    expect(reGetState().running).toBe(false);
    expect(reGetState().minutes).toBe(20);

    // Clean up
    reReset();
  });

  // (c) resetTimer returns to 20:00
  it('resetTimer returns the timer to 20:00 idle', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T10:00:00'));

    startTimer();
    vi.advanceTimersByTime(5 * 60 * 1000); // 5 minutes in

    resetTimer();
    const state = getState();
    expect(state.minutes).toBe(20);
    expect(state.seconds).toBe(0);
    expect(state.running).toBe(false);
    expect(state.pct).toBe(100);
  });

  // (d) expiry while "closed" does not error and resets to 20:00
  it('expires silently on restore without errors and resets to 20:00', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T10:00:00'));

    // Start a timer and persist it
    startTimer();

    // Simulate the tab being closed and reopened after expiry
    vi.resetModules();
    vi.setSystemTime(new Date('2026-07-24T10:30:00')); // 30 min later, well past 20 min

    const {
      getState: reGetState,
      resetTimer: reReset,
      onComplete: reOnComplete,
      consumePendingCompletion: reConsume,
    } = await import('../src/modules/urge.ts');

    // No errors thrown — the timer silently completed and reset
    const state = reGetState();
    expect(state.minutes).toBe(20);
    expect(state.seconds).toBe(0);
    expect(state.running).toBe(false);

    // The pending completion is available for the UI to replay
    const reComplete = vi.fn();
    reOnComplete(reComplete);
    const pending = reConsume();
    expect(pending).toBe(true);
    expect(reComplete).toHaveBeenCalledOnce();

    // Clean up
    reReset();
  });
});
