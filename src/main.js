/**
 * NeuroFocus v14 — Main Entry Point
 * Wires modules to the DOM and initializes the app.
 */

import { data, resetHabitsForNewDay } from './modules/data.js';
import { xpLevel, xpForLevel, addXP } from './modules/xp.js';
import { getCurrentRank, getNextRank } from './modules/ranks.js';
import { checkBadges, SPECIAL_BADGES, TOTAL_BADGES } from './modules/badges.js';
import { generateDailyQuests, checkQuests } from './modules/quests.js';
import { toggleStep, getRitual, RITUAL_STEPS, RITUAL_ICONS } from './modules/ritual.js';
import { claimStreak, useFreeze, canUseFreeze, getStreakInfo } from './modules/streak.js';
import { getSubjectsWithInfo } from './modules/subjects.js';
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
} from './modules/focus.js';
import {
  startTimer as startUrge,
  resetTimer as resetUrge,
  getState as getUrgeState,
  onTick as onUrgeTick,
  onComplete as onUrgeComplete,
} from './modules/urge.js';
import { addBacklog, incrementBacklog, deleteBacklog, getBacklogs } from './modules/backlogs.js';
import { addHabit, toggleHabit, deleteHabit, getHabits } from './modules/habits.js';
import { addTask, toggleTask, deleteTask, getTasksSorted } from './modules/battle.js';
import { recordDailyStat, getWeekStats, getWeekTotals } from './modules/weekly.js';
import { setBuddy, removeBuddy, getBuddy, shareProgress } from './modules/buddy.js';
import { setTheme, loadTheme, setAutoTheme, getCurrentTheme } from './modules/theme.js';
import { getDailyQuote } from './modules/quotes.js';
import { showCelebrate, hideCelebrate, hideRankUp } from './modules/celebration.js';
import {
  initFirebase,
  saveConfig,
  login,
  signup,
  logout,
  getCurrentUser,
  scheduleSync,
} from './modules/firebase.js';
import { escapeHTML } from './utils/sanitize.js';
import { qs, qsa } from './utils/dom.js';
import { todayStr, currentDOW, DAY_LABELS } from './utils/date.js';
import { validateProfileName, validateMission } from './utils/validation.js';

// ===================================================================
// STATE
// ===================================================================

let selectedBacklogSubject = 'Physics';
let dailyChecksBuilt = false;

// ===================================================================
// TAB NAVIGATION
// ===================================================================

