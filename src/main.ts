/**
 * NeuroFocusX v14 — Main Entry Point (Fixed)
 * Wires modules to the DOM and initializes the app.
 * Fixes:
 *  - CSS imported via JS so Vite bundles correctly with base /neurofocusx/
 *  - Base-aware SW registration (was absolute /sw.js causing 404 on GH Pages)
 *  - Typed DOM helpers to avoid runtime dataset/style/checked errors
 *  - Null guards for dailyQuests
 *  - Fixed focus timer resume logic (done in focus.ts)
 *  - Fixed dailyChecksBuilt stale flag across days
 */

// Import styles directly so Vite bundles them correctly (fixes 404s when base is /neurofocusx/)
import './styles/variables.css';
import './styles/base.css';
import './styles/components.css';
import './styles/animations.css';

import { data, resetHabitsForNewDay } from './modules/data.ts';
import { clearAll } from './modules/storage.ts';
import { xpLevel, xpForLevel, addXP } from './modules/xp.ts';
import { getCurrentRank, getNextRank, RANK_TIERS } from './modules/ranks.ts';
import { checkBadges, SPECIAL_BADGES, TOTAL_BADGES } from './modules/badges.ts';
import { generateDailyQuests, checkQuests } from './modules/quests.ts';
import { toggleStep, getRitual, RITUAL_STEPS, RITUAL_ICONS } from './modules/ritual.ts';
import { claimStreak, useFreeze, canUseFreeze, getStreakInfo } from './modules/streak.ts';
import { getSubjectsWithInfo } from './modules/subjects.ts';
import {
  setMode,
  startTimer,
  pauseTimer,
  stopTimer,
  getTimerState,
  getRecentSessions,
  isFlowActive,
  onTick,
  onComplete,
  TIMER_MODES,
} from './modules/focus.ts';
import {
  startTimer as startUrge,
  resetTimer as resetUrge,
  getState as getUrgeState,
  onTick as onUrgeTick,
  onComplete as onUrgeComplete,
} from './modules/urge.ts';
import { addBacklog, incrementBacklog, deleteBacklog, getBacklogs } from './modules/backlogs.ts';
import { addHabit, toggleHabit, deleteHabit, getHabits } from './modules/habits.ts';
import { addTask, toggleTask, deleteTask, getTasksSorted } from './modules/battle.ts';
import { recordDailyStat, getWeekStats, getWeekTotals } from './modules/weekly.ts';
import { setBuddy, removeBuddy, getBuddy, shareProgress } from './modules/buddy.ts';
import { setTheme, loadTheme, setAutoTheme, getCurrentTheme } from './modules/theme.ts';
import { getDailyQuote } from './modules/quotes.ts';
import { showCelebrate, hideCelebrate, hideRankUp } from './modules/celebration.ts';
import { endLocalSession, isSessionStarted, startLocalSession } from './modules/session.ts';
import {
  currentUser,
  isEmailAuthConfigured,
  onAuthChange,
  restoreAuthSession,
  signInWithEmailPassword,
  signUpWithEmailPassword,
  validatePassword,
  resendConfirmationEmail,
  logout,
} from './modules/auth.ts';
import { createLocalBackup, syncOnLogin, syncNow } from './modules/cloudSync.ts';
import { exportAll } from './modules/storage.ts';
import {
  validateImportData,
  applyImport,
  readImportFile,
  MAX_IMPORT_FILE_BYTES,
} from './modules/progressImport.ts';
import { escapeHTML } from './utils/sanitize.ts';
import { qs, qsa } from './utils/dom.ts';
import { todayStr, currentDOW, DAY_LABELS } from './utils/date.ts';
import { validateProfileName, validateMission } from './utils/validation.ts';

// ===================================================================
// STATE
// ===================================================================

let selectedBacklogSubject = 'Physics';
let dailyChecksBuilt = false;
let lastDailyCheckDate = '';

// ===================================================================
// TAB NAVIGATION
// ===================================================================

