/**
 * Celebration System — Confetti, modal popups, and haptic feedback.
 * Triggered on XP gains, badge unlocks, rank ups, etc.
 */

import { qs } from '../utils/dom.ts';
import { playSound } from './sound.ts';
import type { RankTier } from './ranks.ts';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rot: number;
  rotSpeed: number;
  life: number;
  decay: number;
}

/**
 * Shows a celebration modal with emoji, title, and XP.
 * @param title - Main celebration text
 * @param subtitle - Secondary text
 * @param emoji - Display emoji
 * @param silent - Skip sound
 * @param xp - Optional XP reward amount
 */
export function showCelebrate(
  title: string,
  subtitle: string,
  emoji = '🎉',
  silent = false,
  xp: number | string | null = null,
): void {
  if (!silent) playSound('success');

  const container = qs<HTMLElement>('#celebrate');
  const elTitle = qs<HTMLElement>('#cel-title');
  const elSub = qs<HTMLElement>('#cel-sub');
  const elEmoji = qs<HTMLElement>('#cel-emoji');
  const elXp = qs<HTMLElement>('#cel-xp');

  if (elTitle) elTitle.textContent = title;
  if (elSub) elSub.textContent = subtitle || 'Keep the momentum';
  if (elEmoji) elEmoji.textContent = emoji;

  if (elXp) {
    if (xp !== null && xp !== undefined) {
      elXp.textContent = typeof xp === 'number' ? `+${xp} XP` : xp;
      elXp.classList.remove('hidden');
    } else {
      elXp.classList.add('hidden');
    }
  }

  if (container) container.classList.add('show');
  if (navigator.vibrate) navigator.vibrate([60, 30, 60]);

  setTimeout(() => {
    if (container) container.classList.remove('show');
  }, 2200);
}

/**
 * Hides the celebration modal immediately.
 */
export function hideCelebrate(): void {
  const container = qs<HTMLElement>('#celebrate');
  if (container) container.classList.remove('show');
}

/**
 * Shows the rank-up modal.
 * @param rank - Rank tier object
 */
export function showRankUp(rank: RankTier): void {
  const overlay = qs<HTMLElement>('#rank-overlay');
  const emoji = qs<HTMLElement>('#rank-up-emoji');
  const title = qs<HTMLElement>('#rank-up-title');
  const newName = qs<HTMLElement>('#rank-up-new');
  const sub = qs<HTMLElement>('#rank-up-sub');

  if (emoji) emoji.textContent = rank.icon;
  if (title) title.textContent = 'Rank Up!';
  if (newName) newName.textContent = rank.name;
  if (sub)
    sub.textContent = `You have ascended to ${rank.rarity.toUpperCase()} tier. Your brain is evolving.`;

  if (overlay) overlay.classList.add('show');
  if (navigator.vibrate) navigator.vibrate([80, 40, 80, 40, 120]);
}

/**
 * Hides the rank-up modal.
 */
export function hideRankUp(): void {
  const overlay = qs<HTMLElement>('#rank-overlay');
  if (overlay) overlay.classList.remove('show');
}

/**
 * Fires confetti animation on a canvas.
 * @param canvas - Canvas element
 */
export function fireConfetti(canvas: HTMLCanvasElement): void {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ['#00d9ff', '#a855f7', '#ffd740', '#00e676', '#ff5252'];
  const particles: Particle[] = [];

  for (let i = 0; i < 80; i++) {
    particles.push({
      x: canvas.width / 2,
      y: canvas.height / 2,
      vx: (Math.random() - 0.5) * 12,
      vy: (Math.random() - 1) * 12,
      size: Math.random() * 6 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 10,
      life: 1,
      decay: Math.random() * 0.02 + 0.01,
    });
  }

  function draw(): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;

    for (const p of particles) {
      if (p.life <= 0) continue;
      alive = true;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.2;
      p.life -= p.decay;
      p.rot += p.rotSpeed;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }

    if (alive) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  draw();
  playSound('rank');
}