function switchTab(tabId) {
  // Hide all tabs
  qsa('.tab-content').forEach((el) => el.classList.add('hidden'));

  // Show target tab
  const target = qs(`#tab-${tabId}`);
  if (target) {
    target.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Update nav active state
  qsa('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  // Refresh home dashboard
  if (tabId === 'home') updateDashboard();
}

// ===================================================================
// RENDER FUNCTIONS
// ===================================================================

function renderXP() {
  const info = xpLevel(data.xp);
  const elCount = qs('#xp-count');
  const elBar = qs('#xp-bar');
  const elBadge = qs('#xp-badge');
  const elNext = qs('#xp-next');

  if (elCount) elCount.textContent = `${data.xp} XP`;
  if (elBar) elBar.style.width = `${info.pct}%`;
  if (elBadge) elBadge.textContent = `Level ${info.level}`;
  if (elNext) elNext.textContent = `${info.current} / ${info.need} to next`;
}

function renderHero() {
  const rank = getCurrentRank(xpLevel(data.xp).level);
  const next = getNextRank(xpLevel(data.xp).level);
  const info = xpLevel(data.xp);

  const elIcon = qs('#hero-icon');
  const elTitle = qs('#hero-title');
  const elSub = qs('#hero-sub');
  const elBadge = qs('#hero-badge');

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
  const el = qs('#daily-quests');
  if (!el) return;

  generateDailyQuests();
  const quests = data.dailyQuests.quests;
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
  const el = qs('#ritual-grid');
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
  qsa('.ritual-step', el).forEach((step) => {
    step.addEventListener('click', () => {
      const idx = parseInt(step.dataset.idx, 10);
      const result = toggleStep(idx);
      if (result.allDone) {
        showCelebrate('Morning Ritual Complete', '2x XP Boost until noon!', '🌅');
      }
      renderRitual();
      checkQuests();
    });
  });

  // Show/hide boost banner
  const boost = qs('#ritual-boost');
  if (boost) {
    const hour = new Date().getHours();
    boost.classList.toggle('hidden', !(r.completed && r.date === todayStr() && hour < 12));
  }
}

function renderSubjects() {
  const el = qs('#subject-grid');
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
  const el = qs('#flow-banner');
  if (!el) return;
  el.classList.toggle('hidden', !isFlowActive());
}

function renderStreak() {
  const info = getStreakInfo();
  const elNum = qs('#consecutive-streak');
  const elFreeze = qs('#freeze-badge');
  const btn = qs('#freeze-btn');

  if (elNum) elNum.textContent = info.consecutive;
  if (elFreeze) elFreeze.textContent = `❄️ ${info.freezes} Freezes`;

  if (btn) {
    const canFreeze = canUseFreeze();
    btn.style.display = canFreeze ? 'inline-flex' : 'none';
  }
}

function renderBuddy() {
  const buddy = getBuddy();
  const elForm = qs('#settings-buddy-form');
  const elActive = qs('#settings-buddy-active');
  const elDisplay = qs('#settings-buddy-display');

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

  const elF = qs('#wk-focus');
  const elB = qs('#wk-backlogs');
  const elH = qs('#wk-habits');
  const elS = qs('#wk-streaks');
  const elN = qs('#week-total-num');

  if (elF) elF.textContent = totals.focus.toFixed(1);
  if (elB) elB.textContent = totals.backlogs;
  if (elH) elH.textContent = totals.habits;
  if (elS) elS.textContent = totals.streaks;
  if (elN) elN.textContent = totals.score;

  // Bar chart
  const elWrap = qs('#week-bar-wrap');
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
  const el = qs('#daily-checks');
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
    const status = qs('#checkin-status');
    const btn = qs('#claim-btn');
    if (status) status.style.display = 'none';
    if (btn) btn.style.display = 'none';
    return;
  }

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
      const row = qs(`#row-${item.id}`);
      const chk = qs(`#chk-${item.id}`);
      const toggle = () => {
        if (data.detoxLastDate === todayStr()) return;
        data.dailyChecks[item.id] = !data.dailyChecks[item.id];
        localStorage.setItem('nf_dailyChecks', JSON.stringify(data.dailyChecks));
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
    const row = qs(`#row-${item.id}`);
    const chk = qs(`#chk-${item.id}`);
    if (row) row.classList.toggle('done', checked);
    if (chk) chk.checked = checked;
  });

  const status = qs('#checkin-status');
  const btn = qs('#claim-btn');
  const allChecked = doneCount === CHECK_ITEMS.length;

  if (status) {
    status.style.display = 'block';
    if (allChecked) {
      status.textContent = 'All 7 checks complete. Claim your streak.';
      status.style.color = 'var(--success)';
    } else {
      status.textContent = `${doneCount} / 7 checks — complete all to claim`;
      status.style.color = 'var(--danger)';
    }
  }

  if (btn) {
    btn.style.display = 'block';
    btn.disabled = !allChecked;
    btn.style.opacity = allChecked ? '1' : '0.5';
  }
}