function switchTab(tabId: string) {
  // Hide all tabs
  qsa<HTMLElement>('.tab-content').forEach((el) => el.classList.add('hidden'));

  // Show target tab
  const target = qs<HTMLElement>(`#tab-${tabId}`);
  if (target) {
    target.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Update nav active state
  qsa<HTMLElement>('.nav-item').forEach((btn) => {
    const b = btn as HTMLElement;
    b.classList.toggle('active', b.dataset.tab === tabId);
  });

  // Refresh home dashboard
  if (tabId === 'home') updateDashboard();
}

// ===================================================================
// RENDER FUNCTIONS
// ===================================================================

function renderXP() {
  const info = xpLevel(data.xp);
  const elCount = qs<HTMLElement>('#xp-count');
  const elBar = qs<HTMLElement>('#xp-bar');
  const elBadge = qs<HTMLElement>('#xp-badge');
  const elNext = qs<HTMLElement>('#xp-next');

  if (elCount) elCount.textContent = `${data.xp} XP`;
  if (elBar) elBar.style.width = `${info.pct}%`;
  if (elBadge) elBadge.textContent = `Level ${info.level}`;
  if (elNext) elNext.textContent = `${info.current} / ${info.need} to next`;
}

function renderHero() {
  const rank = getCurrentRank(xpLevel(data.xp).level);
  const next = getNextRank(xpLevel(data.xp).level);
  const info = xpLevel(data.xp);

  const elIcon = qs<HTMLElement>('#hero-icon');
  const elTitle = qs<HTMLElement>('#hero-title');
  const elSub = qs<HTMLElement>('#hero-sub');
  const elBadge = qs<HTMLElement>('#hero-badge');

  if (elIcon) elIcon.textContent = rank.icon;
  if (elTitle) elTitle.textContent = rank.name;
  if (elSub) elSub.textContent = `Level ${info.level} · ${info.current}/${info.need} XP`;
  if (elBadge) {
    elBadge.textContent = next
      ? `Next: ${next.name} at Level ${next.level}`
      : 'The Enlightened · Max Rank';
  }
}

function renderQuests() {
  const el = qs<HTMLElement>('#daily-quests');
  if (!el) return;

  generateDailyQuests();
  const dq = data.dailyQuests;
  if (!dq || !dq.quests) return;
  const quests = dq.quests;
  const icons = ['🎯', '⚡', '🔥'];

  el.innerHTML = quests
    .map(
      (q, i) => `
      <div class="quest-item ${q.completed ? 'done' : ''}">
        <div class="quest-icon">${icons[i]}</div>
        <div class="quest-info">
          <div class="quest-title">${escapeHTML(q.label)}</div>
          <div class="quest-reward">+${q.reward} XP</div>
        </div>
        <div class="quest-btn ${q.completed ? 'done' : ''}">${q.completed ? '✓ Done' : 'Pending'}</div>
      </div>`,
    )
    .join('');
}

function renderRitual() {
  const el = qs<HTMLElement>('#ritual-grid');
  if (!el) return;

  const r = getRitual();
  el.innerHTML = RITUAL_STEPS.map(
    (s, i) => `
    <div class="ritual-step ${r.steps[i] ? 'done' : ''}" data-idx="${i}">
      <div class="ritual-circle">${RITUAL_ICONS[i]}</div>
      <div class="ritual-label">${s}</div>
    </div>`,
  ).join('');

  // Add click handlers
  qsa<HTMLElement>('.ritual-step', el).forEach((step) => {
    step.addEventListener('click', () => {
      const idx = parseInt((step as HTMLElement).dataset.idx || '0', 10);
      const result = toggleStep(idx);
      if (result.allDone) {
        showCelebrate('Morning Ritual Complete', '2x XP Boost until noon!', '🌅');
      }
      renderRitual();
      checkQuests();
    });
  });

  // Show/hide boost banner
  const boost = qs<HTMLElement>('#ritual-boost');
  if (boost) {
    const hour = new Date().getHours();
    boost.classList.toggle('hidden', !(r.completed && r.date === todayStr() && hour < 12));
  }
}

function renderSubjects() {
  const el = qs<HTMLElement>('#subject-grid');
  if (!el) return;

  const subjects = getSubjectsWithInfo();
  el.innerHTML = subjects
    .map(
      (s) => `
      <div class="subject-card ${s.cls}">
        <div class="subject-name" style="color:${s.color}">${s.name}</div>
        <div class="subject-level">Level ${s.level} · ${s.current}/${s.need} XP</div>
        <div class="subject-bar">
          <div class="subject-fill" style="width:${s.pct}%;background:${s.color}"></div>
        </div>
      </div>`,
    )
    .join('');
}

function renderFlowBanner() {
  const el = qs<HTMLElement>('#flow-banner');
  if (!el) return;
  el.classList.toggle('hidden', !isFlowActive());
}

function renderStreak() {
  const info = getStreakInfo();
  const elNum = qs<HTMLElement>('#consecutive-streak');
  const elFreeze = qs<HTMLElement>('#freeze-badge');
  const btn = qs<HTMLElement>('#freeze-btn');

  if (elNum) elNum.textContent = String(info.consecutive);
  if (elFreeze) elFreeze.textContent = `❄️ ${info.freezes} Freezes`;

  if (btn) {
    const canFreeze = canUseFreeze();
    btn.style.display = canFreeze ? 'inline-flex' : 'none';
  }
}

function renderBuddy() {
  const buddy = getBuddy();
  const elForm = qs<HTMLElement>('#settings-buddy-form');
  const elActive = qs<HTMLElement>('#settings-buddy-active');
  const elDisplay = qs<HTMLElement>('#settings-buddy-display');

  if (buddy) {
    if (elForm) elForm.classList.add('hidden');
    if (elActive) elActive.classList.remove('hidden');
    if (elDisplay) elDisplay.textContent = buddy;
  } else {
    if (elForm) elForm.classList.remove('hidden');
    if (elActive) elActive.classList.add('hidden');
  }
}

function renderWeekly() {
  const totals = getWeekTotals();
  const stats = getWeekStats();

  const elF = qs<HTMLElement>('#wk-focus');
  const elB = qs<HTMLElement>('#wk-backlogs');
  const elH = qs<HTMLElement>('#wk-habits');
  const elS = qs<HTMLElement>('#wk-streaks');
  const elN = qs<HTMLElement>('#week-total-num');

  if (elF) elF.textContent = totals.focus.toFixed(1);
  if (elB) elB.textContent = String(totals.backlogs);
  if (elH) elH.textContent = String(totals.habits);
  if (elS) elS.textContent = String(totals.streaks);
  if (elN) elN.textContent = String(totals.score);

  // Bar chart
  const elWrap = qs<HTMLElement>('#week-bar-wrap');
  if (!elWrap) return;

  const maxScore = Math.max(...stats.map((s) => s.score || 0), 1);
  const todayIdx = 6;

  elWrap.innerHTML = stats
    .map((s, i) => {
      const pct = Math.min(100, ((s.score || 0) / maxScore) * 100);
      const isToday = i === todayIdx;
      const d = new Date(s.date);
      const label = isToday ? 'Today' : DAY_LABELS[d.getDay()];
      return `
        <div class="week-bar-item ${isToday ? 'week-bar-today' : ''}">
          <div class="week-bar-track">
            <div class="week-bar-fill" style="height:${pct}%"></div>
          </div>
          <div class="week-bar-label">${label}</div>
        </div>`;
    })
    .join('');
}

function renderDailyChecks() {
  const el = qs<HTMLElement>('#daily-checks');
  if (!el) return;

  const CHECK_ITEMS = [
    { id: 'dc1', label: 'Maintained clean digital environment' },
    { id: 'dc2', label: 'Zero passive consumption today' },
    { id: 'dc3', label: 'Social boundaries honored during work' },
    { id: 'dc4', label: 'Deep work sanctuary active' },
    { id: 'dc5', label: 'Entertainment fasting completed' },
    { id: 'dc6', label: 'Neural training session done' },
    { id: 'dc7', label: 'Learning milestone achieved' },
  ];

  const claimed = data.detoxLastDate === todayStr();

  if (claimed) {
    el.innerHTML =
      '<div class="text-center" style="padding:14px;color:var(--success);font-weight:700;font-size:0.9rem">🔥 Verification claimed for today. Come back tomorrow.</div>';
    const status = qs<HTMLElement>('#checkin-status');
    const btn = qs<HTMLElement>('#claim-btn');
    if (status) (status as HTMLElement).style.display = 'none';
    if (btn) (btn as HTMLElement).style.display = 'none';
    return;
  }

  // Reset built flag if date changed
  const today = todayStr();
  if (lastDailyCheckDate && lastDailyCheckDate !== today) {
    dailyChecksBuilt = false;
  }
  lastDailyCheckDate = today;

  if (!dailyChecksBuilt) {
    el.innerHTML = CHECK_ITEMS.map(
      (item) => `
      <div class="check-row" id="row-${item.id}">
        <input type="checkbox" id="chk-${item.id}">
        <label>${escapeHTML(item.label)}</label>
      </div>`,
    ).join('');

    // Add click handlers
    CHECK_ITEMS.forEach((item) => {
      const row = qs<HTMLElement>(`#row-${item.id}`);
      const chk = qs<HTMLInputElement>(`#chk-${item.id}`);
      const toggle = () => {
        if (data.detoxLastDate === todayStr()) return;
        data.dailyChecks[item.id] = !data.dailyChecks[item.id];
        try {
          localStorage.setItem('nf_dailyChecks', JSON.stringify(data.dailyChecks));
        } catch {
          // ignore storage errors
        }
        dailyChecksBuilt = false; // force re-render of checks state
        renderDailyChecks();
      };
      if (row) row.addEventListener('click', toggle);
      if (chk)
        chk.addEventListener('click', (e) => {
          e.stopPropagation();
          toggle();
        });
    });

    dailyChecksBuilt = true;
  }

  let doneCount = 0;
  CHECK_ITEMS.forEach((item) => {
    const checked = !!data.dailyChecks[item.id];
    if (checked) doneCount++;
    const row = qs<HTMLElement>(`#row-${item.id}`);
    const chk = qs<HTMLInputElement>(`#chk-${item.id}`);
    if (row) row.classList.toggle('done', checked);
    if (chk) chk.checked = checked;
  });

  const status = qs<HTMLElement>('#checkin-status');
  const btn = qs<HTMLButtonElement>('#claim-btn');
  const allChecked = doneCount === CHECK_ITEMS.length;

  if (status) {
    (status as HTMLElement).style.display = 'block';
    if (allChecked) {
      status.textContent = 'All 7 checks complete. Claim your streak.';
      (status as HTMLElement).style.color = 'var(--success)';
    } else {
      status.textContent = `${doneCount} / 7 checks — complete all to claim`;
      (status as HTMLElement).style.color = 'var(--danger)';
    }
  }

  if (btn) {
    (btn as HTMLElement).style.display = 'block';
    btn.disabled = !allChecked;
    (btn as HTMLElement).style.opacity = allChecked ? '1' : '0.5';
  }
}

function renderBacklogs() {
  const el = qs<HTMLElement>('#backlog-list');
  if (!el) return;

  const backlogs = getBacklogs();
  if (!backlogs.length) {
    el.innerHTML =
      '<div class="empty"><div class="empty-icon">📚</div>No backlogs yet. Add your first lecture.</div>';
    return;
  }

  const SUBJECT_MAP: Record<string, string> = {
    Physics: 'physics',
    Chemistry: 'chem',
    Math: 'math',
    Biology: 'bio',
    Hindi: 'hindi',
    English: 'english',
    IT: 'it',
    Other: 'other',
  };

  el.innerHTML = backlogs
    .map((b) => {
      const total = b.total || 1;
      const done = b.done || 0;
      const pct = Math.min(100, (done / total) * 100);
      const left = total - done;
      const cls = `tag-sub-${SUBJECT_MAP[b.subject] || 'other'}`;
      return `
        <div class="list-item">
          <div class="info">
            <div class="title">${escapeHTML(b.name)}</div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
              <span class="tag-sub ${cls}">${escapeHTML(b.subject || 'Other')}</span>
              <span style="font-size:0.75rem;color:var(--text-secondary)">${done} / ${total}</span>
            </div>
            <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
          </div>
          <div class="flex items-center gap-2" style="flex-shrink:0">
            <span class="tag ${left > 5 ? 'tag-red' : 'tag-green'}">${left} left</span>
            <button class="btn btn-success btn-sm" data-action="inc-backlog" data-id="${b.id}">+1</button>
            <button class="btn btn-danger btn-sm" data-action="del-backlog" data-id="${b.id}">×</button>
          </div>
        </div>`;
    })
    .join('');

  // Add handlers
  qsa<HTMLElement>('[data-action="inc-backlog"]', el).forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = parseInt((btn as HTMLElement).dataset.id || '0', 10);
      incrementBacklog(id);
      renderBacklogs();
      updateDashboard();
    });
  });
  qsa<HTMLElement>('[data-action="del-backlog"]', el).forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = parseInt((btn as HTMLElement).dataset.id || '0', 10);
      deleteBacklog(id);
      renderBacklogs();
      updateDashboard();
    });
  });
}

