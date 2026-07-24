import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clearEl, createEl, qs, qsa, setHTML, setText, toggleClass } from '../src/utils/dom.ts';
import {
  getState as getUrgeState,
  onComplete as onUrgeComplete,
  onTick as onUrgeTick,
  resetTimer as resetUrgeTimer,
  startTimer as startUrgeTimer,
} from '../src/modules/urge.ts';
import { playSound } from '../src/modules/sound.ts';
import {
  fireConfetti,
  hideCelebrate,
  hideRankUp,
  showCelebrate,
  showRankUp,
} from '../src/modules/celebration.ts';
import type { RankTier } from '../src/modules/ranks.ts';

beforeEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  resetUrgeTimer();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetUrgeTimer();
});

describe('DOM utilities', () => {
  it('creates, queries, updates, and clears elements safely', () => {
    const onClick = vi.fn();
    const child = createEl('span', { className: 'child' }, 'Child');
    const button = createEl(
      'button',
      { id: 'cta', className: 'btn', dataset: { action: 'save' }, onClick },
      'Save ',
      child,
    );
    document.body.append(button);

    expect(qs<HTMLButtonElement>('#cta')).toBe(button);
    expect(qsa('.child')).toHaveLength(1);
    expect(button.dataset.action).toBe('save');

    button.click();
    expect(onClick).toHaveBeenCalledOnce();

    toggleClass(button, 'active', true);
    expect(button.classList.contains('active')).toBe(true);

    setText(child, 'Updated');
    expect(child.textContent).toBe('Updated');

    setHTML(child, '<strong>Trusted</strong>');
    expect(child.querySelector('strong')?.textContent).toBe('Trusted');

    clearEl(button);
    expect(button.innerHTML).toBe('');

    expect(qs('.missing')).toBeNull();
    expect(() => toggleClass(null, 'x', true)).not.toThrow();
    expect(() => setText(null, 'x')).not.toThrow();
    expect(() => setHTML(null, 'x')).not.toThrow();
    expect(() => clearEl(null)).not.toThrow();
  });
});

describe('Urge surfing timer', () => {
  it('ticks, reports progress, prevents duplicate starts, completes, and resets', () => {
    vi.useFakeTimers();
    const tick = vi.fn();
    const complete = vi.fn();
    onUrgeTick(tick);
    onUrgeComplete(complete);

    expect(getUrgeState()).toMatchObject({ minutes: 20, seconds: 0, running: false, pct: 100 });

    startUrgeTimer();
    startUrgeTimer();
    expect(getUrgeState().running).toBe(true);

    vi.advanceTimersByTime(1000);
    expect(tick).toHaveBeenCalledTimes(1);
    expect(getUrgeState()).toMatchObject({ minutes: 19, seconds: 59, running: true });

    vi.advanceTimersByTime(20 * 60 * 1000);
    expect(complete).toHaveBeenCalledOnce();
    expect(getUrgeState()).toMatchObject({ minutes: 20, seconds: 0, running: false });

    startUrgeTimer();
    vi.advanceTimersByTime(1000);
    resetUrgeTimer();
    expect(getUrgeState()).toMatchObject({ minutes: 20, seconds: 0, running: false });
  });
});

describe('Sound engine', () => {
  it('does nothing when Web Audio is unavailable', () => {
    Object.defineProperty(window, 'AudioContext', { value: undefined, configurable: true });
    expect(() => playSound('success')).not.toThrow();
  });

  it('plays generated tones with a supported AudioContext', async () => {
    const started: string[] = [];
    class FakeAudioContext {
      state = 'suspended';
      currentTime = 1;
      destination = {};
      createOscillator() {
        return {
          type: 'sine',
          frequency: { setValueAtTime: vi.fn() },
          connect: vi.fn(),
          start: () => started.push('start'),
          stop: vi.fn(),
        };
      }
      createGain() {
        return {
          gain: {
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
        };
      }
      resume() {
        this.state = 'running';
        return Promise.resolve();
      }
    }

    Object.defineProperty(window, 'AudioContext', { value: FakeAudioContext, configurable: true });

    playSound('rank');
    await Promise.resolve();
    playSound('tick');
    playSound('click');

    expect(started.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Celebration UI', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'vibrate', { value: vi.fn(), configurable: true });
    document.body.innerHTML = `
      <div id="celebrate"><div id="cel-title"></div><div id="cel-sub"></div><div id="cel-emoji"></div><div id="cel-xp" class="hidden"></div></div>
      <div id="rank-overlay"><div id="rank-up-emoji"></div><div id="rank-up-title"></div><div id="rank-up-new"></div><div id="rank-up-sub"></div></div>
    `;
  });

  it('shows and hides celebration and rank-up modals', () => {
    showCelebrate('Win', '', '🏆', true, 25);
    expect(qs('#celebrate')?.classList.contains('show')).toBe(true);
    expect(qs('#cel-title')?.textContent).toBe('Win');
    expect(qs('#cel-sub')?.textContent).toBe('Keep the momentum');
    expect(qs('#cel-xp')?.textContent).toBe('+25 XP');

    vi.advanceTimersByTime(2200);
    expect(qs('#celebrate')?.classList.contains('show')).toBe(false);

    showCelebrate('Quiet', 'Done', '✅', true);
    expect(qs('#cel-xp')?.classList.contains('hidden')).toBe(true);
    hideCelebrate();
    expect(qs('#celebrate')?.classList.contains('show')).toBe(false);

    const rank: RankTier = {
      level: 5,
      name: 'Apprentice',
      icon: '📖',
      rarity: 'common',
      color: '#fff',
    };
    showRankUp(rank);
    expect(qs('#rank-overlay')?.classList.contains('show')).toBe(true);
    expect(qs('#rank-up-new')?.textContent).toBe('Apprentice');
    hideRankUp();
    expect(qs('#rank-overlay')?.classList.contains('show')).toBe(false);
  });

  it('handles confetti canvas without a drawing context', () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(null);
    expect(() => fireConfetti(canvas)).not.toThrow();
  });
});