function renderBacklogs() {
  const el = qs('#backlog-list');
  if (!el) return;

  const backlogs = getBacklogs();
  if (!backlogs.length) {
    el.innerHTML =
      '<div class="empty"><div class="empty-icon">📚</div>No backlogs yet. Add your first lecture.</div>';
    return;
  }

  const SUBJECT_MAP = {
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
  qsa('[data-action="inc-backlog"]', el).forEach((btn) => {
    btn.addEventListener('click', () => {
      incrementBacklog(parseInt(btn.dataset.id, 10));
      renderBacklogs();
      updateDashboard();
    });
  });
  qsa('[data-action="del-backlog"]', el).forEach((btn) => {
    btn.addEventListener('click', () => {
      deleteBacklog(parseInt(btn.dataset.id, 10));
      renderBacklogs();
      updateDashboard();
    });
  });
}

function renderHabits() {
  const el = qs('#habit-list');
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

  qsa('[data-action="toggle-habit"]', el).forEach((btn) => {
    btn.addEventListener('click', () => {
      toggleHabit(parseInt(btn.dataset.id, 10));
      renderHabits();
      updateDashboard();
    });
  });
  qsa('[data-action="del-habit"]', el).forEach((btn) => {
    btn.addEventListener('click', () => {
      deleteHabit(parseInt(btn.dataset.id, 10));
      renderHabits();
      updateDashboard();
    });
  });
}

function renderBattle() {
  const el = qs('#battle-list');
  if (!el) return;

  const tasks = getTasksSorted();
  const colors = { A: 'var(--danger)', B: '#f59e0b', C: 'var(--success)' };

  if (!tasks.length) {
    el.innerHTML =
      '<div class="empty"><div class="empty-icon">⚔️</div>No battle tasks. Plan your 6 priorities.</div>';
    return;
  }

  el.innerHTML = tasks
    .map(
      (t) => `
      <div class="list-item" style="border-left:3px solid ${colors[t.pri] || colors.C}">
        <div class="flex items-center gap-3 flex-1" style="min-width:0">
          <input type="checkbox" ${t.done ? 'checked' : ''} data-action="toggle-battle" data-id="${t.id}" style="width:20px;height:20px;flex-shrink:0">
          <span class="${t.done ? 'text-tertiary' : ''}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.9rem">
            <strong style="color:var(--text-tertiary);margin-right:4px;font-size:0.75rem">[${t.pri}]</strong>${escapeHTML(t.task)} <span class="tag tag-blue">${t.time}</span>
          </span>
        </div>
        <button class="btn btn-danger btn-sm" data-action="del-battle" data-id="${t.id}">×</button>
      </div>`,
    )
    .join('');

  qsa('[data-action="toggle-battle"]', el).forEach((chk) => {
    chk.addEventListener('change', () => {
      toggleTask(parseInt(chk.dataset.id, 10));
      renderBattle();
      updateDashboard();
    });
  });
  qsa('[data-action="del-battle"]', el).forEach((btn) => {
    btn.addEventListener('click', () => {
      deleteTask(parseInt(btn.dataset.id, 10));
      renderBattle();
      updateDashboard();
    });
  });
}

function renderFocusHistory() {
  const el = qs('#focus-history');
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

  const elName = qs('#profile-name');
  const elRank = qs('#profile-rank');
  const elAvatar = qs('#profile-avatar');
  const elMission = qs('#profile-mission');
  const elInput = qs('#profile-name-input');
  const elMissionInput = qs('#mission-input');

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

  const elIcon = qs('#trophy-preview-icon');
  const elTitle = qs('#trophy-preview-title');
  const elSub = qs('#trophy-preview-sub');
  const elCount = qs('#trophy-count');

  if (elIcon) elIcon.textContent = rank.icon;
  if (elTitle) elTitle.textContent = rank.name;
  if (elSub) elSub.textContent = `${unlocked} of ${TOTAL_BADGES} badges unlocked`;
  if (elCount) elCount.textContent = `${unlocked} / ${TOTAL_BADGES}`;
}

function renderQuote() {
  const el = qs('#daily-quote');
  if (el) el.textContent = `"${getDailyQuote()}"`;
}

function renderSettingsAuth() {
  const config = localStorage.getItem('nf_firebase_config') || '';
  const setupEl = qs('#firebase-setup');
  const authPanel = qs('#firebase-auth-panel');
  const guestView = qs('#auth-guest-view');
  const userView = qs('#auth-user-view');

  if (!config) {
    if (setupEl) setupEl.classList.remove('hidden');
    if (authPanel) authPanel.classList.add('hidden');
    return;
  }

  if (setupEl) setupEl.classList.add('hidden');
  if (authPanel) authPanel.classList.remove('hidden');

  const user = getCurrentUser();
  if (user) {
    if (guestView) guestView.classList.add('hidden');
    if (userView) userView.classList.remove('hidden');
    const elEmail = qs('#auth-email-display');
    if (elEmail) elEmail.textContent = user.email;
  } else {
    if (guestView) guestView.classList.remove('hidden');
    if (userView) userView.classList.add('hidden');
  }
}

// ===================================================================
// DASHBOARD UPDATE
// ===================================================================

function updateDashboard() {
  // Stats
  const ds = qs('#d-streak');
  const db = qs('#d-backlogs');
  const df = qs('#d-focus');
  const dh = qs('#d-habits');

  if (ds) ds.textContent = data.detoxStreak || 0;
  if (db) db.textContent = data.backlogs.reduce((a, b) => a + ((b.total || 0) - (b.done || 0)), 0);
  if (df) df.textContent = (Math.floor(((data.focusMinutes || 0) / 60) * 10) / 10).toFixed(1);
  if (dh) dh.textContent = data.habits.filter((h) => h.today).length;

  // Priority section
  const dp = qs('#dash-priority');
  if (dp) {
    const inc = data.backlogs.filter((b) => (b.done || 0) < (b.total || 0));
    const ht = data.habits.filter((h) => !h.today);
    let html = '';

    if (inc.length > 0) {
      html += `<div class="list-item"><div class="info"><div class="title">${escapeHTML(inc[0].name)}</div><div class="meta">${(inc[0].total || 0) - (inc[0].done || 0)} lectures remaining</div></div><span class="tag tag-red">URGENT</span></div>`;
    }
    if (ht.length > 0) {
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

function setupEventListeners() {
  // Tab navigation
  qsa('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Settings button
  qs('#settings-btn')?.addEventListener('click', () => {
    qs('#settings-overlay')?.classList.add('show');
    renderProfile();
    renderSettingsAuth();
  });

  // Close settings
  qs('#settings-close-btn')?.addEventListener('click', () => {
    qs('#settings-overlay')?.classList.remove('show');
  });
  qs('#settings-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) qs('#settings-overlay').classList.remove('show');
  });

  // Theme buttons
  qsa('[data-theme]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setTheme(btn.dataset.theme);
      updateThemeButtons();
    });
  });

  // Auto theme toggle
  qs('#auto-theme')?.addEventListener('change', (e) => {
    setAutoTheme(e.target.checked);
  });

  // Profile name save
  qs('#save-name-btn')?.addEventListener('click', () => {
    const input = qs('#profile-name-input');
    const name = input?.value.trim();
    if (!name) return;
    const validation = validateProfileName(name);
    if (!validation.valid) {
      showCelebrate('Invalid Name', validation.error || 'Try again', '⚠️', true);
      return;
    }
    data.profileName = validation.data;
    localStorage.setItem('nf_profileName', JSON.stringify(validation.data));
    renderProfile();
    showCelebrate('Profile Updated', 'Your warrior name is set.', '👤');
  });

  // Mission save
  qs('#save-mission-btn')?.addEventListener('click', () => {
    const input = qs('#mission-input');
    const m = input?.value.trim();
    if (!m) return;
    const validation = validateMission(m);
    if (!validation.valid) {
      showCelebrate('Invalid Mission', validation.error || 'Try again', '⚠️', true);
      return;
    }
    data.mission = validation.data;
    localStorage.setItem('nf_mission', JSON.stringify(validation.data));
    renderProfile();
    showCelebrate('Mission Updated', 'Your north star is locked.', '🎯');
  });

  // Buddy
  qs('#set-buddy-btn')?.addEventListener('click', () => {
    const input = qs('#settings-buddy-name');
    const result = setBuddy(input?.value || '');
    if (!result.success) {
      showCelebrate('Invalid Name', result.error || 'Try again', '⚠️', true);
      return;
    }
    renderBuddy();
  });

  qs('#remove-buddy-btn')?.addEventListener('click', () => {
    removeBuddy();
    renderBuddy();
  });

  qs('#share-progress-btn')?.addEventListener('click', async () => {
    const result = await shareProgress();
    if (result.success) {
      showCelebrate('Progress Copied', `Send to ${data.buddyName}!`, '📤');
    }
  });

  // Reset buttons
  qs('#reset-today-btn')?.addEventListener('click', () => {
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
    localStorage.setItem('nf_dailyChecks', '{}');
    localStorage.setItem('nf_detoxLastDate', 'null');
    localStorage.setItem('nf_focusMinutes', '0');
    localStorage.setItem('nf_focusDate', JSON.stringify(todayStr()));
    localStorage.setItem('nf_flowState', JSON.stringify(data.flowState));
    localStorage.setItem('nf_morningRitual', JSON.stringify(data.morningRitual));
    localStorage.setItem('nf_dailyQuests', 'null');
    localStorage.setItem('nf_backlogsToday', '0');
    localStorage.setItem('nf_habitsToday', '0');
    dailyChecksBuilt = false;
    renderDailyChecks();
    updateDashboard();
  });

  qs('#reset-all-btn')?.addEventListener('click', () => {
    if (!confirm('⚠️ This will DELETE ALL your progress forever. Are you sure?')) return;
    if (!confirm('Really sure? This cannot be undone.')) return;
    const keys = [
      'profileName',
      'mission',
      'xp',
      'totalFocusMinutes',
      'detoxStreak',
      'consecutiveStreak',
      'lastStreakDate',
      'detoxLastDate',
      'dailyChecks',
      'dailyCheckDate',
      'backlogs',
      'habits',
      'battle',
      'focusMinutes',
      'focusDate',
      'flowState',
      'badges',
      'dailyQuests',
      'morningRitual',
      'subjects',
      'weeklyStats',
      'streakFreezes',
      'buddyName',
      'backlogsToday',
      'habitsToday',
      'sessions',
      'autoTheme',
      'theme',
    ];
    keys.forEach((k) => localStorage.removeItem(`nf_${k}`));
    location.reload();
  });

  // Trophy preview
  qs('#trophy-preview')?.addEventListener('click', () => {
    qs('#trophy-overlay')?.classList.add('show');
    updateTrophyModal();
  });

  qs('#trophy-close-btn')?.addEventListener('click', () => {
    qs('#trophy-overlay')?.classList.remove('show');
  });
  qs('#trophy-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) qs('#trophy-overlay').classList.remove('show');
  });

  // Rank up close
  qs('#rank-up-close-btn')?.addEventListener('click', hideRankUp);
  qs('#rank-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) hideRankUp();
  });

  // Celebration click to dismiss
  qs('#celebrate')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) hideCelebrate();
  });

  // Freeze button
  qs('#freeze-btn')?.addEventListener('click', () => {
    if (useFreeze()) {
      renderStreak();
      showCelebrate('Streak Saved', 'Freeze used. Your chain continues.', '❄️');
    }
  });

  // Claim streak
  qs('#claim-btn')?.addEventListener('click', () => {
    const CHECK_ITEMS = ['dc1', 'dc2', 'dc3', 'dc4', 'dc5', 'dc6', 'dc7'];
    const allChecked = CHECK_ITEMS.every((id) => !!data.dailyChecks[id]);
    if (!allChecked) return;

    const result = claimStreak();
    if (result.success) {
      addXP(50, 'Streak Verified');
      renderDailyChecks();
      updateDashboard();
      if (navigator.vibrate) navigator.vibrate([80, 40, 80, 40, 120]);
    }
  });

  // Backlog subject chips
  qsa('#bl-chip-row .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      qsa('#bl-chip-row .chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      selectedBacklogSubject = chip.dataset.sub;
      const input = qs('#bl-subject');
      if (input) input.value = chip.dataset.sub;
    });
  });

  // Add backlog
  qs('#bl-add-btn')?.addEventListener('click', () => {
    const name = qs('#bl-name')?.value || '';
    const count = qs('#bl-count')?.value || '';
    const result = addBacklog({
      name,
      count: parseInt(count, 10),
      subject: selectedBacklogSubject,
    });
    if (!result.success) {
      showCelebrate('Missing Info', result.error || 'Enter details', '⚠️', true);
      return;
    }
    if (qs('#bl-name')) qs('#bl-name').value = '';
    if (qs('#bl-count')) qs('#bl-count').value = '';
    renderBacklogs();
    updateDashboard();
  });

  // Add habit
  qs('#h-add-btn')?.addEventListener('click', () => {
    const name = qs('#h-name')?.value || '';
    const anchor = qs('#h-anchor')?.value || '';
    const result = addHabit({ name, anchor });
    if (!result.success) {
      showCelebrate('Missing Info', result.error || 'Enter a habit name', '⚠️', true);
      return;
    }
    if (qs('#h-name')) qs('#h-name').value = '';
    if (qs('#h-anchor')) qs('#h-anchor').value = '';
    renderHabits();
    updateDashboard();
  });

  // Add battle task
  qs('#bp-add-btn')?.addEventListener('click', () => {
    const task = qs('#bp-task')?.value || '';
    const priority = qs('#bp-priority')?.value || 'B';
    const time = qs('#bp-time')?.value || 'morning';
    const result = addTask({ task, priority, time });
    if (!result.success) {
      showCelebrate('Missing Info', result.error || 'Enter a task', '⚠️', true);
      return;
    }
    if (qs('#bp-task')) qs('#bp-task').value = '';
    renderBattle();
    updateDashboard();
  });

  // Focus timer modes
  qsa('.timer-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const mode = parseInt(chip.dataset.mode, 10);
      setMode(mode);
      qsa('.timer-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      updateFocusUI();
    });
  });

  // Focus start/pause
  qs('#focus-btn')?.addEventListener('click', () => {
    const state = getTimerState();
    if (state.running) {
      pauseTimer();
      qs('#focus-btn').textContent = 'Resume';
    } else {
      startTimer();
      qs('#focus-btn').textContent = 'Pause';
    }
  });

  // Focus reset
  qs('#focus-reset-btn')?.addEventListener('click', () => {
    stopTimer();
    const btn = qs('#focus-btn');
    if (btn) btn.textContent = 'Start';
    updateFocusUI();
  });

  // Urge timer
  qs('#urge-start-btn')?.addEventListener('click', () => {
    startUrge();
    qs('#urge-start-btn').textContent = 'Surfing...';
  });

  qs('#urge-reset-btn')?.addEventListener('click', () => {
    resetUrge();
    qs('#urge-start-btn').textContent = 'Start Surf';
    updateUrgeUI();
  });

  // Firebase config
  qs('#save-fb-config-btn')?.addEventListener('click', () => {
    const val = qs('#fb-config')?.value || '';
    const result = saveConfig(val);
    if (!result.success) {
      showCelebrate('Error', result.error || 'Failed', '⚠️', true);
    } else {
      showCelebrate('Connected', 'Firebase config saved!', '☁️');
      renderSettingsAuth();
    }
  });

  // Firebase auth
  qs('#login-btn')?.addEventListener('click', async () => {
    const email = qs('#auth-email')?.value || '';
    const password = qs('#auth-password')?.value || '';
    const result = await login(email, password);
    if (!result.success) {
      showCelebrate('Login Failed', result.error || 'Try again', '⚠️', true);
    }
    renderSettingsAuth();
  });

  qs('#signup-btn')?.addEventListener('click', async () => {
    const email = qs('#auth-email')?.value || '';
    const password = qs('#auth-password')?.value || '';
    const result = await signup(email, password);
    if (!result.success) {
      showCelebrate('Sign Up Failed', result.error || 'Try again', '⚠️', true);
    }
    renderSettingsAuth();
  });

  qs('#logout-btn')?.addEventListener('click', () => {
    logout();
    renderSettingsAuth();
  });

  qs('#manual-sync-btn')?.addEventListener('click', () => {
    scheduleSync(data, 0);
    showCelebrate('Synced', 'Your data is backed up to cloud.', '☁️');
  });
}