function renderHabits() {
  const el = qs<HTMLElement>('#habit-list');
  if (!el) return;

  const habits = getHabits();
  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const today = currentDOW();

  if (!habits.length) {
    el.innerHTML =
      '<div class="empty"><div class="empty-icon">🔥</div>No habits yet. Stack one tiny habit.</div>';
    return;
  }

  el.innerHTML = habits
    .map(
      (h) => `
      <div class="card">
        <div class="flex justify-between items-center" style="gap:8px;margin-bottom:10px">
          <div class="flex-1" style="min-width:0">
            <div style="font-weight:700;font-size:0.9rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHTML(h.name)}</div>
            <div style="color:var(--text-secondary);font-size:0.75rem;margin-top:2px">After ${escapeHTML(h.anchor || 'waking up')}</div>
          </div>
          <div class="flex items-center gap-2">
            <span style="font-weight:800;font-size:0.85rem;color:var(--accent-start)">🔥 ${h.streak || 0}</span>
            <button class="btn btn-success btn-sm" data-action="toggle-habit" data-id="${h.id}">${h.today ? 'Done' : 'Mark'}</button>
            <button class="btn btn-danger btn-sm" data-action="del-habit" data-id="${h.id}">×</button>
          </div>
        </div>
        <div class="habit-grid">
          ${days.map((d, i) => `<div class="habit-day ${h.days && h.days[i] ? 'done' : ''} ${i === today ? 'today' : ''}">${d}</div>`).join('')}
        </div>
      </div>`,
    )
    .join('');

  qsa<HTMLElement>('[data-action="toggle-habit"]', el).forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = parseInt((btn as HTMLElement).dataset.id || '0', 10);
      toggleHabit(id);
      renderHabits();
      updateDashboard();
    });
  });
  qsa<HTMLElement>('[data-action="del-habit"]', el).forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = parseInt((btn as HTMLElement).dataset.id || '0', 10);
      deleteHabit(id);
      renderHabits();
      updateDashboard();
    });
  });
}

function renderBattle() {
  const el = qs<HTMLElement>('#battle-list');
  if (!el) return;

  const tasks = getTasksSorted();
  const colors: Record<string, string> = { A: 'var(--danger)', B: '#f59e0b', C: 'var(--success)' };

  if (!tasks.length) {
    el.innerHTML =
      '<div class="empty"><div class="empty-icon">⚔️</div>No battle tasks. Plan your 6 priorities.</div>';
    return;
  }

  el.innerHTML = tasks
    .map(
      (t) => `
      <div class="list-item" style="border-left:3px solid ${colors[t.priority] || colors.C}">
        <div class="flex items-center gap-3 flex-1" style="min-width:0">
          <input type="checkbox" ${t.done ? 'checked' : ''} data-action="toggle-battle" data-id="${t.id}" style="width:20px;height:20px;flex-shrink:0">
          <span class="${t.done ? 'text-tertiary' : ''}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.9rem">
            <strong style="color:var(--text-tertiary);margin-right:4px;font-size:0.75rem">[${t.priority}]</strong>${escapeHTML(t.task)} <span class="tag tag-blue">${t.time}</span>
          </span>
        </div>
        <button class="btn btn-danger btn-sm" data-action="del-battle" data-id="${t.id}">×</button>
      </div>`,
    )
    .join('');

  qsa<HTMLInputElement>('[data-action="toggle-battle"]', el).forEach((chk) => {
    chk.addEventListener('change', () => {
      const id = parseInt((chk as HTMLElement).dataset.id || '0', 10);
      toggleTask(id);
      renderBattle();
      updateDashboard();
    });
  });
  qsa<HTMLElement>('[data-action="del-battle"]', el).forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = parseInt((btn as HTMLElement).dataset.id || '0', 10);
      deleteTask(id);
      renderBattle();
      updateDashboard();
    });
  });
}

function renderFocusHistory() {
  const el = qs<HTMLElement>('#focus-history');
  if (!el) return;

  const sessions = getRecentSessions(10);
  if (!sessions.length) {
    el.innerHTML =
      '<div class="empty" style="padding:12px">No sessions yet. Complete a focus timer to see history.</div>';
    return;
  }

  el.innerHTML = sessions
    .map((s) => {
      const d = new Date(s.time);
      const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `
        <div class="list-item">
          <div class="info">
            <div class="title">${s.duration} min Deep Work</div>
            <div class="meta">${s.date} at ${timeStr}</div>
          </div>
          <span class="tag tag-green">${s.duration}m</span>
        </div>`;
    })
    .join('');
}

function renderProfile() {
  const rank = getCurrentRank(xpLevel(data.xp).level);
  const info = xpLevel(data.xp);

  const elName = qs<HTMLElement>('#profile-name');
  const elRank = qs<HTMLElement>('#profile-rank');
  const elAvatar = qs<HTMLElement>('#profile-avatar');
  const elMission = qs<HTMLElement>('#profile-mission');
  const elInput = qs<HTMLInputElement>('#profile-name-input');
  const elMissionInput = qs<HTMLTextAreaElement>('#mission-input');

  if (elName) elName.textContent = data.profileName || 'Warrior';
  if (elRank) elRank.textContent = `${rank.name} · Level ${info.level}`;
  if (elAvatar) elAvatar.textContent = rank.icon;
  if (elMission) elMission.textContent = data.mission;
  if (elInput) elInput.value = data.profileName || '';
  if (elMissionInput) elMissionInput.value = data.mission || '';
}

function renderTrophyPreview() {
  const rank = getCurrentRank(xpLevel(data.xp).level);
  const unlocked = (data.badgesUnlocked || []).length;

  const elIcon = qs<HTMLElement>('#trophy-preview-icon');
  const elTitle = qs<HTMLElement>('#trophy-preview-title');
  const elSub = qs<HTMLElement>('#trophy-preview-sub');
  const elCount = qs<HTMLElement>('#trophy-count');

  if (elIcon) elIcon.textContent = rank.icon;
  if (elTitle) elTitle.textContent = rank.name;
  if (elSub) elSub.textContent = `${unlocked} of ${TOTAL_BADGES} badges unlocked`;
  if (elCount) elCount.textContent = `${unlocked} / ${TOTAL_BADGES}`;
}

function renderQuote() {
  const el = qs<HTMLElement>('#daily-quote');
  if (el) el.textContent = `"${getDailyQuote()}"`;
}

function setLoginOverlayOpen(open: boolean): void {
  const overlay = qs<HTMLElement>('#login-overlay');
  if (!overlay) return;

  overlay.classList.toggle('hidden', !open);
  overlay.classList.toggle('show', open);
  document.body.classList.toggle('auth-open', open);

  // Keep keyboard and screen-reader users inside the modal while it is open.
  qsa<HTMLElement>('#app-header, main.container, .bottom-nav').forEach((element) => {
    if (open) {
      element.setAttribute('inert', '');
      element.setAttribute('aria-hidden', 'true');
    } else {
      element.removeAttribute('inert');
      element.removeAttribute('aria-hidden');
    }
  });
}

function renderSession(): void {
  if (isSessionStarted() || currentUser()) {
    setLoginOverlayOpen(false);
    return;
  }

  showLoginView('choice');
  setLoginOverlayOpen(true);
  qs<HTMLButtonElement>('#email-login-btn')?.focus();
}

