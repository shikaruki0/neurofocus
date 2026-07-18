/**
 * Celebration System — Confetti, modal popups, and haptic feedback.
 * Triggered on XP gains, badge unlocks, rank ups, etc.
 */

import { qs } from '../utils/dom.js';
import { playSound } from './sound.js';

/**
 * Shows a celebration modal with emoji, title, and XP.
 * @param {string} title - Main celebration text
 * @param {string} subtitle - Secondary text
 * @param {string} [emoji='🎉'] - Display emoji
 * @param {boolean} [silent=false] - Skip sound
 */
export function showCelebrate(title, subtitle, emoji = '🎉', silent = false) {
  if (!silent) playSound('success');

  const container = qs('#celebrate');
  const elTitle = qs('#cel-title');
  const elSub = qs('#cel-sub');
  const elEmoji = qs('#cel-emoji');
  const elXp = qs('#cel-xp');

  if (elTitle) elTitle.textContent = title;
  if (elSub) elSub.textContent = subtitle || 'Keep the momentum';
  if (elEmoji) elEmoji.textContent = emoji;
  if (elXp) elXp.textContent = subtitle;

  if (container) container.classList.add('show');
  if (navigator.vibrate) navigator.vibrate([60, 30, 60]);

  setTimeout(() => {
    if (container) container.classList.remove('show');
  }, 2200);
}

/**
 * Hides the celebration modal immediately.
 */
export function hideCelebrate() {
  const container = qs('#celebrate');
  if (container) container.classList.remove('show');
}

/**
 * Shows the rank-up modal.
 * @param {object} rank - Rank tier object {icon, name, rarity}
 */
export function showRankUp(rank) {
  const overlay = qs('#rank-overlay');
  const emoji = qs('#rank-up-emoji');
  const title = qs('#rank-up-title');
  const newName = qs('#rank-up-new');
  const sub = qs('#rank-up-sub');

  if (emoji) emoji.textContent = rank.icon;
  if (title) title.textContent = 'Rank Up!';
  if (newName) newName.textContent = rank.name;
  if (sub) sub.textContent = `You have ascended to ${rank.rarity.toUpperCase()} tier. Your brain is evolving.`;

  if (overlay) overlay.classList.add('show');
  if (navigator.vibrate) navigator.vibrate([80, 40, 80, 40, 120]);
}

/**
 * Hides the rank-up modal.
 */
export function hideRankUp() {
  const overlay = qs('#rank-overlay');
  if (overlay) overlay.classList.remove('show');
}

/**
 * Fires confetti animation on a canvas.
 * @param {HTMLCanvasElement} canvas
 */
export function fireConfetti(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ['#00d9ff', '#a855f7', '#ffd740', '#00e676', '#ff5252'];
  const particles = [];

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

  function draw() {
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
