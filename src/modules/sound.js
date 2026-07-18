/**
 * Sound Engine — Web Audio API based sound effects.
 * No external files needed — generates tones programmatically.
 */

let audioCtx = null;

/**
 * Gets or creates the AudioContext.
 * @returns {AudioContext|null}
 */
function getAudioContext() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * Plays a sound effect.
 * @param {string} type - 'success' | 'rank' | 'tick' | 'click'
 */
export function playSound(type) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const doPlay = () => {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;

      switch (type) {
        case 'success':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(523, now);
          osc.frequency.setValueAtTime(659, now + 0.1);
          osc.frequency.setValueAtTime(784, now + 0.2);
          break;
        case 'rank':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(392, now);
          osc.frequency.setValueAtTime(523, now + 0.15);
          osc.frequency.setValueAtTime(659, now + 0.3);
          osc.frequency.setValueAtTime(784, now + 0.45);
          osc.frequency.setValueAtTime(1047, now + 0.6);
          break;
        case 'tick':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(800, now);
          break;
        default:
          osc.type = 'sine';
          osc.frequency.setValueAtTime(440, now);
      }

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc.start();
      osc.stop(now + 0.45);
    } catch {
      // Audio playback failed silently
    }
  };

  if (ctx.state === 'suspended') {
    ctx.resume().then(doPlay).catch(doPlay);
  } else {
    doPlay();
  }
}