function renderAccountSettings() {
  const user = currentUser();
  const status = qs<HTMLElement>('#account-status');
  const email = qs<HTMLElement>('#account-email');
  const login = qs<HTMLElement>('#settings-login-btn');
  const sync = qs<HTMLElement>('#sync-now-btn');
  const out = qs<HTMLElement>('#logout-btn');
  if (user) {
    if (status) status.textContent = 'Synced status · progress is protected across devices.';
    if (email) email.textContent = user.email || '';
    login?.classList.add('hidden');
    sync?.classList.remove('hidden');
    out?.classList.remove('hidden');
  } else {
    if (status) status.textContent = 'Local only — login recommended to protect progress.';
    if (email) email.textContent = '';
    login?.classList.toggle('hidden', !isEmailAuthConfigured);
    sync?.classList.add('hidden');
    out?.classList.add('hidden');
  }
}

function downloadBackup() {
  createLocalBackup();
  const blob = new Blob([JSON.stringify(exportAll(), null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `neurofocusx-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function askSyncChoice(): 'local' | 'cloud' | 'merge' {
  return 'merge';
}

// ===================================================================
// DASHBOARD UPDATE
// ===================================================================

function updateDashboard() {
  // Stats
  const ds = qs<HTMLElement>('#d-streak');
  const db = qs<HTMLElement>('#d-backlogs');
  const df = qs<HTMLElement>('#d-focus');
  const dh = qs<HTMLElement>('#d-habits');

  if (ds) ds.textContent = String(data.detoxStreak || 0);
  if (db)
    db.textContent = String(
      data.backlogs.reduce((a, b) => a + ((b.total || 0) - (b.done || 0)), 0),
    );
  if (df) df.textContent = (Math.floor(((data.focusMinutes || 0) / 60) * 10) / 10).toFixed(1);
  if (dh) dh.textContent = String(data.habits.filter((h) => h.today).length);

  // Priority section
  const dp = qs<HTMLElement>('#dash-priority');
  if (dp) {
    const inc = data.backlogs.filter((b) => (b.done || 0) < (b.total || 0));
    const ht = data.habits.filter((h) => !h.today);
    let html = '';

    if (inc.length > 0 && inc[0]) {
      html += `<div class="list-item"><div class="info"><div class="title">${escapeHTML(inc[0].name)}</div><div class="meta">${(inc[0].total || 0) - (inc[0].done || 0)} lectures remaining</div></div><span class="tag tag-red">URGENT</span></div>`;
    }
    if (ht.length > 0 && ht[0]) {
      html += `<div class="list-item"><div class="info"><div class="title">${escapeHTML(ht[0].name)}</div><div class="meta">After ${escapeHTML(ht[0].anchor || 'waking up')}</div></div><span class="tag tag-blue">NEXT</span></div>`;
    }
    dp.innerHTML =
      html ||
      '<div class="empty"><div class="empty-icon">🎉</div>All caught up. Add a new skill.</div>';
  }

  renderDailyChecks();
  renderXP();
  renderQuests();
  renderRitual();
  renderSubjects();
  renderFlowBanner();
  renderStreak();
  renderBuddy();
  renderWeekly();
  renderTrophyPreview();
  recordDailyStat();
  checkQuests();
  checkBadges();
  renderProfile();
  renderQuote();
  renderFocusHistory();
}

// ===================================================================
// EVENT HANDLERS
// ===================================================================

type AuthMode = 'signin' | 'signup';
type LoginView = 'choice' | 'email' | 'local';
type MessageTone = 'error' | 'success' | 'info';

let authMode: AuthMode = 'signin';
let authSubmitting = false;
let resendSubmitting = false;

function setLoginHeader(kicker: string, title: string, subtitle: string): void {
  const kickerElement = qs<HTMLElement>('#login-kicker');
  const titleElement = qs<HTMLElement>('#login-title');
  const subtitleElement = qs<HTMLElement>('#login-subtitle');
  if (kickerElement) kickerElement.textContent = kicker;
  if (titleElement) titleElement.textContent = title;
  if (subtitleElement) subtitleElement.textContent = subtitle;
}

function setFormMessage(id: string, message = '', tone: MessageTone = 'error'): void {
  const element = qs<HTMLElement>(`#${id}`);
  if (!element) return;
  element.textContent = message;
  if (message) element.dataset.tone = tone;
  else delete element.dataset.tone;
}

function clearAuthFieldErrors(): void {
  qs<HTMLInputElement>('#login-email')?.removeAttribute('aria-invalid');
  qs<HTMLInputElement>('#login-password')?.removeAttribute('aria-invalid');
}

function resetPasswordVisibility(): void {
  const passwordInput = qs<HTMLInputElement>('#login-password');
  const toggle = qs<HTMLButtonElement>('#toggle-login-password');
  if (passwordInput) passwordInput.type = 'password';
  if (toggle) {
    toggle.setAttribute('aria-pressed', 'false');
    toggle.setAttribute('aria-label', 'Show password');
    toggle.textContent = 'Show';
  }
}

function updateAuthControls(): void {
  const sendBtn = qs<HTMLButtonElement>('#send-login-btn');
  const signInButton = qs<HTMLButtonElement>('#auth-tab-signin');
  const signUpButton = qs<HTMLButtonElement>('#auth-tab-signup');
  const action = authMode === 'signin' ? 'Sign in' : 'Create account';
  const pendingAction = authMode === 'signin' ? 'Signing in…' : 'Creating account…';

  if (sendBtn) {
    sendBtn.textContent = authSubmitting ? pendingAction : action;
    sendBtn.disabled = authSubmitting || !isEmailAuthConfigured;
    sendBtn.setAttribute('aria-busy', String(authSubmitting));
  }
  if (signInButton) signInButton.disabled = authSubmitting;
  if (signUpButton) signUpButton.disabled = authSubmitting;
}

function setAuthMode(mode: AuthMode): void {
  const modeChanged = authMode !== mode;
  authMode = mode;

  const signInButton = qs<HTMLButtonElement>('#auth-tab-signin');
  const signUpButton = qs<HTMLButtonElement>('#auth-tab-signup');
  const passwordInput = qs<HTMLInputElement>('#login-password');
  const passwordHint = qs<HTMLElement>('#password-hint');
  const resendButton = qs<HTMLButtonElement>('#resend-confirmation-btn');

  if (modeChanged && passwordInput) passwordInput.value = '';
  resetPasswordVisibility();
  clearAuthFieldErrors();
  setFormMessage('login-message');

  signInButton?.setAttribute('aria-pressed', String(mode === 'signin'));
  signUpButton?.setAttribute('aria-pressed', String(mode === 'signup'));
  passwordHint?.classList.toggle('hidden', mode !== 'signup');

  if (passwordInput) {
    passwordInput.setAttribute(
      'autocomplete',
      mode === 'signin' ? 'current-password' : 'new-password',
    );
    passwordInput.placeholder = mode === 'signin' ? 'Enter your password' : 'Create a password';
  }

  if (mode === 'signin') {
    setLoginHeader('Your account', 'Welcome back', 'Sign in to continue with your saved progress.');
  } else {
    setLoginHeader(
      'Get started',
      'Create your account',
      'Back up your progress and use NeuroFocusX across devices.',
    );
  }

  if (resendButton) {
    resendButton.classList.add('hidden');
    resendButton.disabled = false;
    delete resendButton.dataset.email;
  }

  if (!isEmailAuthConfigured) {
    setFormMessage(
      'login-message',
      'Online accounts are not available right now. Choose All options to continue without an account.',
      'info',
    );
  }
  updateAuthControls();
}

function showLoginView(view: LoginView, mode: AuthMode = 'signin'): void {
  qs<HTMLElement>('#login-choice')?.classList.toggle('hidden', view !== 'choice');
  qs<HTMLElement>('#email-login-form')?.classList.toggle('hidden', view !== 'email');
  qs<HTMLElement>('#local-login-form')?.classList.toggle('hidden', view !== 'local');

  if (view === 'choice') {
    setLoginHeader(
      'Focus. Build. Grow.',
      'Welcome to NeuroFocusX',
      'Choose how you want to save your progress.',
    );
    setFormMessage('login-message');
    setFormMessage('local-login-message');
    clearAuthFieldErrors();
    qs<HTMLInputElement>('#login-name')?.removeAttribute('aria-invalid');
    const passwordInput = qs<HTMLInputElement>('#login-password');
    if (passwordInput) passwordInput.value = '';
    resetPasswordVisibility();
    updateResendConfirmationState({}, '');
    return;
  }

  if (view === 'email') {
    setAuthMode(mode);
    return;
  }

  setLoginHeader(
    'Device-only setup',
    'Make it yours',
    'Add a name to personalize NeuroFocusX on this device.',
  );
  setFormMessage('local-login-message');
  qs<HTMLInputElement>('#login-name')?.removeAttribute('aria-invalid');
}

function openEmailAuth(mode: AuthMode): void {
  showLoginView('email', mode);
  setLoginOverlayOpen(true);
  qs<HTMLInputElement>('#login-email')?.focus();
}

function markAuthFieldErrors(message: string): void {
  clearAuthFieldErrors();
  const normalized = message.toLowerCase();
  const emailInput = qs<HTMLInputElement>('#login-email');
  const passwordInput = qs<HTMLInputElement>('#login-password');

  if (normalized.includes('email') || normalized.includes('account')) {
    emailInput?.setAttribute('aria-invalid', 'true');
  }
  if (normalized.includes('password') || normalized.includes('credentials')) {
    passwordInput?.setAttribute('aria-invalid', 'true');
  }
}

function updateResendConfirmationState(
  result: { canResendConfirmation?: boolean; email?: string },
  fallbackEmail: string,
): void {
  const resendBtn = qs<HTMLButtonElement>('#resend-confirmation-btn');
  if (!resendBtn) return;
  const email = (result.email || fallbackEmail || '').trim();
  if (result.canResendConfirmation && email) {
    resendBtn.dataset.email = email;
    resendBtn.classList.remove('hidden');
    resendBtn.removeAttribute('disabled');
    return;
  }
  resendBtn.classList.add('hidden');
  resendBtn.removeAttribute('disabled');
  delete resendBtn.dataset.email;
}

function setupEventListeners() {
  // Tab navigation
  qsa<HTMLElement>('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = (btn as HTMLElement).dataset.tab;
      if (tab) switchTab(tab);
    });
  });

  // Settings button
  qs<HTMLElement>('#settings-btn')?.addEventListener('click', () => {
    qs<HTMLElement>('#settings-overlay')?.classList.add('show');
    renderProfile();
    renderAccountSettings();
  });
  qs<HTMLElement>('#settings-login-btn')?.addEventListener('click', () => {
    qs<HTMLElement>('#settings-overlay')?.classList.remove('show');
    openEmailAuth('signin');
  });
  qs<HTMLElement>('#sync-now-btn')?.addEventListener('click', async () => {
    try {
      await syncNow();
      renderAccountSettings();
      showCelebrate('Synced', 'Your progress is protected.', '☁️');
    } catch {
      showCelebrate('Sync unavailable', 'Your local progress is still safe.', '⚠️', true);
    }
  });
  qs<HTMLElement>('#logout-btn')?.addEventListener('click', async () => {
    await logout();
    renderAccountSettings();
    renderSession();
  });
  qs<HTMLElement>('#export-backup-btn')?.addEventListener('click', downloadBackup);

  // Import / restore from backup
  qs<HTMLElement>('#import-backup-btn')?.addEventListener('click', () => {
    const fileInput = qs<HTMLInputElement>('#import-file-input');
    if (fileInput) {
      // Reset value so re-selecting the same file triggers change
      fileInput.value = '';
      fileInput.click();
    }
  });
  qs<HTMLInputElement>('#import-file-input')?.addEventListener('change', async (e) => {
    const fileInput = e.target as HTMLInputElement;
    const msg = qs<HTMLElement>('#import-message');
    if (!fileInput.files || fileInput.files.length === 0) return;
    const file = fileInput.files[0];

    try {
      // Validate file before touching current data
      const validation = await readImportFile(file);
      if (!validation.valid || !validation.sanitizedData) {
        if (msg) msg.textContent = validation.error || 'Could not read this file.';
        return;
      }

      // Show confirmation explaining replacement
      const isSignedIn = Boolean(currentUser());
      const confirmText = isSignedIn
        ? `Restore ${validation.fieldCount} fields from backup?\n\nThis will replace your current local progress. A backup of your current data will be saved automatically.\n\nImporting is local first — cloud sync remains a separate step.`
        : `Restore ${validation.fieldCount} fields from backup?\n\nThis will replace your current local progress. A backup of your current data will be saved automatically.`;

      const confirmed = window.confirm(confirmText);
      if (!confirmed) {
        if (msg) msg.textContent = 'Import cancelled.';
        return;
      }

      // Apply the validated import (backup is created inside applyImport)
      const result = applyImport(validation.sanitizedData);
      if (!result.ok) {
        if (msg)
          msg.textContent = result.error || 'Import failed. Your existing progress is unchanged.';
        return;
      }

      if (msg) msg.textContent = 'Progress restored successfully.';
      showCelebrate('Progress Restored', `${validation.fieldCount} fields imported.`, '📦');

      // Refresh UI
      updateDashboard();
      renderAccountSettings();
      renderProfile();
      renderHabits();
      renderBacklogs();
      renderBattle();
      renderStreak();
      renderBuddy();
      renderWeekly();
      renderTrophyPreview();
      renderRitual();
      renderSubjects();
    } catch {
      if (msg) msg.textContent = 'Import failed. Your existing progress is unchanged.';
    } finally {
      // Always reset the input so the same file can be re-selected
      fileInput.value = '';
    }
  });

  // Close settings
  qs<HTMLElement>('#settings-close-btn')?.addEventListener('click', () => {
    qs<HTMLElement>('#settings-overlay')?.classList.remove('show');
  });
  qs<HTMLElement>('#settings-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget)
      qs<HTMLElement>('#settings-overlay')?.classList.remove('show');
  });

  // Account start screen. All handlers are attached here (no inline JS).
  qs<HTMLElement>('#email-login-btn')?.addEventListener('click', () => openEmailAuth('signin'));
  qs<HTMLElement>('#create-account-btn')?.addEventListener('click', () => openEmailAuth('signup'));
  qs<HTMLElement>('#back-login-btn')?.addEventListener('click', renderSession);
  qs<HTMLElement>('#back-local-btn')?.addEventListener('click', renderSession);
  qs<HTMLElement>('#auth-tab-signin')?.addEventListener('click', () => setAuthMode('signin'));
  qs<HTMLElement>('#auth-tab-signup')?.addEventListener('click', () => setAuthMode('signup'));

  qs<HTMLButtonElement>('#toggle-login-password')?.addEventListener('click', (event) => {
    const toggle = event.currentTarget as HTMLButtonElement;
    const passwordInput = qs<HTMLInputElement>('#login-password');
    if (!passwordInput) return;
    const shouldShow = passwordInput.type === 'password';
    passwordInput.type = shouldShow ? 'text' : 'password';
    toggle.setAttribute('aria-pressed', String(shouldShow));
    toggle.setAttribute('aria-label', shouldShow ? 'Hide password' : 'Show password');
    toggle.textContent = shouldShow ? 'Hide' : 'Show';
  });

  qs<HTMLElement>('#skip-login-btn')?.addEventListener('click', () => {
    showLoginView('local');
    qs<HTMLInputElement>('#login-name')?.focus();
  });

  qsa<HTMLInputElement>('#login-email, #login-password').forEach((input) => {
    input.addEventListener('input', () => {
      input.removeAttribute('aria-invalid');
      const message = qs<HTMLElement>('#login-message');
      if (message?.dataset.tone === 'error') setFormMessage('login-message');
    });
  });

  qs<HTMLFormElement>('#email-login-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = qs<HTMLInputElement>('#login-email')?.value || '';
    const password = qs<HTMLInputElement>('#login-password')?.value || '';

    // Prevent duplicate submissions from rapid clicks or repeated Enter presses.
    if (authSubmitting || !isEmailAuthConfigured) return;
    authSubmitting = true;
    clearAuthFieldErrors();
    setFormMessage('login-message');
    updateAuthControls();

    try {
      const result =
        authMode === 'signin'
          ? await signInWithEmailPassword(email, password)
          : await signUpWithEmailPassword(email, password);
      const tone: MessageTone = result.ok
        ? 'success'
        : result.needsEmailConfirmation
          ? 'info'
          : 'error';
      setFormMessage('login-message', result.message, tone);
      if (tone === 'error') markAuthFieldErrors(result.message);
      updateResendConfirmationState(result, email);

      if (result.ok) {
        updateResendConfirmationState({}, '');
        // Clear the password immediately — never retain it longer than needed.
        const passwordInput = qs<HTMLInputElement>('#login-password');
        if (passwordInput) passwordInput.value = '';
        setLoginOverlayOpen(false);
        renderAccountSettings();
      }
    } catch {
      const message = 'Something went wrong. Please try again.';
      setFormMessage('login-message', message, 'error');
    } finally {
      authSubmitting = false;
      updateAuthControls();
    }
  });
  qs<HTMLButtonElement>('#resend-confirmation-btn')?.addEventListener('click', async (event) => {
    const resendBtn = event.currentTarget as HTMLButtonElement;
    const email = resendBtn.dataset.email || qs<HTMLInputElement>('#login-email')?.value || '';

    if (resendSubmitting) return;
    resendSubmitting = true;
    resendBtn.disabled = true;
    const originalText = resendBtn.textContent || 'Resend confirmation email';
    resendBtn.textContent = 'Sending…';

    try {
      const result = await resendConfirmationEmail(email);
      setFormMessage(
        'login-message',
        result.message,
        result.ok ? 'success' : result.canResendConfirmation ? 'info' : 'error',
      );
      updateResendConfirmationState(
        {
          canResendConfirmation: result.canResendConfirmation,
          email: result.email || email,
        },
        email,
      );
    } catch {
      setFormMessage('login-message', 'Something went wrong. Please try again.', 'error');
    } finally {
      resendSubmitting = false;
      resendBtn.textContent = originalText;
      resendBtn.disabled = false;
    }
  });

  qs<HTMLInputElement>('#login-name')?.addEventListener('input', (event) => {
    (event.currentTarget as HTMLInputElement).removeAttribute('aria-invalid');
    setFormMessage('local-login-message');
  });

  qs<HTMLFormElement>('#local-login-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const nameInput = qs<HTMLInputElement>('#login-name');
    const result = startLocalSession({ name: nameInput?.value || '' });
    if (!result.success) {
      nameInput?.setAttribute('aria-invalid', 'true');
      setFormMessage(
        'local-login-message',
        result.error || 'Enter your name to continue.',
        'error',
      );
      nameInput?.focus();
      return;
    }
    renderSession();
    renderProfile();
    showCelebrate('Welcome', `Ready when you are, ${data.profileName}.`, '🧠');
  });

  qs<HTMLElement>('#switch-profile-btn')?.addEventListener('click', () => {
    endLocalSession();
    qs<HTMLElement>('#settings-overlay')?.classList.remove('show');
    renderSession();
  });

  // Theme buttons
  qsa<HTMLElement>('[data-theme]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const theme = (btn as HTMLElement).dataset.theme as any;
      if (theme) {
        setTheme(theme);
        updateThemeButtons();
      }
    });
  });

  // Auto theme toggle
  qs<HTMLInputElement>('#auto-theme')?.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    setAutoTheme(target.checked);
  });

  // Profile name save
  qs<HTMLElement>('#save-name-btn')?.addEventListener('click', () => {
    const input = qs<HTMLInputElement>('#profile-name-input');
    const name = input?.value.trim();
    if (!name) return;
    const validation = validateProfileName(name);
    if (!validation.valid) {
      showCelebrate('Invalid Name', validation.error || 'Try again', '⚠️', true);
      return;
    }
    data.profileName = validation.data as string;
    try {
      localStorage.setItem('nf_profileName', JSON.stringify(validation.data));
    } catch {}
    renderProfile();
    showCelebrate('Profile Updated', 'Your warrior name is set.', '👤');
  });

  // Mission save
  qs<HTMLElement>('#save-mission-btn')?.addEventListener('click', () => {
    const input = qs<HTMLTextAreaElement>('#mission-input');
    const m = input?.value.trim();
    if (!m) return;
    const validation = validateMission(m);
    if (!validation.valid) {
      showCelebrate('Invalid Mission', validation.error || 'Try again', '⚠️', true);
      return;
    }
    data.mission = validation.data as string;
    try {
      localStorage.setItem('nf_mission', JSON.stringify(validation.data));
    } catch {}
    renderProfile();
    showCelebrate('Mission Updated', 'Your north star is locked.', '🎯');
  });

  // Buddy
  qs<HTMLElement>('#set-buddy-btn')?.addEventListener('click', () => {
    const input = qs<HTMLInputElement>('#settings-buddy-name');
    const result = setBuddy(input?.value || '');
    if (!result.success) {
      showCelebrate('Invalid Name', result.error || 'Try again', '⚠️', true);
      return;
    }
    renderBuddy();
  });

  qs<HTMLElement>('#remove-buddy-btn')?.addEventListener('click', () => {
    removeBuddy();
    renderBuddy();
  });

  qs<HTMLElement>('#share-progress-btn')?.addEventListener('click', async () => {
    const result = await shareProgress();
    if (result.success) {
      showCelebrate('Progress Copied', `Send to ${data.buddyName}!`, '📤');
    }
  });

  // Reset buttons
  qs<HTMLElement>('#reset-today-btn')?.addEventListener('click', () => {
    if (!confirm("Reset today's progress?")) return;
    data.dailyChecks = {};
    data.detoxLastDate = null;
    data.focusMinutes = 0;
    data.focusDate = todayStr();
    data.flowState = { date: todayStr(), sessions: 0 };
    data.morningRitual = {
      date: todayStr(),
      completed: false,
      steps: [false, false, false, false, false],
    };
    data.dailyQuests = null;
    data.backlogsToday = 0;
    data.habitsToday = 0;
    try {
      localStorage.setItem('nf_dailyChecks', '{}');
      localStorage.setItem('nf_detoxLastDate', 'null');
      localStorage.setItem('nf_focusMinutes', '0');
      localStorage.setItem('nf_focusDate', JSON.stringify(todayStr()));
      localStorage.setItem('nf_flowState', JSON.stringify(data.flowState));
      localStorage.setItem('nf_morningRitual', JSON.stringify(data.morningRitual));
      localStorage.setItem('nf_dailyQuests', 'null');
      localStorage.setItem('nf_backlogsToday', '0');
      localStorage.setItem('nf_habitsToday', '0');
    } catch {}
    dailyChecksBuilt = false;
    renderDailyChecks();
    updateDashboard();
  });

  qs<HTMLElement>('#reset-all-btn')?.addEventListener('click', () => {
    if (!confirm('⚠️ This will DELETE ALL your progress forever. Are you sure?')) return;
    if (!confirm('Really sure? This cannot be undone.')) return;
    clearAll();
    location.reload();
  });

  // Trophy preview
  qs<HTMLElement>('#trophy-preview')?.addEventListener('click', () => {
    qs<HTMLElement>('#trophy-overlay')?.classList.add('show');
    updateTrophyModal();
  });

  qs<HTMLElement>('#trophy-close-btn')?.addEventListener('click', () => {
    qs<HTMLElement>('#trophy-overlay')?.classList.remove('show');
  });
  qs<HTMLElement>('#trophy-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) qs<HTMLElement>('#trophy-overlay')?.classList.remove('show');
  });

  // Rank up close
  qs<HTMLElement>('#rank-up-close-btn')?.addEventListener('click', hideRankUp);
  qs<HTMLElement>('#rank-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) hideRankUp();
  });

  // Celebration click to dismiss
  qs<HTMLElement>('#celebrate')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) hideCelebrate();
  });

  // Freeze button
  qs<HTMLElement>('#freeze-btn')?.addEventListener('click', () => {
    if (useFreeze()) {
      renderStreak();
      showCelebrate('Streak Saved', 'Freeze used. Your chain continues.', '❄️');
    }
  });

  // Claim streak
  qs<HTMLElement>('#claim-btn')?.addEventListener('click', () => {
    const CHECK_ITEMS = ['dc1', 'dc2', 'dc3', 'dc4', 'dc5', 'dc6', 'dc7'];
    const allChecked = CHECK_ITEMS.every((id) => !!data.dailyChecks[id]);
    if (!allChecked) return;

    const result = claimStreak();
    if (result.success) {
      addXP(50, 'Streak Verified');
      dailyChecksBuilt = false;
      renderDailyChecks();
      updateDashboard();
      if (navigator.vibrate) navigator.vibrate([80, 40, 80, 40, 120]);
    }
  });

  // Backlog subject chips
  qsa<HTMLElement>('#bl-chip-row .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      qsa<HTMLElement>('#bl-chip-row .chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      selectedBacklogSubject = (chip as HTMLElement).dataset.sub || 'Physics';
      const input = qs<HTMLInputElement>('#bl-subject');
      if (input) input.value = selectedBacklogSubject;
    });
  });

  // Add backlog
  qs<HTMLElement>('#bl-add-btn')?.addEventListener('click', () => {
    const name = (qs<HTMLInputElement>('#bl-name')?.value || '') as string;
    const countStr = (qs<HTMLInputElement>('#bl-count')?.value || '') as string;
    const result = addBacklog({
      name,
      count: parseInt(countStr, 10),
      subject: selectedBacklogSubject,
    });
    if (!result.success) {
      showCelebrate('Missing Info', result.error || 'Enter details', '⚠️', true);
      return;
    }
    const nameEl = qs<HTMLInputElement>('#bl-name');
    const countEl = qs<HTMLInputElement>('#bl-count');
    if (nameEl) nameEl.value = '';
    if (countEl) countEl.value = '';
    renderBacklogs();
    updateDashboard();
  });

  // Add habit
  qs<HTMLElement>('#h-add-btn')?.addEventListener('click', () => {
    const name = (qs<HTMLInputElement>('#h-name')?.value || '') as string;
    const anchor = (qs<HTMLInputElement>('#h-anchor')?.value || '') as string;
    const result = addHabit({ name, anchor });
    if (!result.success) {
      showCelebrate('Missing Info', result.error || 'Enter a habit name', '⚠️', true);
      return;
    }
    const nEl = qs<HTMLInputElement>('#h-name');
    const aEl = qs<HTMLInputElement>('#h-anchor');
    if (nEl) nEl.value = '';
    if (aEl) aEl.value = '';
    renderHabits();
    updateDashboard();
  });

  // Add battle task
  qs<HTMLElement>('#bp-add-btn')?.addEventListener('click', () => {
    const task = (qs<HTMLInputElement>('#bp-task')?.value || '') as string;
    const priority = (qs<HTMLSelectElement>('#bp-priority')?.value || 'B') as string;
    const time = (qs<HTMLSelectElement>('#bp-time')?.value || 'morning') as string;
    const result = addTask({ task, priority, time });
    if (!result.success) {
      showCelebrate('Missing Info', result.error || 'Enter a task', '⚠️', true);
      return;
    }
    const taskEl = qs<HTMLInputElement>('#bp-task');
    if (taskEl) taskEl.value = '';
    renderBattle();
    updateDashboard();
  });

  // Focus timer modes
  qsa<HTMLElement>('.timer-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const mode = parseInt((chip as HTMLElement).dataset.mode || '0', 10);
      setMode(mode);
      qsa<HTMLElement>('.timer-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      updateFocusUI();
    });
  });

  // Focus start/pause
  qs<HTMLElement>('#focus-btn')?.addEventListener('click', () => {
    const state = getTimerState();
    const btn = qs<HTMLElement>('#focus-btn');
    if (!btn) return;
    if (state.running) {
      pauseTimer();
      btn.textContent = 'Resume';
    } else {
      startTimer();
      btn.textContent = 'Pause';
    }
  });

  // Focus reset
  qs<HTMLElement>('#focus-reset-btn')?.addEventListener('click', () => {
    stopTimer();
    const btn = qs<HTMLElement>('#focus-btn');
    if (btn) btn.textContent = 'Start';
    updateFocusUI();
  });

  // Urge timer
  qs<HTMLElement>('#urge-start-btn')?.addEventListener('click', () => {
    startUrge();
    const btn = qs<HTMLElement>('#urge-start-btn');
    if (btn) btn.textContent = 'Surfing...';
  });

  qs<HTMLElement>('#urge-reset-btn')?.addEventListener('click', () => {
    resetUrge();
    const btn = qs<HTMLElement>('#urge-start-btn');
    if (btn) btn.textContent = 'Start Surf';
    updateUrgeUI();
  });
}