// ===================================================================
// UI UPDATE FUNCTIONS
// ===================================================================

function updateFocusUI() {
  const state = getTimerState();
  const elTimer = qs('#focus-timer');
  const elLabel = qs('#focus-mode-label');
  const elRing = qs('#focus-ring');

  if (elTimer) {
    const m = state.minutes.toString().padStart(2, '0');
    const s = state.seconds.toString().padStart(2, '0');
    elTimer.textContent = `${m}:${s}`;
  }
  if (elLabel) elLabel.textContent = state.modeLabel;
  if (elRing) {
    const offset =
      691 * (1 - (state.minutes * 60 + state.seconds) / (TIMER_MODES[state.mode].minutes * 60));
    elRing.style.strokeDashoffset = offset;
  }
}

function updateUrgeUI() {
  const state = getUrgeState();
  const elTimer = qs('#urge-timer');
  const elRing = qs('#urge-ring');

  if (elTimer) {
    const m = state.minutes.toString().padStart(2, '0');
    const s = state.seconds.toString().padStart(2, '0');
    elTimer.textContent = `${m}:${s}`;
  }
  if (elRing) {
    const offset = 691 * (1 - state.pct / 100);
    elRing.style.strokeDashoffset = offset;
  }
}

function updateThemeButtons() {
  const current = getCurrentTheme();
  qsa('[data-theme]').forEach((btn) => {
    const isActive = btn.dataset.theme === current;
    btn.style.boxShadow = isActive
      ? '0 0 0 2px var(--accent-start), 0 0 12px var(--shadow)'
      : 'none';
  });
}