// ===================================================================
// UI UPDATE FUNCTIONS
// ===================================================================

function updateFocusUI() {
  const state = getTimerState();
  const elTimer = qs<HTMLElement>('#focus-timer');
  const elLabel = qs<HTMLElement>('#focus-mode-label');
  const elRing = qs<HTMLElement>('#focus-ring');
  const button = qs<HTMLElement>('#focus-btn');

  // A restored session must also restore its controls, not only the digits.
  if (button) button.textContent = state.running ? 'Pause' : 'Start';
  qsa<HTMLElement>('.timer-chip').forEach((chip) => {
    chip.classList.toggle('active', Number(chip.dataset.mode) === state.mode);
  });

  if (elTimer) {
    const m = state.minutes.toString().padStart(2, '0');
    const s = state.seconds.toString().padStart(2, '0');
    elTimer.textContent = `${m}:${s}`;
  }
  if (elLabel) elLabel.textContent = state.modeLabel;
  if (elRing) {
    const offset =
      691 * (1 - (state.minutes * 60 + state.seconds) / (TIMER_MODES[state.mode].minutes * 60));
    (elRing as unknown as HTMLElement).style.strokeDashoffset = String(offset);
    // Actually set attribute for SVG circle
    (elRing as unknown as SVGCircleElement).style.strokeDashoffset = `${offset}`;
  }
}

function updateUrgeUI() {
  const state = getUrgeState();
  const elTimer = qs<HTMLElement>('#urge-timer');
  const elRing = qs<HTMLElement>('#urge-ring');

  if (elTimer) {
    const m = state.minutes.toString().padStart(2, '0');
    const s = state.seconds.toString().padStart(2, '0');
    elTimer.textContent = `${m}:${s}`;
  }
  if (elRing) {
    const offset = 691 * (1 - state.pct / 100);
    (elRing as unknown as SVGCircleElement).style.strokeDashoffset = `${offset}`;
  }
}

function updateThemeButtons() {
  const current = getCurrentTheme();
  qsa<HTMLElement>('[data-theme]').forEach((btn) => {
    const b = btn as HTMLElement;
    const isActive = b.dataset.theme === current;
    b.style.boxShadow = isActive ? '0 0 0 2px var(--accent-start), 0 0 12px var(--shadow)' : 'none';
  });
}

function updateTrophyModal() {
  const rank = getCurrentRank(xpLevel(data.xp).level);
  const next = getNextRank(xpLevel(data.xp).level);
  const unlocked = data.badgesUnlocked || [];
  const info = xpLevel(data.xp);

  // Update rank display in modal
  const elIcon = qs<HTMLElement>('#trophy-rank-icon');
  const elName = qs<HTMLElement>('#trophy-rank-name');
  const elTier = qs<HTMLElement>('#trophy-rank-tier');
  const elNext = qs<HTMLElement>('#trophy-rank-next');

  if (elIcon) elIcon.textContent = rank.icon;
  if (elName) elName.textContent = rank.name;
  if (elTier)
    elTier.textContent = `Rank · ${rank.rarity.charAt(0).toUpperCase() + rank.rarity.slice(1)}`;
  if (elNext) {
    if (next) {
      const needed = xpForLevel(next.level) - data.xp;
      elNext.textContent = `Next: ${next.name} at Level ${next.level} (${needed} XP)`;
    } else {
      elNext.textContent = 'Max rank achieved. You are a legend.';
    }
  }

  // Render badges grid
  const elBadges = qs<HTMLElement>('#trophy-badges');
  if (!elBadges) return;

  let html = '<div class="category-label">Rank Tiers</div><div class="badge-grid">';
  html += RANK_TIERS.map((t) => {
    const isUnlocked = unlocked.includes(`rank_${t.level}`);
    const progress = info.level >= t.level ? 100 : Math.max(0, (info.level / t.level) * 100);
    return `
      <div class="badge-item ${isUnlocked ? 'unlocked' : 'locked'}">
        <div class="badge-icon">${t.icon}</div>
        <div class="badge-name">${escapeHTML(t.name)}</div>
        <div class="badge-rarity">${t.rarity}</div>
        <div class="badge-desc">${isUnlocked ? `Level ${t.level} reached` : `Level ${t.level} to unlock`}</div>
        ${!isUnlocked ? `<div class="progress-track" style="height:4px;margin-top:4px"><div class="progress-fill" style="width:${progress}%"></div></div>` : ''}
      </div>`;
  }).join('');
  html += '</div><div class="category-label">Special Achievements</div><div class="badge-grid">';
  html += SPECIAL_BADGES.map((b) => {
    const isUnlocked = unlocked.includes(b.id);
    return `
      <div class="badge-item ${isUnlocked ? 'unlocked' : 'locked'}">
        <div class="badge-icon">${b.icon}</div>
        <div class="badge-name">${escapeHTML(b.name)}</div>
        <div class="badge-rarity">${b.rarity}</div>
        <div class="badge-desc">${isUnlocked ? escapeHTML(b.desc) : 'Locked'}</div>
      </div>`;
  }).join('');
  html += '</div>';

  elBadges.innerHTML = html;
}