async function updateTrophyModal() {
  const rank = getCurrentRank(xpLevel(data.xp).level);
  const next = getNextRank(xpLevel(data.xp).level);
  const unlocked = data.badgesUnlocked || [];
  const info = xpLevel(data.xp);

  // Update rank display in modal
  const elIcon = qs('#trophy-rank-icon');
  const elName = qs('#trophy-rank-name');
  const elTier = qs('#trophy-rank-tier');
  const elNext = qs('#trophy-rank-next');

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
  const elBadges = qs('#trophy-badges');
  if (!elBadges) return;

  const { RANK_TIERS } = await import('./modules/ranks.js');

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
  const elTimer = qs('#focus-timer');
  const elRing = qs('#focus-ring');
  if (elTimer) {
    const m = state.minutes.toString().padStart(2, '0');
    const s = state.seconds.toString().padStart(2, '0');
    elTimer.textContent = `${m}:${s}`;
  }
  if (elRing) {
    const total = TIMER_MODES[state.mode].minutes * 60;
    const elapsed = total - (state.minutes * 60 + state.seconds);
    elRing.style.strokeDashoffset = 691 * (1 - elapsed / total);
  }
});

onComplete((mode) => {
  showCelebrate('Focus Complete', 'Take a real break. No phone.', '⏱️', false, mode.xp);
  const btn = qs('#focus-btn');
  if (btn) btn.textContent = 'Start';
  updateDashboard();
  checkQuests();
  renderFlowBanner();
  recordDailyStat();
  renderWeekly();
  if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
});