// ===================================================================
// TIMER CALLBACKS
// ===================================================================

onTick((state) => {
  const elTimer = qs<HTMLElement>('#focus-timer');
  const elRing = qs<HTMLElement>('#focus-ring') as unknown as SVGCircleElement;
  if (elTimer) {
    const m = state.minutes.toString().padStart(2, '0');
    const s = state.seconds.toString().padStart(2, '0');
    elTimer.textContent = `${m}:${s}`;
  }
  if (elRing) {
    const total = TIMER_MODES[state.mode].minutes * 60;
    const elapsed = total - (state.minutes * 60 + state.seconds);
    elRing.style.strokeDashoffset = `${691 * (1 - elapsed / total)}`;
  }
});

onComplete((mode) => {
  showCelebrate('Focus Complete', 'Take a real break. No phone.', '⏱️', false, mode.xp);
  const btn = qs<HTMLElement>('#focus-btn');
  if (btn) btn.textContent = 'Start';
  updateDashboard();
  checkQuests();
  renderFlowBanner();
  recordDailyStat();
  renderWeekly();
  if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
});

onUrgeTick((state) => {
  const elTimer = qs<HTMLElement>('#urge-timer');
  const elRing = qs<HTMLElement>('#urge-ring') as unknown as SVGCircleElement;
  if (elTimer) {
    const m = state.minutes.toString().padStart(2, '0');
    const s = state.seconds.toString().padStart(2, '0');
    elTimer.textContent = `${m}:${s}`;
  }
  if (elRing) {
    elRing.style.strokeDashoffset = `${691 * (1 - state.pct / 100)}`;
  }
});

onUrgeComplete(() => {
  showCelebrate('Urge Surfed', 'You are stronger than your impulses.', '🌊');
  const btn = qs<HTMLElement>('#urge-start-btn');
  if (btn) btn.textContent = 'Start Surf';
});

// ===================================================================
// INITIALIZATION
// ===================================================================

function init() {
  // Service Worker: vite-plugin-pwa handles registration via registerSW.js
  // Fallback base-aware registration only if not already controlled
  if ('serviceWorker' in navigator) {
    const base = (import.meta.env.BASE_URL as string) || '/neurofocusx/';
    setTimeout(() => {
      if (!navigator.serviceWorker.controller) {
        navigator.serviceWorker.register(`${base}sw.js`).catch((err) => {
          console.debug('SW fallback registration:', (err as Error)?.message || err);
        });
      }
    }, 2000);
  }
  try {
    loadTheme();
  } catch (e) {
    console.warn('Theme load failed', e);
  }
  updateThemeButtons();
  try {
    resetHabitsForNewDay();
  } catch {}
  try {
    generateDailyQuests();
  } catch {}

  // Initial renders - each wrapped to prevent one failure breaking entire app
  const safe = (fn: () => void, label: string) => {
    try {
      fn();
    } catch (e) {
      console.error(`Render failed [${label}]`, e);
    }
  };

  safe(() => renderHabits(), 'habits');
  safe(() => renderBacklogs(), 'backlogs');
  safe(() => renderBattle(), 'battle');
  safe(() => renderDailyChecks(), 'dailyChecks');
  safe(() => renderXP(), 'xp');
  safe(() => renderQuests(), 'quests');
  safe(() => renderRitual(), 'ritual');
  safe(() => renderSubjects(), 'subjects');
  safe(() => renderFlowBanner(), 'flow');
  safe(() => renderStreak(), 'streak');
  safe(() => renderBuddy(), 'buddy');
  safe(() => renderWeekly(), 'weekly');
  safe(() => updateDashboard(), 'dashboard');
  safe(() => renderTrophyPreview(), 'trophyPreview');
  safe(() => recordDailyStat(), 'recordStat');
  safe(() => checkQuests(), 'checkQuests');
  safe(() => checkBadges(), 'checkBadges');
  safe(() => renderProfile(), 'profile');
  safe(() => renderSession(), 'session');
  safe(() => renderQuote(), 'quote');
  safe(() => renderFocusHistory(), 'focusHistory');
  safe(() => updateFocusUI(), 'focusTimer');
  safe(() => renderHero(), 'hero');

  // Setup auto-theme checkbox
  const atEl = qs<HTMLInputElement>('#auto-theme');
  if (atEl) {
    try {
      atEl.checked = !!data.autoTheme;
    } catch {}
  }

  // Setup event listeners
  try {
    setupEventListeners();
  } catch (e) {
    console.error('Failed to setup listeners', e);
  }
  renderAccountSettings();
  // Restore a returning account without blocking offline startup.
  void restoreAuthSession().then(async (user) => {
    if (!user) {
      renderSession();
      return;
    }
    try {
      const result = await syncOnLogin();
      if (result.kind === 'conflict') {
        await syncOnLogin(askSyncChoice());
      }
      renderAccountSettings();
      updateDashboard();
    } catch {
      renderAccountSettings();
    }
  });
  onAuthChange((user) => {
    renderAccountSettings();
    if (!user) return;
    renderSession();
    void syncOnLogin()
      .then(async (result) => {
        if (result.kind === 'conflict') {
          await syncOnLogin(askSyncChoice());
        }
        updateDashboard();
        renderAccountSettings();
      })
      .catch(() => {
        showCelebrate('Sync unavailable', 'Your local progress is still safe.', '⚠️', true);
      });
  });

  // Header scroll effect
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const header = qs<HTMLElement>('#app-header');
        if (header) header.classList.toggle('scrolled', window.scrollY > 10);
        ticking = false;
      });
      ticking = true;
    }
  });
}

// Start the app with global error handler
try {
  init();
} catch (e) {
  console.error('NeuroFocusX init crashed', e);
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;inset:0;z-index:9999;background:#050810;color:#fff;display:flex;align-items:center;justify-content:center;padding:20px;text-align:center;font-family:sans-serif';
  el.innerHTML = `<div><h2>⚠️ Something went wrong</h2><p>Please refresh. If persists, clear site data from Settings.</p><pre style="font-size:12px;opacity:0.7;margin-top:12px;max-width:90vw;overflow:auto">${escapeHTML(String(e))}</pre><button id="nf-crash-clear-btn" type="button" style="margin-top:16px;padding:10px 20px;background:#00d9ff;color:#000;border:none;border-radius:8px;font-weight:700">Clear Data & Reload</button></div>`;
  el.querySelector<HTMLButtonElement>('#nf-crash-clear-btn')?.addEventListener('click', () => {
    localStorage.clear();
    location.reload();
  });
  document.body.appendChild(el);
}