onUrgeTick((state) => {
  const elTimer = qs('#urge-timer');
  const elRing = qs('#urge-ring');
  if (elTimer) {
    const m = state.minutes.toString().padStart(2, '0');
    const s = state.seconds.toString().padStart(2, '0');
    elTimer.textContent = `${m}:${s}`;
  }
  if (elRing) {
    elRing.style.strokeDashoffset = 691 * (1 - state.pct / 100);
  }
});

onUrgeComplete(() => {
  showCelebrate('Urge Surfed', 'You are stronger than your impulses.', '🌊');
  const btn = qs('#urge-start-btn');
  if (btn) btn.textContent = 'Start Surf';
});

// ===================================================================
// INITIALIZATION
// ===================================================================

function init() {
  // Register service worker for background timer support
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  }
  loadTheme();
  updateThemeButtons();
  resetHabitsForNewDay();
  initFirebase();
  generateDailyQuests();

  // Initial renders
  renderHabits();
  renderBacklogs();
  renderBattle();
  renderDailyChecks();
  renderXP();
  renderQuests();
  renderRitual();
  renderSubjects();
  renderFlowBanner();
  renderStreak();
  renderBuddy();
  renderWeekly();
  updateDashboard();
  renderTrophyPreview();
  recordDailyStat();
  checkQuests();
  checkBadges();
  renderProfile();
  renderQuote();
  renderFocusHistory();
  renderHero();

  // Setup auto-theme checkbox
  const atEl = qs('#auto-theme');
  if (atEl) atEl.checked = !!data.autoTheme;

  // Setup event listeners
  setupEventListeners();

  // Header scroll effect
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const header = qs('#app-header');
        if (header) header.classList.toggle('scrolled', window.scrollY > 10);
        ticking = false;
      });
      ticking = true;
    }
  });
}

// Start the app
init();
