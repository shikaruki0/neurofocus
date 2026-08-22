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
 *  - Full in-app internationalization re-rendering on language change
 */

// Import styles directly so Vite bundles them correctly (fixes 404s when base is /neurofocusx/)
import './styles/variables.css';
import './styles/base.css';
import './styles/components.css';
import './styles/premium-select.css';
import './styles/confirm-dialog.css';
import './styles/animations.css';
import './styles/onboarding.css';
import './styles/neural-atlas.css';
import './styles/desktop.css';
import './styles/home-premium.css';
import './styles/home-desktop.css';

import {
  applyDailyResets,
  data,
  persist,
  persistMany,
  resetHabitsForNewDay,
} from './modules/data.ts';
import { clearAll } from './modules/storage.ts';
import { xpLevel, xpForLevel, addXP, onLevelUp } from './modules/xp.ts';
import { getCurrentRank, getNextRank, RANK_TIERS } from './modules/ranks.ts';
import { checkBadges, SPECIAL_BADGES, TOTAL_BADGES } from './modules/badges.ts';
import { generateDailyQuests, checkQuests } from './modules/quests.ts';
import { toggleStep, getRitual, RITUAL_STEPS, RITUAL_ICONS } from './modules/ritual.ts';
import { claimStreak, useFreeze, canUseFreeze, getStreakInfo } from './modules/streak.ts';
import { getSubjectsWithInfo } from './modules/subjects.ts';
import { enhancePremiumSelect } from './modules/premiumSelect.ts';
import {
  setMode,
  setCustomBlock,
  startTimer,
  pauseTimer,
  stopTimer,
  getTimerState,
  getRecentSessions,
  isFlowActive,
  isPausedMidSession,
  onTick,
  onComplete,
  consumePendingCompletion,
  TIMER_MODES,
  MISSION_BLOCK_LABEL,
  type TimerMode,
  type TimerState,
} from './modules/focus.ts';
import {
  startTimer as startUrge,
  resetTimer as resetUrge,
  getState as getUrgeState,
  onTick as onUrgeTick,
  onComplete as onUrgeComplete,
  consumePendingCompletion as consumePendingUrgeCompletion,
} from './modules/urge.ts';
import {
  addBacklog,
  incrementBacklog,
  decrementBacklog,
  deleteBacklog,
  findBacklogForChapter,
  getBacklogs,
  getBacklogsGroupedBySubject,
  getPendingChapterCount,
} from './modules/backlogs.ts';
import type { BacklogInput, Backlog } from './modules/backlogs.ts';
import { recommendMission, calculateBlocks, buildMissionSetup } from './modules/missionPlanner.ts';
import {
  startMission,
  getActiveMission,
  getCurrentBlock,
  getCurrentBlockNumber,
  completeCurrentBlock,
  startNextBlock,
  endMission,
  resumeMission,
  clearMission,
} from './modules/mission.ts';
import {
  completeDailyClassCheck,
  completeInitialBacklogSetup,
  getStudentProfile,
  hasCompletedInitialBacklogSetup,
  isAcademicSetupComplete,
  isNcertClass10Enabled,
  saveStudentProfile,
  shouldAskDailyClassCheck,
  skipDailyClassCheck,
  validateDailyAttendance,
} from './modules/student.ts';
import type { SecondLanguageChoice, StudentProfile } from './modules/student.ts';
import {
  findNcertChapter,
  formatChapterOptionLabel,
  getSubjectOptionsForProfile,
  makeUnassignedChapter,
} from './modules/ncert.ts';
import { addHabit, toggleHabit, deleteHabit, getHabits } from './modules/habits.ts';
import { addTask, toggleTask, deleteTask, getTasksSorted } from './modules/battle.ts';
import { recordDailyStat, getWeekStats, getWeekTotals } from './modules/weekly.ts';
import { setBuddy, removeBuddy, getBuddy, shareProgress } from './modules/buddy.ts';
import { setTheme, loadTheme, setAutoTheme, getCurrentTheme } from './modules/theme.ts';
import { getDailyQuote } from './modules/quotes.ts';
import { showCelebrate, hideCelebrate, hideRankUp, showRankUp } from './modules/celebration.ts';
import { confirmDialog } from './modules/confirmDialog.ts';
import { endLocalSession, isSessionStarted, startLocalSession } from './modules/session.ts';
import {
  startAlarmLoop,
  stopAlarmLoop,
  isAlarmLooping,
  stopTitleFlash,
  startTitleFlash,
  vibrateStrong,
  vibrateSoft,
  getSoundSettings,
  updateSoundSettings,
  playTestSound,
  type SoundPack,
} from './modules/sound.ts';
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  showFocusCompleteNotification,
  showUrgeCompleteNotification,
} from './modules/notification.ts';
import {
  currentUser,
  isEmailAuthConfigured,
  onAuthChange,
  restoreAuthSession,
  signInWithEmailPassword,
  signUpWithEmailPassword,
  validatePassword,
  resendConfirmationEmail,
  requestPasswordReset,
  updatePasswordAfterReset,
  logout,
  supabase,
} from './modules/auth.ts';
import {
  createLocalBackup,
  syncOnLogin,
  syncNow,
  startAutoSync,
  bindLocalDataToUser,
  pullIfCloudNewer,
} from './modules/cloudSync.ts';
import { exportAll } from './modules/storage.ts';
import {
  applyTranslations,
  detectInitialLocale,
  getLocale,
  getSupportedLocales,
  hasChosenLanguage,
  initI18n,
  markLanguageChosen,
  onLocaleChange,
  previewIn,
  setLocale,
  t,
} from './modules/i18n.ts';
import type { LocaleCode, TranslationKey } from './modules/i18n.ts';
import { hasSeenWelcome, markWelcomeSeen } from './modules/onboarding.ts';
import {
  validateImportData,
  applyImport,
  readImportFile,
  MAX_IMPORT_FILE_BYTES,
} from './modules/progressImport.ts';
import { escapeHTML } from './utils/sanitize.ts';
import { qs, qsa } from './utils/dom.ts';
import {
  todayStr,
  currentDOW,
  DAY_LABELS,
  localISODate,
  shiftISODate,
  isValidISODate,
  parseLocalISODate,
} from './utils/date.ts';
import { getDailyFocusHistory } from './modules/focusHistory.ts';
import {
  clearFocusSessionsForDate,
  getTodayFocusHours,
  reconcileDailyFocus,
} from './modules/focusDaily.ts';
import { validateProfileName, validateMission, validateMissionSetup } from './utils/validation.ts';

// ===================================================================
// STATE
// ===================================================================

let selectedBacklogSubject = 'Physics';
let setupBacklogSubject = 'Physics';
let dailyMissedSubject = 'Physics';
let dailyChecksBuilt = false;
let lastDailyCheckDate = '';
let dailyMissTarget = 0;
let dailyMissAssigned = 0;
let dailyAttendanceDraft = { totalHeld: 0, attended: 0, missed: 0 };

// Mission planner state (planning layer only — does not touch timer/XP/backlog)
let missionSelectedSubject = '';
let missionDraftBacklogId: number | null = null;
// True once the user hand-edits the mission title (stops chapter auto-fill).
let missionTitleTouched = false;
// Transient banner shown after a block completes, until the user picks an option.
let lastBlockCompletionMinutes: number | null = null;
let focusHistoryDate = localISODate();

// ===================================================================
// TAB NAVIGATION
// ===================================================================

function switchTab(tabId: string) {
  // Guard: an unknown tab must never blank the app (all tabs hidden, none shown).
  const target = qs<HTMLElement>(`#tab-${tabId}`);
  if (!target) return;

  // Hide all tabs
  qsa<HTMLElement>('.tab-content').forEach((el) => el.classList.add('hidden'));

  // Show target tab
  target.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });

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
  if (elBadge) elBadge.textContent = t('common.level', { level: info.level });
  if (elNext)
    elNext.textContent = t('common.xp_to_next', { current: info.current, need: info.need });
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
  if (elSub)
    elSub.textContent = t('common.level_progress', {
      level: info.level,
      current: info.current,
      need: info.need,
    });
  if (elBadge) {
    // In premium layout, #hero-badge shows "Level N" beside the rank name
    const isPremium = !!qs<HTMLElement>('.tab-home-premium');
    if (isPremium) {
      elBadge.textContent = t('common.level', { level: info.level });
    } else {
      elBadge.textContent = next
        ? t('rank.next_at', { name: next.name, level: next.level })
        : t('rank.max_rank');
    }
  }
}

/** Draws the Focus trend as a trading-style line/area chart over the last 7 days. */
function renderHomePremiumTrend(): void {
  const stats = getWeekStats();
  const values = stats.map((s) => s.focus || 0);
  const W = 300,
    H = 96,
    padX = 8,
    padTop = 12,
    padBot = 12;
  const n = values.length;
  const max = Math.max(...values, 0.5);
  const xAt = (i: number) => padX + (i * (W - 2 * padX)) / Math.max(1, n - 1);
  const yAt = (v: number) => H - padBot - (v / max) * (H - padTop - padBot);
  const seg = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`)
    .join(' ');
  const line = qs<HTMLElement>('#p-trend-line');
  if (line) line.setAttribute('d', seg);
  const area = qs<HTMLElement>('#p-trend-area');
  if (area)
    area.setAttribute(
      'd',
      `${seg} L ${xAt(n - 1).toFixed(1)} ${H - padBot} L ${xAt(0).toFixed(1)} ${H - padBot} Z`,
    );
  const last = n - 1;
  const lx = xAt(last).toFixed(1);
  const ly = yAt(values[last] || 0).toFixed(1);
  const dot = qs<HTMLElement>('#p-trend-dot');
  const halo = qs<HTMLElement>('#p-trend-halo');
  if (dot) {
    dot.setAttribute('cx', lx);
    dot.setAttribute('cy', ly);
  }
  if (halo) {
    halo.setAttribute('cx', lx);
    halo.setAttribute('cy', ly);
  }
  const now = qs<HTMLElement>('#p-trend-now');
  if (now) now.textContent = `${(values[last] || 0).toFixed(1)}h`;
}

function renderHomePremium() {
  const root = qs<HTMLElement>('.tab-home-premium');
  if (!root) return;

  const info = xpLevel(data.xp);
  const next = getNextRank(info.level);
  const streakInfo = getStreakInfo();
  const totals = getWeekTotals();

  // Time-aware greeting + profile name
  const greetEl = qs<HTMLElement>('#p-greeting');
  if (greetEl) {
    const h = new Date().getHours();
    const key: TranslationKey =
      h < 12
        ? 'home.greeting_morning'
        : h < 17
          ? 'home.greeting_afternoon'
          : 'home.greeting_evening';
    greetEl.textContent = t(key);
  }
  const nameEl = qs<HTMLElement>('#p-name');
  if (nameEl) nameEl.textContent = data.profileName || 'Warrior';

  // Friendly "N XP to NextRank" label (overrides the raw renderXP value).
  // `info.need` is the FULL requirement for the current level — showing it here
  // told a player with 80/100 XP they still needed "100 XP to Apprentice".
  // The real remaining distance to the next rank is total-to-rank minus current XP.
  const xpNext = qs<HTMLElement>('#xp-next');
  if (xpNext) {
    xpNext.textContent = next
      ? t('home.xp_to_next', { xp: xpForLevel(next.level) - data.xp, rank: next.name })
      : t('rank.max_rank');
  }

  // Freeze chip number (visible) — #freeze-badge stays populated by renderStreak as sr-only
  const freezeNum = qs<HTMLElement>('#p-freeze-num');
  if (freezeNum) freezeNum.textContent = String(streakInfo.freezes);

  // Note: Focus stat (#d-focus) is set in updateDashboard() with just the number.
  // The "h" suffix is added via CSS content property or we add it here for clarity.
  // This keeps Home and "Today's Focus" panel showing the same value.
  const focusHours = getTodayFocusHours();

  // Weekly average pill + big focus-hours number (overrides renderWeekly's score)
  const avgEl = qs<HTMLElement>('#p-week-avg');
  if (avgEl) avgEl.textContent = t('home.wk_avg_per_day', { hours: (totals.focus / 7).toFixed(1) });
  const weekNum = qs<HTMLElement>('#week-total-num');
  if (weekNum) weekNum.textContent = totals.focus.toFixed(1);

  // Focus trend line chart (centerpiece)
  renderHomePremiumTrend();
}

/** Keeps the Home focus trend fresh (e.g. during/after a focus session). */
function wireHomePremiumFocus() {
  const root = qs<HTMLElement>('.tab-home-premium');
  if (!root) return;
  if ((root as HTMLElement & { __premiumWired?: boolean }).__premiumWired) return;
  (root as HTMLElement & { __premiumWired?: boolean }).__premiumWired = true;
  window.setInterval(() => {
    if (!qs<HTMLElement>('.tab-home-premium')) return;
    renderHomePremiumTrend();
  }, 30000);
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
    .map((q, i) => {
      const labelText = t(`quest.${q.id}` as TranslationKey) || q.label;
      const btnText = q.completed ? t('quest.done') : t('quest.pending');
      return `
      <div class="quest-item ${q.completed ? 'done' : ''}">
        <div class="quest-icon">${icons[i]}</div>
        <div class="quest-info">
          <div class="quest-title">${escapeHTML(labelText)}</div>
          <div class="quest-reward">+${q.reward} XP</div>
        </div>
        <div class="quest-btn ${q.completed ? 'done' : ''}">${escapeHTML(btnText)}</div>
      </div>`;
    })
    .join('');
}

function renderRitual() {
  const el = qs<HTMLElement>('#ritual-grid');
  if (!el) return;

  const r = getRitual();
  el.innerHTML = RITUAL_STEPS.map((s, i) => {
    const stepLabel = t(`ritual.step${i + 1}` as TranslationKey) || s;
    return `
    <div class="ritual-step ${r.steps[i] ? 'done' : ''}" data-idx="${i}" tabindex="0" role="button" aria-pressed="${r.steps[i]}">
      <div class="ritual-circle">${RITUAL_ICONS[i]}</div>
      <div class="ritual-label">${escapeHTML(stepLabel)}</div>
    </div>`;
  }).join('');

  // Add click and keyboard handlers
  qsa<HTMLElement>('.ritual-step', el).forEach((step) => {
    const handleToggle = () => {
      const idx = parseInt((step as HTMLElement).dataset.idx || '0', 10);
      const result = toggleStep(idx);
      if (result.allDone) {
        showCelebrate('Morning Ritual Complete', '2x XP Boost until noon!', '🌅');
      }
      renderRitual();
      checkQuests();
    };

    step.addEventListener('click', handleToggle);
    step.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleToggle();
      }
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
    .map((s) => {
      const subjectName = t(`subject.${s.key}` as TranslationKey) || s.name;
      const levelText = t('common.level_progress', {
        level: s.level,
        current: s.current,
        need: s.need,
      });
      return `
      <div class="subject-card ${s.cls}">
        <div class="subject-name" style="color:${s.color}">${escapeHTML(subjectName)}</div>
        <div class="subject-level">${escapeHTML(levelText)}</div>
        <div class="subject-bar">
          <div class="subject-fill" style="width:${s.pct}%;background:${s.color}"></div>
        </div>
      </div>`;
    })
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
  const cmdFreeze = qs<HTMLElement>('#freeze-count-cmd');
  const cmdStreak = qs<HTMLElement>('#cmd-streak-num');

  if (elNum) elNum.textContent = String(info.consecutive);
  if (elFreeze) elFreeze.textContent = t('home.freezes_count', { count: info.freezes });
  if (cmdFreeze) cmdFreeze.textContent = String(info.freezes);
  if (cmdStreak) cmdStreak.textContent = String(info.consecutive);

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
  const dayKeys: TranslationKey[] = [
    'day.sun',
    'day.mon',
    'day.tue',
    'day.wed',
    'day.thu',
    'day.fri',
    'day.sat',
  ];

  elWrap.innerHTML = stats
    .map((s, i) => {
      const pct = Math.min(100, ((s.score || 0) / maxScore) * 100);
      const isToday = i === todayIdx;
      const d = new Date(s.date);
      const label = isToday ? t('day.today') : t(dayKeys[d.getDay()]);
      return `
        <div class="week-bar-item ${isToday ? 'week-bar-today' : ''}">
          <div class="week-bar-track">
            <div class="week-bar-fill" style="height:${pct}%"></div>
          </div>
          <div class="week-bar-label">${escapeHTML(label)}</div>
        </div>`;
    })
    .join('');
}

function renderDailyChecks() {
  const el = qs<HTMLElement>('#daily-checks');
  if (!el) return;

  const CHECK_ITEMS = [
    { id: 'dc1' },
    { id: 'dc2' },
    { id: 'dc3' },
    { id: 'dc4' },
    { id: 'dc5' },
    { id: 'dc6' },
    { id: 'dc7' },
  ];

  const claimed = data.detoxLastDate === todayStr();

  if (claimed) {
    el.innerHTML = `<div class="text-center" style="padding:14px;color:var(--success);font-weight:700;font-size:0.9rem">${escapeHTML(t('home.verification_claimed'))}</div>`;
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
    el.innerHTML = CHECK_ITEMS.map((item) => {
      const itemLabel = t(`check.${item.id}` as TranslationKey);
      return `
      <div class="check-row" id="row-${item.id}" tabindex="0" role="checkbox" aria-checked="false">
        <input type="checkbox" id="chk-${item.id}" tabindex="-1">
        <label>${escapeHTML(itemLabel)}</label>
      </div>`;
    }).join('');

    // Add click and keyboard handlers
    CHECK_ITEMS.forEach((item) => {
      const row = qs<HTMLElement>(`#row-${item.id}`);
      const chk = qs<HTMLInputElement>(`#chk-${item.id}`);
      const toggle = () => {
        if (data.detoxLastDate === todayStr()) return;
        data.dailyChecks[item.id] = !data.dailyChecks[item.id];
        // Write through the storage module so cloud sync notices the change
        // (raw localStorage.setItem here used to skip the cloud-push trigger).
        persist('dailyChecks');
        dailyChecksBuilt = false; // force re-render of checks state
        renderDailyChecks();
      };
      if (row) {
        row.addEventListener('click', toggle);
        row.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        });
      }
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
    if (row) {
      row.classList.toggle('done', checked);
      row.setAttribute('aria-checked', String(checked));
    }
    if (chk) chk.checked = checked;
  });

  const status = qs<HTMLElement>('#checkin-status');
  const btn = qs<HTMLButtonElement>('#claim-btn');
  const allChecked = doneCount === CHECK_ITEMS.length;

  if (status) {
    (status as HTMLElement).style.display = 'block';
    if (allChecked) {
      status.textContent = t('home.checks_status_all');
      (status as HTMLElement).style.color = 'var(--success)';
    } else {
      status.textContent = t('home.checks_status_progress', { done: doneCount });
      (status as HTMLElement).style.color = 'var(--danger)';
    }
  }

  if (btn) {
    (btn as HTMLElement).style.display = 'block';
    btn.disabled = !allChecked;
    (btn as HTMLElement).style.opacity = allChecked ? '1' : '0.5';
  }
}

const FALLBACK_BACKLOG_SUBJECTS = [
  { key: 'Physics', label: 'Physics' },
  { key: 'Chemistry', label: 'Chemistry' },
  { key: 'Math', label: 'Math' },
  { key: 'Biology', label: 'Biology' },
  { key: 'English', label: 'English' },
  { key: 'Hindi', label: 'Hindi' },
  { key: 'Other', label: 'Other' },
];

function subjectClass(subject: string): string {
  const map: Record<string, string> = {
    Physics: 'physics',
    Chemistry: 'chem',
    Math: 'math',
    Biology: 'bio',
    History: 'english',
    Geography: 'it',
    Economics: 'math',
    English: 'english',
    Hindi: 'hindi',
    'Hindi Course A': 'hindi',
    'Hindi Course B': 'hindi',
    Sanskrit: 'hindi',
    Urdu: 'hindi',
    IT: 'it',
    Other: 'other',
  };
  return map[subject] || 'other';
}

function getActiveSubjectOptions(profile: StudentProfile | null = getStudentProfile()) {
  const ncertOptions = getSubjectOptionsForProfile(profile);
  if (ncertOptions.length) return ncertOptions;
  return FALLBACK_BACKLOG_SUBJECTS.map((subject) => ({
    key: subject.key,
    label: subject.label,
    chapters: [],
  }));
}

function updateChapterSelect(
  subjectSelect: HTMLSelectElement,
  chapterSelect: HTMLSelectElement,
  profile: StudentProfile | null = getStudentProfile(),
): void {
  const selectedSubject = subjectSelect.value || 'Physics';
  const options = getSubjectOptionsForProfile(profile);
  const subject = options.find((item) => item.key === selectedSubject);
  chapterSelect.textContent = '';

  if (!subject) {
    const option = document.createElement('option');
    option.value = 'manual';
    option.textContent = 'Manual topic';
    chapterSelect.append(option);
    chapterSelect.disabled = true;
    return;
  }

  chapterSelect.disabled = false;
  const unassigned = makeUnassignedChapter(subject.key, subject.label);
  const unassignedOption = document.createElement('option');
  unassignedOption.value = unassigned.id;
  unassignedOption.textContent = `${subject.label} — Not sure yet`;
  chapterSelect.append(unassignedOption);

  subject.chapters.forEach((chapter) => {
    const option = document.createElement('option');
    option.value = chapter.id;
    option.textContent = formatChapterOptionLabel(chapter);
    chapterSelect.append(option);
  });
}

function populateSubjectChapterControls(
  subjectSelectId: string,
  chapterSelectId: string,
  selectedSubject: string,
): void {
  const subjectSelect = qs<HTMLSelectElement>(`#${subjectSelectId}`);
  const chapterSelect = qs<HTMLSelectElement>(`#${chapterSelectId}`);
  if (!subjectSelect || !chapterSelect) return;

  const profile = getStudentProfile();
  const options = getActiveSubjectOptions(profile);
  const previous = selectedSubject || subjectSelect.value || options[0]?.key || 'Physics';
  subjectSelect.textContent = '';
  options.forEach((subject) => {
    const option = document.createElement('option');
    option.value = subject.key;
    option.textContent = subject.label;
    subjectSelect.append(option);
  });
  subjectSelect.value = options.some((subject) => subject.key === previous)
    ? previous
    : options[0]?.key || 'Physics';
  updateChapterSelect(subjectSelect, chapterSelect, profile);
}

function renderBacklogControls(): void {
  populateSubjectChapterControls('bl-subject', 'bl-chapter', selectedBacklogSubject);
  const profile = getStudentProfile();
  const isNcert = isNcertClass10Enabled();
  const banner = qs<HTMLElement>('#study-pack-banner');
  const bannerSub = qs<HTMLElement>('#study-pack-sub');
  const manualName = qs<HTMLInputElement>('#bl-name');
  const chapterSelect = qs<HTMLSelectElement>('#bl-chapter');

  banner?.classList.toggle('hidden', !isNcert);
  manualName?.classList.toggle('hidden', isNcert);
  chapterSelect?.classList.toggle('hidden', !isNcert);
  if (bannerSub && profile) {
    bannerSub.textContent = `${profile.country} · Class ${profile.classLevel} · ${profile.board}. Select subject → chapter → lectures remaining.`;
  }
}

function backlogInputFromControls(
  subjectSelectId: string,
  chapterSelectId: string,
  countInputId: string,
  fallbackNameInputId?: string,
  createdFrom: BacklogInput['createdFrom'] = 'manual',
  fixedCount?: number,
): BacklogInput | null {
  const subjectSelect = qs<HTMLSelectElement>(`#${subjectSelectId}`);
  const chapterSelect = qs<HTMLSelectElement>(`#${chapterSelectId}`);
  const countInput = qs<HTMLInputElement>(`#${countInputId}`);
  const profile = getStudentProfile();
  const subject = subjectSelect?.value || selectedBacklogSubject || 'Physics';
  const count = fixedCount ?? parseInt(countInput?.value || '', 10);

  if (isNcertClass10Enabled() && chapterSelect) {
    const option = getSubjectOptionsForProfile(profile).find((item) => item.key === subject);
    const chapter =
      findNcertChapter(chapterSelect.value, profile) ||
      makeUnassignedChapter(subject, option?.label || subject);
    return {
      name: `${chapter.subjectLabel} — ${chapter.title}`,
      count,
      subject: chapter.subjectKey,
      subjectLabel: chapter.subjectLabel,
      chapterId: chapter.id,
      chapterName: chapter.title,
      bookId: chapter.bookId,
      bookName: chapter.bookName,
      unitName: chapter.unitName,
      source: 'ncert-class10',
      createdFrom,
    };
  }

  const fallbackName = fallbackNameInputId
    ? qs<HTMLInputElement>(`#${fallbackNameInputId}`)?.value || ''
    : '';
  return {
    name: fallbackName || `${subject} backlog`,
    count,
    subject,
    subjectLabel: subject,
    source: 'manual',
    createdFrom,
  };
}

function renderBacklogs() {
  renderBacklogControls();
  const el = qs<HTMLElement>('#backlog-list');
  if (!el) return;

  const backlogs = getBacklogs();
  if (!backlogs.length) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">📚</div>${escapeHTML(t('backlog.empty'))}</div>`;
    return;
  }

  const totalRemaining = backlogs.reduce(
    (sum, backlog) => sum + Math.max(0, (backlog.total || 0) - (backlog.done || 0)),
    0,
  );
  const totalDone = backlogs.reduce((sum, backlog) => sum + (backlog.done || 0), 0);
  const pendingChapters = getPendingChapterCount();
  const groups = getBacklogsGroupedBySubject();

  el.innerHTML = `
    <div class="backlog-summary-grid">
      <div class="backlog-summary-card">
        <div class="backlog-summary-num">${totalRemaining}</div>
        <div class="backlog-summary-label">Lectures left</div>
      </div>
      <div class="backlog-summary-card">
        <div class="backlog-summary-num">${pendingChapters}</div>
        <div class="backlog-summary-label">Chapters</div>
      </div>
      <div class="backlog-summary-card">
        <div class="backlog-summary-num">${totalDone}</div>
        <div class="backlog-summary-label">Completed</div>
      </div>
    </div>
    ${groups
      .map((group) => {
        const cls = `tag-sub-${subjectClass(group.subject)}`;
        return `
        <div class="backlog-group">
          <div class="backlog-group-title">
            <span>${escapeHTML(group.subjectLabel)}</span>
            <span class="tag-sub ${cls}">${group.remaining} left</span>
          </div>
          ${group.books
            .map(
              (book) => `
              <div class="backlog-book-title">${escapeHTML(book.bookName)} · ${book.remaining} left</div>
              ${book.items
                .map((b) => {
                  const total = b.total || 1;
                  const done = b.done || 0;
                  const pct = Math.min(100, (done / total) * 100);
                  const left = Math.max(0, total - done);
                  const leftText = t('backlog.left', { count: left });
                  const chapterTitle = b.chapterName || b.name;
                  const metaParts = [
                    b.unitName,
                    b.createdFrom === 'daily-check' ? 'Added from daily check-in' : '',
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return `
                    <div class="list-item backlog-row">
                      <div class="info">
                        <div class="title backlog-chapter-title">${escapeHTML(chapterTitle)}</div>
                        <div class="meta">${escapeHTML(metaParts || b.subjectLabel || b.subject || 'Backlog')}</div>
                        <div style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap">
                          <span class="tag-sub ${cls}">${escapeHTML(b.subjectLabel || b.subject || 'Other')}</span>
                          <span style="font-size:0.75rem;color:var(--text-secondary)">${done} / ${total} lectures</span>
                        </div>
                        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
                      </div>
                      <div class="backlog-actions">
                        <span class="tag ${left > 5 ? 'tag-red' : 'tag-green'}">${escapeHTML(leftText)}</span>
                        <button class="btn btn-danger btn-sm" data-action="dec-backlog" data-id="${b.id}" title="Undo 1 lecture">−1</button>
                        <button class="btn btn-success btn-sm" data-action="inc-backlog" data-id="${b.id}">+1</button>
                        <button class="btn btn-danger btn-sm" data-action="del-backlog" data-id="${b.id}" title="Delete this backlog">×</button>
                      </div>
                    </div>`;
                })
                .join('')}`,
            )
            .join('')}
        </div>`;
      })
      .join('')}`;

  // Add handlers with click debounce to prevent accidental double-clicks
  qsa<HTMLElement>('[data-action="inc-backlog"]', el).forEach((btn) => {
    let lastClickTime = 0;
    const DEBOUNCE_MS = 1000; // Prevent rapid clicks within 1 second

    btn.addEventListener('click', () => {
      const now = Date.now();
      if (now - lastClickTime < DEBOUNCE_MS) {
        // Silently ignore rapid clicks - this prevents accidental double-ticks
        return;
      }
      lastClickTime = now;

      // Disable button temporarily to give clear visual feedback
      const btnEl = btn as HTMLButtonElement;
      const originalText = btnEl.textContent;
      btnEl.disabled = true;
      btnEl.textContent = '✓';

      const id = parseInt((btn as HTMLElement).dataset.id || '0', 10);

      // Get backlog info before increment for feedback
      const backlogs = getBacklogs() as Backlog[];
      const backlog = backlogs.find((b) => b.id === id);
      const lectureTitle = backlog?.chapterName || backlog?.name || 'lecture';

      incrementBacklog(id);
      renderBacklogs();
      updateDashboard();

      // Show brief confirmation toast
      showCelebrate('Lecture Completed', `✓ "${lectureTitle}" marked as done!`, '📚', true);

      // Re-enable button after a short delay
      setTimeout(() => {
        btnEl.disabled = false;
        btnEl.textContent = originalText;
      }, 1500);
    });
  });

  // Handler for "-1" button (undo accidental mark)
  qsa<HTMLElement>('[data-action="dec-backlog"]', el).forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = parseInt((btn as HTMLElement).dataset.id || '0', 10);
      const backlogs = getBacklogs() as Backlog[];
      const backlog = backlogs.find((b) => b.id === id);
      const lectureTitle = backlog?.chapterName || backlog?.name || 'lecture';

      decrementBacklog(id);
      renderBacklogs();
      updateDashboard();

      // Show confirmation toast
      showCelebrate('Lecture Unmarked', `↩️ Removed 1 from "${lectureTitle}"`, '↩️', true);
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
  const dayKeys: TranslationKey[] = [
    'day.sun',
    'day.mon',
    'day.tue',
    'day.wed',
    'day.thu',
    'day.fri',
    'day.sat',
  ];
  const today = currentDOW();

  if (!habits.length) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">🔥</div>${escapeHTML(t('plan.empty_habits'))}</div>`;
    return;
  }

  el.innerHTML = habits
    .map((h) => {
      const anchorText = t('plan.after_anchor', { anchor: escapeHTML(h.anchor || 'waking up') });
      const btnText = h.today ? t('common.done') : t('common.mark');
      return `
      <div class="card">
        <div class="flex justify-between items-center" style="gap:8px;margin-bottom:10px">
          <div class="flex-1" style="min-width:0">
            <div style="font-weight:700;font-size:0.9rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHTML(h.name)}</div>
            <div style="color:var(--text-secondary);font-size:0.75rem;margin-top:2px">${anchorText}</div>
          </div>
          <div class="flex items-center gap-2">
            <span style="font-weight:800;font-size:0.85rem;color:var(--accent-start)">🔥 ${h.streak || 0}</span>
            <button class="btn btn-success btn-sm" data-action="toggle-habit" data-id="${h.id}">${escapeHTML(btnText)}</button>
            <button class="btn btn-danger btn-sm" data-action="del-habit" data-id="${h.id}">×</button>
          </div>
        </div>
        <div class="habit-grid">
          ${dayKeys.map((k, i) => `<div class="habit-day ${h.days && h.days[i] ? 'done' : ''} ${i === today ? 'today' : ''}">${escapeHTML(t(k))}</div>`).join('')}
        </div>
      </div>`;
    })
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
    el.innerHTML = `<div class="empty"><div class="empty-icon">⚔️</div>${escapeHTML(t('plan.empty_battle'))}</div>`;
    return;
  }

  el.innerHTML = tasks
    .map((taskItem) => {
      const timeLabel = t(`plan.time_${taskItem.time}` as TranslationKey) || taskItem.time;
      return `
      <div class="list-item" style="border-left:3px solid ${colors[taskItem.priority] || colors.C}">
        <div class="flex items-center gap-3 flex-1" style="min-width:0">
          <input type="checkbox" ${taskItem.done ? 'checked' : ''} data-action="toggle-battle" data-id="${taskItem.id}" style="width:20px;height:20px;flex-shrink:0">
          <span class="${taskItem.done ? 'text-tertiary' : ''}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.9rem">
            <strong style="color:var(--text-tertiary);margin-right:4px;font-size:0.75rem">[${taskItem.priority}]</strong>${escapeHTML(taskItem.task)} <span class="tag tag-blue">${escapeHTML(timeLabel)}</span>
          </span>
        </div>
        <button class="btn btn-danger btn-sm" data-action="del-battle" data-id="${taskItem.id}">×</button>
      </div>`;
    })
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

// ===================================================================
// MISSION PLANNER (planning layer only — no timer/XP/backlog mutations)
// ===================================================================

function getMissionSubjectOptions(): { key: string; label: string }[] {
  const profile = getStudentProfile();
  const options = getActiveSubjectOptions(profile);
  if (options.length) return options.map((o) => ({ key: o.key, label: o.label }));
  return FALLBACK_BACKLOG_SUBJECTS;
}

function populateMissionSubjectSelect(selectEl: HTMLSelectElement, selected: string): void {
  const options = getMissionSubjectOptions();
  selectEl.textContent = '';
  options.forEach((opt) => {
    const option = document.createElement('option');
    option.value = opt.key;
    option.textContent = opt.label;
    selectEl.append(option);
  });
  if (options.some((o) => o.key === selected)) {
    selectEl.value = selected;
  } else if (options.length) {
    selectEl.value = options[0].key;
  }
}

/** Populates the mission chapter picker for the current subject, keeping a selection. */
function populateMissionChapterSelect(
  subjectSelect: HTMLSelectElement,
  chapterSelect: HTMLSelectElement,
  selectedChapterId: string,
): void {
  updateChapterSelect(subjectSelect, chapterSelect);
  if (!selectedChapterId) return;
  const options = Array.from(chapterSelect.options);
  if (options.some((option) => option.value === selectedChapterId)) {
    chapterSelect.value = selectedChapterId;
  }
}

/** Reflects the current chapter → backlog link state in the manual mission form. */
function updateMissionLinkHint(): void {
  const hint = qs<HTMLElement>('#mission-link-hint');
  if (!hint) return;
  const chapterSelect = qs<HTMLSelectElement>('#mission-chapter');
  const chapterField = qs<HTMLElement>('#mission-chapter-field');
  if (!isNcertClass10Enabled() || !chapterSelect || chapterField?.classList.contains('hidden')) {
    hint.textContent = '';
    return;
  }
  const profile = getStudentProfile();
  const chapter = findNcertChapter(chapterSelect.value, profile);
  hint.textContent = chapter
    ? `🔗 Will be linked to backlog: ${chapter.subjectLabel} — ${chapter.title}`
    : '🔗 Will be linked to your Backlog tab (chapter added automatically).';
}

/**
 * Links a manual mission to a backlog row for the chosen NCERT chapter.
 * Reuses an existing pending row; otherwise creates a fresh 1-lecture row so
 * completing the mission automatically crushes it in the Backlog tab.
 * Returns the linked backlog id, or null when nothing can be linked.
 */
function linkManualMissionToChapter(subject: string, chapterId: string): number | null {
  if (!chapterId) return null;
  const profile = getStudentProfile();
  const option = getSubjectOptionsForProfile(profile).find((item) => item.key === subject);
  const chapter =
    findNcertChapter(chapterId, profile) ||
    makeUnassignedChapter(subject, option?.label || subject);

  const existing = findBacklogForChapter({
    subject: chapter.subjectKey,
    chapterId: chapter.id,
    bookId: chapter.bookId,
  });
  if (existing && Math.max(0, (existing.total || 0) - (existing.done || 0)) > 0) {
    return existing.id;
  }

  const result = addBacklog({
    name: `${chapter.subjectLabel} — ${chapter.title}`,
    count: 1,
    subject: chapter.subjectKey,
    subjectLabel: chapter.subjectLabel,
    chapterId: chapter.id,
    chapterName: chapter.title,
    bookId: chapter.bookId,
    bookName: chapter.bookName,
    unitName: chapter.unitName,
    source: 'ncert-class10',
    createdFrom: 'manual',
  });
  if (!result.success) return null;
  const created = findBacklogForChapter({
    subject: chapter.subjectKey,
    chapterId: chapter.id,
    bookId: chapter.bookId,
  });
  return created ? created.id : null;
}

function renderMissionPlanner(): void {
  const body = qs<HTMLElement>('#mission-planner-body');
  if (!body) return;

  // If a mission is already confirmed, hide recommendation — show confirmed card instead
  if (getActiveMission()) {
    body.innerHTML = `<div class="mission-empty" style="padding:8px 0">Mission locked in. Start your timer below when ready.</div>`;
    renderMissionConfirmed();
    return;
  }

  // Hide confirmed card
  qs<HTMLElement>('#mission-confirmed-card')?.classList.add('hidden');

  const backlogs = getBacklogs() as Backlog[];
  const rec = recommendMission(backlogs, missionSelectedSubject || undefined);

  if (rec.reason === 'empty' || !rec.backlog) {
    body.innerHTML = `
      <div class="mission-empty">
        <div style="font-size:1.5rem;margin-bottom:8px">📭</div>
        <div>Your backlog is clear. Create a manual mission to stay sharp.</div>
        <button class="btn" id="mission-manual-btn" type="button">Create manual mission</button>
      </div>`;
    qs<HTMLElement>('#mission-manual-btn')?.addEventListener('click', () => {
      missionDraftBacklogId = null;
      openMissionSetup(null);
    });
    return;
  }

  const bl = rec.backlog;
  const remainingLectures = Math.max(0, (bl.total || 0) - (bl.done || 0));
  const topic = bl.chapterName || bl.name;
  const subject = bl.subjectLabel || bl.subject || 'Other';

  let quickWinHTML = '';
  if (rec.quickWin) {
    const qw = rec.quickWin;
    const qwRemaining = Math.max(0, (qw.total || 0) - (qw.done || 0));
    const qwTopic = qw.chapterName || qw.name;
    const qwSubject = qw.subjectLabel || qw.subject || 'Other';
    quickWinHTML = `
      <div class="mission-quick-win">
        <div class="mission-quick-win-label">⚡ Quick-win alternative</div>
        <div class="mission-quick-win-topic">${escapeHTML(qwTopic)}</div>
        <div class="mission-quick-win-meta">${escapeHTML(qwSubject)} · ${qwRemaining} lecture${qwRemaining === 1 ? '' : 's'} left</div>
        <button class="btn btn-ghost btn-sm" id="mission-quick-win-btn" type="button" style="width:auto;font-size:.78rem">Use this instead</button>
      </div>`;
  }

  body.innerHTML = `
    <div class="mission-rec">
      <div class="mission-rec-card">
        <div class="mission-rec-subject">${escapeHTML(subject)}</div>
        <div class="mission-rec-topic">${escapeHTML(topic)}</div>
        <div class="mission-rec-meta">
          <span class="tag tag-red">${remainingLectures} lecture${remainingLectures === 1 ? '' : 's'} left</span>
          ${bl.total ? `<span class="tag tag-blue">${bl.done || 0}/${bl.total} done</span>` : ''}
        </div>
        <div class="mission-rec-reason">${escapeHTML(rec.reasonLabel)}</div>
        <div class="mission-rec-actions">
          <button class="btn" id="mission-use-btn" type="button">Use this mission</button>
          <button class="btn btn-ghost" id="mission-another-btn" type="button">Choose another</button>
          <button class="btn btn-ghost" id="mission-create-btn" type="button">Create manual</button>
        </div>
      </div>
      ${quickWinHTML}
    </div>`;

  // "Use this mission"
  qs<HTMLElement>('#mission-use-btn')?.addEventListener('click', () => {
    missionDraftBacklogId = bl.id;
    openMissionSetup(bl);
  });

  // "Choose another" — cycle to next recommendation (by subject)
  qs<HTMLElement>('#mission-another-btn')?.addEventListener('click', () => {
    const pending = backlogs
      .filter((b) => Math.max(0, (b.total || 0) - (b.done || 0)) > 0)
      .slice()
      .sort((a, b) => {
        const ra = Math.max(0, (a.total || 0) - (a.done || 0));
        const rb = Math.max(0, (b.total || 0) - (b.done || 0));
        return rb - ra || (a.id || 0) - (b.id || 0);
      });
    // Pick the next one after current recommendation
    const currentIdx = pending.findIndex((b) => b.id === bl.id);
    const nextIdx = (currentIdx + 1) % pending.length;
    if (pending[nextIdx]) {
      missionDraftBacklogId = pending[nextIdx].id;
      openMissionSetup(pending[nextIdx]);
    }
  });

  // "Create manual"
  qs<HTMLElement>('#mission-create-btn')?.addEventListener('click', () => {
    missionDraftBacklogId = null;
    openMissionSetup(null);
  });

  // Quick-win button
  qs<HTMLElement>('#mission-quick-win-btn')?.addEventListener('click', () => {
    if (rec.quickWin) {
      missionDraftBacklogId = rec.quickWin.id;
      openMissionSetup(rec.quickWin);
    }
  });
}

/** Whether the mission-setup inputs already have their (one-time) listeners. */
let missionSetupWired = false;

/** Live block preview for the mission setup form. Reads current DOM values. */
function updateMissionBlockPreview(): void {
  const preview = qs<HTMLElement>('#mission-blocks-preview');
  const totalInput = qs<HTMLInputElement>('#mission-total');
  const blockInput = qs<HTMLInputElement>('#mission-block');
  if (!preview || !totalInput || !blockInput) return;
  const total = parseInt(totalInput.value, 10);
  const block = parseInt(blockInput.value, 10);
  if (!total || total <= 0 || !block || block <= 0) {
    preview.innerHTML = '';
    return;
  }
  const blocks = calculateBlocks(total, block);
  if (!blocks.length) {
    preview.innerHTML = '';
    return;
  }
  preview.innerHTML = `
    <div class="mission-blocks-preview-title">Blocks preview (${blocks.length} block${blocks.length === 1 ? '' : 's'})</div>
    <div class="mission-blocks-list">
      ${blocks
        .map(
          (b) => `<div class="mission-block-item">
            <span class="mission-block-item-label">Block ${b.index}</span>
            <span class="mission-block-item-time">${b.minutes} min</span>
          </div>`,
        )
        .join('')}
    </div>`;
}

function openMissionSetup(backlog: Backlog | null): void {
  const card = qs<HTMLElement>('#mission-setup-card');
  if (!card) return;
  card.classList.remove('hidden');

  const titleInput = qs<HTMLInputElement>('#mission-title');
  const subjectSelect = qs<HTMLSelectElement>('#mission-subject');
  const chapterSelect = qs<HTMLSelectElement>('#mission-chapter');
  const chapterField = qs<HTMLElement>('#mission-chapter-field');
  const totalInput = qs<HTMLInputElement>('#mission-total');
  const blockInput = qs<HTMLInputElement>('#mission-block');
  const message = qs<HTMLElement>('#mission-setup-message');
  const hint = qs<HTMLElement>('#mission-link-hint');
  const preview = qs<HTMLElement>('#mission-blocks-preview');

  if (titleInput) titleInput.value = backlog ? backlog.chapterName || backlog.name : '';
  missionTitleTouched = false;
  if (subjectSelect) {
    populateMissionSubjectSelect(
      subjectSelect,
      backlog?.subject || missionSelectedSubject || 'Physics',
    );
    // When the mission was started from a backlog recommendation, its subject and
    // chapter are already fixed by that row — lock them so the link stays honest.
    subjectSelect.disabled = Boolean(backlog);
  }

  // Chapter picker: shown for manual missions in NCERT mode; locked to the linked
  // chapter when the mission was started from a backlog recommendation.
  const ncertEnabled = isNcertClass10Enabled();
  const showChapterField = ncertEnabled && (!backlog || backlog.chapterId);
  if (chapterField) chapterField.classList.toggle('hidden', !showChapterField);
  if (chapterSelect && subjectSelect) {
    if (showChapterField) {
      populateMissionChapterSelect(subjectSelect, chapterSelect, backlog?.chapterId || '');
      chapterSelect.disabled = Boolean(backlog);
    } else {
      chapterSelect.disabled = true;
    }
  }

  if (hint) {
    hint.textContent = backlog
      ? '🔗 Linked to your backlog — completing the mission crushes 1 lecture.'
      : ncertEnabled
        ? 'Choose a chapter below to auto-link this mission with your Backlog tab.'
        : '';
  }

  if (totalInput) totalInput.value = '';
  if (blockInput) blockInput.value = '25';
  if (message) message.textContent = '';
  if (preview) preview.innerHTML = '';

  // Live block preview on input change — wired exactly once, not on every open.
  if (!missionSetupWired) {
    missionSetupWired = true;
    totalInput?.addEventListener('input', updateMissionBlockPreview);
    blockInput?.addEventListener('input', updateMissionBlockPreview);
  }
  updateMissionBlockPreview();

  // Auto-focus title
  titleInput?.focus();
}

function closeMissionSetup(): void {
  const card = qs<HTMLElement>('#mission-setup-card');
  if (card) card.classList.add('hidden');
  const message = qs<HTMLElement>('#mission-setup-message');
  if (message) message.textContent = '';
  const hint = qs<HTMLElement>('#mission-link-hint');
  if (hint) hint.textContent = '';
}

function confirmMission(): void {
  const titleInput = qs<HTMLInputElement>('#mission-title');
  const subjectSelect = qs<HTMLSelectElement>('#mission-subject');
  const totalInput = qs<HTMLInputElement>('#mission-total');
  const blockInput = qs<HTMLInputElement>('#mission-block');
  const message = qs<HTMLElement>('#mission-setup-message');

  const title = titleInput?.value || '';
  const total = totalInput?.value;
  const block = blockInput?.value;

  const validation = validateMissionSetup({ title, totalMinutes: total, blockMinutes: block });
  if (!validation.valid) {
    if (message) {
      message.textContent = validation.error;
      message.dataset.tone = 'error';
    }
    return;
  }

  const d = validation.data;
  // Manual missions: a chosen chapter auto-links (and auto-creates) a backlog row,
  // so the mission and the Backlog tab stay connected automatically.
  let resolvedBacklogId = missionDraftBacklogId;
  if (!resolvedBacklogId && isNcertClass10Enabled()) {
    const chapterSelect = qs<HTMLSelectElement>('#mission-chapter');
    const subject = subjectSelect?.value || d.subject;
    if (chapterSelect && chapterSelect.value && !chapterSelect.disabled) {
      resolvedBacklogId = linkManualMissionToChapter(subject, chapterSelect.value);
    }
  }
  const mission = buildMissionSetup({
    title: d.title,
    subject: subjectSelect?.value || d.subject,
    backlogId: resolvedBacklogId,
    totalMinutes: d.totalMinutes,
    blockMinutes: d.blockMinutes,
  });

  if (!mission) {
    if (message) {
      message.textContent = 'Could not build mission. Check your inputs.';
      message.dataset.tone = 'error';
    }
    return;
  }

  const runtime = startMission(mission);
  lastBlockCompletionMinutes = null;
  // Point the existing timer at the first block; user starts it with the normal Start button.
  const firstBlock = runtime.blocks[0];
  if (firstBlock) prepareTimerForBlock(firstBlock.plannedDuration);
  closeMissionSetup();
  renderMissionPlanner();
  updateFocusUI();
}

function renderMissionConfirmed(): void {
  const card = qs<HTMLElement>('#mission-confirmed-card');
  const titleEl = qs<HTMLElement>('#mission-confirmed-title');
  const metaEl = qs<HTMLElement>('#mission-confirmed-meta');
  const blocksEl = qs<HTMLElement>('#mission-confirmed-blocks');
  const kickerEl = qs<HTMLElement>('#mission-confirmed-kicker');
  const mission = getActiveMission();
  if (!card || !mission) return;

  card.classList.remove('hidden');
  // Titles use textContent — never innerHTML — so user-supplied text can't inject markup.
  if (titleEl) titleEl.textContent = mission.title;
  if (kickerEl) {
    kickerEl.textContent =
      mission.status === 'completed'
        ? 'MISSION COMPLETE'
        : mission.status === 'paused'
          ? 'MISSION PAUSED'
          : mission.status === 'cancelled'
            ? 'MISSION ENDED'
            : 'ACTIVE MISSION';
  }

  const linkedBacklog = mission.backlogId
    ? (getBacklogs() as Backlog[]).find((b) => b.id === mission.backlogId)
    : null;

  const currentBlock = getCurrentBlock();
  const currentNumber = getCurrentBlockNumber();
  const totalBlocks = mission.blocks.length;

  if (metaEl) {
    metaEl.innerHTML = `
      <span class="tag tag-blue">${escapeHTML(mission.subject)}</span>
      <span class="tag tag-green">${mission.totalDuration} min total</span>
      <span class="tag">${mission.blockDuration} min blocks</span>
      ${linkedBacklog ? `<span class="tag tag-red">Linked: ${escapeHTML(linkedBacklog.chapterName || linkedBacklog.name)}</span>` : ''}
    `;
  }

  if (!blocksEl) return;

  const isComplete = mission.status === 'completed';
  const isPaused = mission.status === 'paused' || mission.status === 'cancelled';

  // "Current block" summary (hidden once the whole mission is complete).
  const currentSummary =
    !isComplete && currentBlock
      ? `
      <div class="mission-current-block">
        <div class="mission-current-block-label">BLOCK ${currentNumber} OF ${totalBlocks}</div>
        <div class="mission-current-block-time">${currentBlock.plannedDuration} minutes</div>
      </div>`
      : '';

  // Mission progress line — accounted minutes vs total.
  const progressLine = `
    <div class="mission-progress">
      <div class="mission-progress-label">Mission progress:</div>
      <div class="mission-progress-value">${mission.completedDuration} / ${mission.totalDuration} minutes completed</div>
    </div>`;

  // Block completion banner (aria-live) — only after a block just completed.
  let bannerHTML = '';
  if (lastBlockCompletionMinutes !== null) {
    if (isComplete) {
      bannerHTML = `
        <div class="mission-complete-banner">
          <div class="mission-block-complete-title">MISSION COMPLETE</div>
          <div class="mission-block-complete-line">${mission.completedDuration} / ${mission.totalDuration} minutes completed</div>
          ${mission.backlogId ? `<div class="mission-block-complete-backlog">Backlog updated:<br>1 lecture completed</div>` : ''}
          <div class="mission-block-complete-xp">Rewards:<br>+ focus XP${mission.backlogId ? '<br>+ backlog completion XP' : ''}</div>
        </div>`;
    } else {
      const next = mission.blocks[mission.currentBlock];
      const nextLine = next
        ? `Block ${currentNumber} of ${totalBlocks} · ${next.plannedDuration} minutes`
        : '';
      bannerHTML = `
        <div class="mission-complete-banner">
          <div class="mission-block-complete-title">BLOCK COMPLETE</div>
          <div class="mission-block-complete-line">${lastBlockCompletionMinutes} minutes completed</div>
          <div class="mission-block-complete-xp">+ focus XP</div>
          ${nextLine ? `<div class="mission-next-label">Next:</div><div class="mission-next-value">${nextLine}</div>` : ''}
        </div>`;
    }
  }

  // Action buttons — shown after a block completes (choice point) or when paused.
  let actionsHTML = '';
  if (lastBlockCompletionMinutes !== null && !isComplete) {
    actionsHTML = `
      <div class="mission-actions">
        <button class="btn" id="mission-next-block-btn" type="button">Start next block</button>
        <button class="btn btn-ghost" id="mission-break-btn" type="button">Take a break</button>
        <button class="btn btn-ghost" id="mission-end-btn" type="button">End mission</button>
      </div>`;
  } else if (isComplete) {
    actionsHTML = `
      <div class="mission-actions">
        <button class="btn" id="mission-finish-btn" type="button">Start another mission</button>
        <button class="btn btn-ghost" id="mission-view-backlog-btn" type="button">View backlog</button>
        <button class="btn btn-ghost" id="mission-dashboard-btn" type="button">Return to dashboard</button>
      </div>`;
  } else if (isPaused) {
    const remainingBlocks = mission.blocks.filter((b) => b.status === 'pending').length;
    actionsHTML = `
      <div class="mission-paused-info">
        <div class="mission-paused-blocks">${remainingBlocks} block${remainingBlocks === 1 ? '' : 's'} remaining</div>
        <div class="mission-paused-backlog">Backlog:<br>${mission.backlogId ? 'Lecture still pending' : 'No backlog linked'}</div>
        <div class="mission-paused-status">Progress safely saved.</div>
      </div>
      <div class="mission-actions">
        <button class="btn" id="mission-resume-btn" type="button">Resume mission</button>
        <button class="btn btn-ghost" id="mission-discard-btn" type="button">Discard mission</button>
      </div>`;
  } else {
    // Active with a running/idle block — always allow ending the mission early.
    actionsHTML = `
      <div class="mission-actions">
        <button class="btn btn-ghost" id="mission-end-btn" type="button">End mission</button>
      </div>`;
  }

  const blockList = mission.blocks
    .map((b, i) => {
      const stateLabel =
        b.status === 'completed'
          ? `${b.completedDuration} min ✓`
          : i === mission.currentBlock && !isComplete && !isPaused
            ? `${b.plannedDuration} min · active`
            : `${b.plannedDuration} min`;
      return `<div class="mission-block-item mission-block-${b.status}">
          <span class="mission-block-item-label">Block ${i + 1}</span>
          <span class="mission-block-item-time">${stateLabel}</span>
        </div>`;
    })
    .join('');

  // aria-live on the wrapper so screen readers announce block/mission completion.
  blocksEl.setAttribute('aria-live', 'polite');
  blocksEl.innerHTML = `
    ${currentSummary}
    ${progressLine}
    ${bannerHTML}
    <div class="mission-blocks-preview-title">Focus blocks (${totalBlocks})</div>
    <div class="mission-blocks-list">${blockList}</div>
    ${actionsHTML}`;

  // Wire mission action buttons (keyboard accessible — real <button> elements).
  qs<HTMLElement>('#mission-next-block-btn')?.addEventListener('click', () => {
    onMissionStartNextBlock();
  });
  qs<HTMLElement>('#mission-break-btn')?.addEventListener('click', () => {
    onMissionTakeBreak();
  });
  qs<HTMLElement>('#mission-end-btn')?.addEventListener('click', () => {
    onMissionEnd();
  });
  qs<HTMLElement>('#mission-discard-btn')?.addEventListener('click', () => {
    onMissionDiscard();
  });
  qs<HTMLElement>('#mission-finish-btn')?.addEventListener('click', () => {
    clearActiveMission();
  });
  qs<HTMLElement>('#mission-view-backlog-btn')?.addEventListener('click', () => {
    clearActiveMission();
    switchTab('backlog');
  });
  qs<HTMLElement>('#mission-dashboard-btn')?.addEventListener('click', () => {
    clearActiveMission();
    switchTab('home');
  });
  qs<HTMLElement>('#mission-resume-btn')?.addEventListener('click', () => {
    const resumed = resumeMission();
    lastBlockCompletionMinutes = null;
    if (resumed) {
      const block = getCurrentBlock();
      if (block) prepareTimerForBlock(block.plannedDuration);
    }
    renderMissionPlanner();
    updateFocusUI();
  });
}

/** Manually start the next block: resets the timer to the block's length, then starts it. */
function onMissionStartNextBlock(): void {
  const block = startNextBlock();
  lastBlockCompletionMinutes = null;
  if (block) {
    prepareTimerForBlock(block.plannedDuration);
    startTimer();
    openImmersiveFocus();
  }
  renderMissionPlanner();
  updateFocusUI();
}

/** Take a break: leave the next block pending, do NOT start any timer. */
function onMissionTakeBreak(): void {
  lastBlockCompletionMinutes = null;
  stopTimer();
  renderMissionPlanner();
  updateFocusUI();
}

/** End the mission early, preserving all completed/unfinished block history. */
function onMissionEnd(): void {
  endMission();
  lastBlockCompletionMinutes = null;
  stopTimer();
  setMode(getTimerState().mode);
  renderMissionPlanner();
  updateFocusUI();
}

/** Truly discard the mission: clear state, reset timer to preset, return to planner. */
function onMissionDiscard(): void {
  clearMission();
  lastBlockCompletionMinutes = null;
  qs<HTMLElement>('#mission-confirmed-card')?.classList.add('hidden');
  setMode(getTimerState().mode);
  renderMissionPlanner();
  updateFocusUI();
}

function clearActiveMission(): void {
  clearMission();
  lastBlockCompletionMinutes = null;
  qs<HTMLElement>('#mission-confirmed-card')?.classList.add('hidden');
  setMode(getTimerState().mode);
  renderMissionPlanner();
  updateFocusUI();
}

/**
 * Points the EXISTING focus timer at a mission block's length.
 * Reuses the single timer engine (no second timer); a custom-length remainder block
 * (e.g. the 10-min tail of a 60/25 plan) runs on the same countdown as the presets.
 */
function prepareTimerForBlock(minutes: number): void {
  setCustomBlock(minutes, { label: MISSION_BLOCK_LABEL });
}

function renderFocusHistory() {
  const el = qs<HTMLElement>('#focus-history');
  // Guard: if container is missing (e.g., during early init), do nothing but don't crash.
  if (!el) return;

  // Ensure focusHistoryDate is always a valid ISO date; fallback to today if corrupted.
  if (!isValidISODate(focusHistoryDate)) {
    focusHistoryDate = localISODate();
  }

  const today = localISODate();
  const selected = getDailyFocusHistory(focusHistoryDate);

  // Date input: keep it in sync with the selected date. No `max` clamp — future
  // dates are intentionally allowed and render the designed 🔮 future state;
  // the Prev/Next buttons already guard casual navigation at today.
  const dateInput = qs<HTMLInputElement>('#focus-history-date');
  if (dateInput) {
    dateInput.value = focusHistoryDate;
  }

  // Prominent selected date label + relative hint (Today/Yesterday/Tomorrow/Future)
  const dateLabel = qs<HTMLElement>('#focus-history-date-label');
  const relativeLabel = qs<HTMLElement>('#focus-history-relative');
  if (dateLabel) {
    const parsed = parseLocalISODate(focusHistoryDate);
    if (parsed) {
      dateLabel.textContent = parsed.toLocaleDateString([], {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } else {
      dateLabel.textContent = focusHistoryDate;
    }
  }
  if (relativeLabel) {
    const isToday = focusHistoryDate === today;
    const isYesterday = focusHistoryDate === shiftISODate(today, -1);
    const isTomorrow = focusHistoryDate === shiftISODate(today, 1);
    const isFuture = focusHistoryDate > today;
    const isPast = focusHistoryDate < today && !isYesterday;
    if (isToday) relativeLabel.textContent = 'Today';
    else if (isYesterday) relativeLabel.textContent = 'Yesterday';
    else if (isTomorrow) relativeLabel.textContent = 'Tomorrow';
    else if (isFuture) relativeLabel.textContent = 'Future';
    else if (isPast) relativeLabel.textContent = 'Past';
    else relativeLabel.textContent = '';
    relativeLabel.classList.toggle('is-today', isToday);
    relativeLabel.classList.toggle('is-future', isFuture);
  }

  // Next button disabled when at or beyond today — clear visual disabled state.
  const next = qs<HTMLButtonElement>('#focus-history-next');
  if (next) {
    const disableNext = focusHistoryDate >= today;
    next.disabled = disableNext;
    next.setAttribute('aria-disabled', String(disableNext));
  }

  // Today button indicates active state when on today.
  const todayBtn = qs<HTMLButtonElement>('#focus-history-today');
  if (todayBtn) {
    todayBtn.classList.toggle('is-active', focusHistoryDate === today);
    todayBtn.setAttribute('aria-pressed', String(focusHistoryDate === today));
  }

  // Statistics — safe optional updates (no unsafe non-null assertions).
  const totalEl = qs<HTMLElement>('#focus-history-total');
  if (totalEl) totalEl.textContent = `${selected.totalMinutes} min`;

  const blocksEl = qs<HTMLElement>('#focus-history-blocks');
  if (blocksEl) blocksEl.textContent = String(selected.completedBlocks);

  const missionsEl = qs<HTMLElement>('#focus-history-missions');
  if (missionsEl) missionsEl.textContent = String(selected.completedMissions);

  const xpEl = qs<HTMLElement>('#focus-history-xp');
  if (xpEl) xpEl.textContent = `${selected.xpEarned} XP`;

  // Highlight total minutes when there is data — premium emphasis.
  const statsWrap = qs<HTMLElement>('#focus-history-card .focus-history-stats');
  if (statsWrap) {
    statsWrap.classList.toggle('has-data', selected.totalMinutes > 0);
  }

  // Empty / future / success states — designed, not broken.
  if (!selected.sessions.length) {
    const isFuture = focusHistoryDate > today;
    if (isFuture) {
      el.innerHTML = `<div class="focus-history-empty focus-history-future"><div class="empty-icon">🔮</div><strong>Future date</strong><span>No sessions yet — this day is still ahead. Stay focused today and it will fill up.</span></div>`;
    } else {
      el.innerHTML = `<div class="focus-history-empty"><div class="empty-icon">📭</div><strong>No focus sessions on this date.</strong><span>Start a deep-work session to build your record. Every minute counts.</span></div>`;
    }
    return;
  }

  // Session list — premium scannable rows: mission primary, subject + time secondary, duration badge.
  el.innerHTML = selected.sessions
    .map(
      (session) => `
    <div class="focus-history-item">
      <div class="focus-history-item-dot" aria-hidden="true"></div>
      <div class="focus-history-item-info">
        <div class="focus-history-item-title">${escapeHTML(session.missionName)}</div>
        <div class="focus-history-item-meta">
          ${session.subject ? `<span class="focus-history-item-subject">${escapeHTML(session.subject)}</span><span class="meta-sep">·</span>` : ''}
          <span>Completed ${escapeHTML(session.completionTime)}</span>
        </div>
      </div>
      <span class="focus-history-badge">${session.duration}m</span>
    </div>`,
    )
    .join('');
}

function setFocusHistoryDate(date: string): void {
  // Strict ISO validation — never trust formatted display text, never crash on invalid.
  if (!isValidISODate(date)) return;
  // Allow future dates for empty-state handling, but keep navigation safe.
  focusHistoryDate = date;
  renderFocusHistory();
}

function renderProfile() {
  const rank = getCurrentRank(xpLevel(data.xp).level);
  const info = xpLevel(data.xp);

  const elName = qs<HTMLElement>('#profile-name');
  const elRank = qs<HTMLElement>('#profile-rank');
  const elAvatar = qs<HTMLElement>('#profile-avatar');
  const elMission = qs<HTMLElement>('#profile-mission');
  const elStudy = qs<HTMLElement>('#profile-study-info');
  const elInput = qs<HTMLInputElement>('#profile-name-input');
  const elMissionInput = qs<HTMLTextAreaElement>('#mission-input');

  if (elName) elName.textContent = data.profileName || 'Warrior';
  if (elRank) elRank.textContent = `${rank.name} · ${t('common.level', { level: info.level })}`;
  if (elAvatar) elAvatar.textContent = rank.icon;
  if (elMission) elMission.textContent = data.mission;
  const profile = getStudentProfile();
  if (elStudy) {
    elStudy.textContent = profile
      ? `${profile.country} · Class ${profile.classLevel} · ${profile.board}${profile.syllabusPackId === 'india-ncert-class-10' ? ' · NCERT Class 10 loaded' : ''}`
      : 'Study setup not completed yet.';
  }
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
  if (elSub) elSub.textContent = t('home.badges_unlocked', { unlocked, total: TOTAL_BADGES });
  if (elCount) elCount.textContent = `${unlocked} / ${TOTAL_BADGES}`;
}

function renderQuote() {
  const el = qs<HTMLElement>('#daily-quote');
  if (el) el.textContent = `"${getDailyQuote()}"`;
}

/** Locks the app chrome (header, content, nav) behind a full-screen gate overlay. */
function setAppChromeInert(inert: boolean): void {
  // Keep keyboard and screen-reader users inside the modal while it is open.
  qsa<HTMLElement>('#app-header, main.container, .bottom-nav').forEach((element) => {
    if (inert) {
      element.setAttribute('inert', '');
      element.setAttribute('aria-hidden', 'true');
    } else {
      element.removeAttribute('inert');
      element.removeAttribute('aria-hidden');
    }
  });
}

/** Shows/hides one of the full-screen first-run gate overlays (welcome, language, login). */
function setGateOverlayOpen(selector: string, open: boolean): void {
  const overlay = qs<HTMLElement>(selector);
  if (!overlay) return;

  overlay.classList.toggle('hidden', !open);
  overlay.classList.toggle('show', open);
  document.body.classList.toggle('auth-open', open);
  setAppChromeInert(open);
}

function setWelcomeOverlayOpen(open: boolean): void {
  setGateOverlayOpen('#welcome-overlay', open);
}

function setLanguageOverlayOpen(open: boolean): void {
  setGateOverlayOpen('#language-overlay', open);
}

function setLoginOverlayOpen(open: boolean): void {
  setGateOverlayOpen('#login-overlay', open);
}

function setAcademicOverlayOpen(open: boolean): void {
  setGateOverlayOpen('#academic-overlay', open);
}

function setDailyClassOverlayOpen(open: boolean): void {
  setGateOverlayOpen('#daily-class-overlay', open);
}

// ===================================================================
// LANGUAGE PICKER
// ===================================================================

/** Locale selected in the picker UI (applied only on confirm). */
let pendingLocale: LocaleCode = 'en';
let afterLanguagePick: (() => void) | null = null;

/**
 * Builds accessible language option buttons into `listEl`.
 * Hinglish is pinned on top with a "suggested" badge (featured in LOCALES).
 */
function renderLanguageOptions(
  listEl: HTMLElement,
  selected: LocaleCode,
  onPick: (code: LocaleCode) => void,
): void {
  listEl.textContent = '';
  getSupportedLocales().forEach((info) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'language-option';
    option.dataset.locale = info.code;
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', String(info.code === selected));
    if (info.featured) option.classList.add('featured');
    if (info.code === selected) option.classList.add('selected');

    const icon = document.createElement('span');
    icon.className = 'language-icon';
    icon.textContent = info.icon;
    icon.setAttribute('aria-hidden', 'true');

    const names = document.createElement('span');
    names.className = 'language-names';
    const nativeName = document.createElement('strong');
    nativeName.textContent = info.nativeName;
    const blurb = document.createElement('span');
    blurb.textContent = info.blurb;
    names.append(nativeName, blurb);

    option.append(icon, names);
    if (info.featured) {
      const badge = document.createElement('span');
      badge.className = 'language-badge';
      badge.textContent = t('lang.suggested');
      option.append(badge);
    }
    option.addEventListener('click', () => onPick(info.code));
    listEl.append(option);
  });
}

/** Live preview line in the first-run picker, translated into the pending language. */
function updateLanguagePreview(): void {
  const preview = qs<HTMLElement>('#language-preview');
  if (preview) preview.textContent = previewIn(pendingLocale, 'lang.preview');
}

function refreshFirstRunLanguageList(): void {
  const list = qs<HTMLElement>('#language-list');
  if (!list) return;
  renderLanguageOptions(list, pendingLocale, (code) => {
    pendingLocale = code;
    refreshFirstRunLanguageList();
    updateLanguagePreview();
  });
}

/** Opens the first-run language picker. `after` runs once the user confirms. */
function openLanguagePicker(after?: () => void): void {
  pendingLocale = detectInitialLocale();
  afterLanguagePick = after ?? null;
  refreshFirstRunLanguageList();
  updateLanguagePreview();
  setLanguageOverlayOpen(true);
  qs<HTMLButtonElement>('#language-continue-btn')?.focus();
}

/** Confirms the pending language, translates the whole app, and closes the picker. */
function confirmLanguagePick(): void {
  setLocale(pendingLocale);
  markLanguageChosen();
  setLanguageOverlayOpen(false);
  renderSettingsLanguageList();
  const after = afterLanguagePick;
  afterLanguagePick = null;
  if (after) after();
  else maybeOpenPostLoginSetup();
}

/** Renders the always-available language switcher inside Settings. */
function renderSettingsLanguageList(): void {
  const list = qs<HTMLElement>('#settings-language-list');
  if (!list) return;
  renderLanguageOptions(list, getLocale(), (code) => {
    if (code !== getLocale()) setLocale(code);
    markLanguageChosen();
    renderSettingsLanguageList();
  });
}

function renderSession(): void {
  if (isSessionStarted() || currentUser()) {
    setWelcomeOverlayOpen(false);
    setLanguageOverlayOpen(false);
    setLoginOverlayOpen(false);
    maybeOpenPostLoginSetup();
    return;
  }

  // First visit: explain what the app is and how to use it BEFORE the account ask.
  if (!hasSeenWelcome()) {
    setLoginOverlayOpen(false);
    setWelcomeOverlayOpen(true);
    qs<HTMLButtonElement>('#welcome-cta-btn')?.focus();
    return;
  }

  setWelcomeOverlayOpen(false);
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
    if (status) status.textContent = t('settings.account_synced_msg');
    if (email) email.textContent = user.email || '';
    login?.classList.add('hidden');
    sync?.classList.remove('hidden');
    out?.classList.remove('hidden');
  } else {
    if (status) status.textContent = t('settings.account_local_msg');
    if (email) email.textContent = '';
    login?.classList.toggle('hidden', !isEmailAuthConfigured);
    sync?.classList.add('hidden');
    out?.classList.add('hidden');
  }
}

function renderSoundSettings(): void {
  const settings = getSoundSettings();
  const enabledToggle = qs<HTMLInputElement>('#sound-enabled-toggle');
  const volumeSlider = qs<HTMLInputElement>('#sound-volume-slider');
  const volumeLabel = qs<HTMLElement>('#sound-volume-label');
  const loopToggle = qs<HTMLInputElement>('#sound-loop-toggle');
  const vibToggle = qs<HTMLInputElement>('#sound-vibration-toggle');
  const notifToggle = qs<HTMLInputElement>('#sound-notification-toggle');
  const hint = qs<HTMLElement>('#notification-permission-hint');

  if (enabledToggle) enabledToggle.checked = settings.enabled;
  if (volumeSlider) volumeSlider.value = String(Math.round(settings.volume * 100));
  if (volumeLabel) volumeLabel.textContent = `${Math.round(settings.volume * 100)}%`;
  if (loopToggle) loopToggle.checked = settings.loop;
  if (vibToggle) vibToggle.checked = settings.vibration;
  if (notifToggle) notifToggle.checked = settings.notifications;

  // pack active
  qsa<HTMLElement>('.sound-pack-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.pack === settings.pack);
  });

  // permission hint
  if (hint) {
    if (!isNotificationSupported()) {
      hint.textContent = 'Notifications not supported in this browser.';
      hint.style.display = 'block';
    } else {
      const perm = getNotificationPermission();
      if (settings.notifications && perm === 'denied') {
        hint.textContent =
          'Notifications blocked. Enable in browser settings to get alerts when tab is hidden.';
        hint.style.display = 'block';
      } else if (settings.notifications && perm === 'default') {
        hint.textContent = 'Notifications need permission — toggle will ask for it.';
        hint.style.display = 'block';
      } else {
        hint.style.display = 'none';
        hint.textContent = '';
      }
    }
  }

  // toggle knob visual
  const knob = qs<HTMLElement>('#sound-enabled-knob');
  if (knob && enabledToggle) {
    knob.style.background = enabledToggle.checked ? 'white' : 'var(--text-tertiary)';
    knob.style.transform = enabledToggle.checked ? 'translateX(18px)' : 'translateX(0)';
    const track = enabledToggle.nextElementSibling as HTMLElement | null;
    if (track) {
      track.style.background = enabledToggle.checked ? 'var(--accent-start)' : 'var(--surface-2)';
    }
  }
}

function renderAcademicSetupProfile(): void {
  const profile = getStudentProfile();
  const nameInput = qs<HTMLInputElement>('#student-name');
  const countryInput = qs<HTMLInputElement>('#student-country');
  const classSelect = qs<HTMLSelectElement>('#student-class');
  const mediumSelect = qs<HTMLSelectElement>('#student-medium');
  const languageSelect = qs<HTMLSelectElement>('#student-second-language');
  const coachingSelect = qs<HTMLSelectElement>('#student-coaching');

  if (nameInput) nameInput.value = profile?.name || data.profileName || '';
  if (countryInput) countryInput.value = profile?.country || 'India';
  if (classSelect) classSelect.value = String(profile?.classLevel || 10);
  if (mediumSelect) mediumSelect.value = profile?.medium || 'English';
  if (languageSelect) languageSelect.value = profile?.secondLanguage || 'hindi-b';
  if (coachingSelect) coachingSelect.value = profile?.attendsCoaching ? 'yes' : 'no';
}

function renderSetupBacklogPreview(): void {
  const el = qs<HTMLElement>('#setup-backlog-preview');
  if (!el) return;
  const setupItems = getBacklogs().filter((item) => item.createdFrom === 'initial-setup');
  if (!setupItems.length) {
    el.innerHTML = `<div class="empty" style="padding:12px">No initial backlog added yet.</div>`;
    return;
  }
  el.innerHTML = setupItems
    .slice(-6)
    .reverse()
    .map((item) => {
      const left = Math.max(0, (item.total || 0) - (item.done || 0));
      return `<div class="list-item">
        <div class="info">
          <div class="title backlog-chapter-title">${escapeHTML(item.chapterName || item.name)}</div>
          <div class="meta">${escapeHTML(item.bookName || item.subject || '')}</div>
        </div>
        <span class="tag tag-green">${left} lectures</span>
      </div>`;
    })
    .join('');
}

function showAcademicStep(step: 'profile' | 'backlog'): void {
  qs<HTMLElement>('#academic-profile-step')?.classList.toggle('hidden', step !== 'profile');
  qs<HTMLElement>('#academic-backlog-step')?.classList.toggle('hidden', step !== 'backlog');
  if (step === 'profile') renderAcademicSetupProfile();
  if (step === 'backlog') {
    populateSubjectChapterControls(
      'setup-backlog-subject',
      'setup-backlog-chapter',
      setupBacklogSubject,
    );
    renderSetupBacklogPreview();
  }
}

function openAcademicSetup(): void {
  setLoginOverlayOpen(false);
  setLanguageOverlayOpen(false);
  setDailyClassOverlayOpen(false);
  showAcademicStep(
    isAcademicSetupComplete() && !hasCompletedInitialBacklogSetup() ? 'backlog' : 'profile',
  );
  setAcademicOverlayOpen(true);
  qs<HTMLInputElement>('#student-name')?.focus();
}

function maybeOpenPostLoginSetup(): void {
  if (!(isSessionStarted() || currentUser())) return;
  if (!hasChosenLanguage()) return;
  if (!isAcademicSetupComplete() || !hasCompletedInitialBacklogSetup()) {
    openAcademicSetup();
    return;
  }
  maybeOpenDailyClassCheck();
}

function resetDailyClassDraft(): void {
  dailyMissTarget = 0;
  dailyMissAssigned = 0;
  dailyAttendanceDraft = { totalHeld: 0, attended: 0, missed: 0 };
  const totalInput = qs<HTMLInputElement>('#daily-total-classes');
  const attendedInput = qs<HTMLInputElement>('#daily-attended-classes');
  if (totalInput) totalInput.value = '';
  if (attendedInput) attendedInput.value = '';
  setFormMessage('daily-class-message');
  qs<HTMLElement>('#daily-attendance-step')?.classList.remove('hidden');
  qs<HTMLElement>('#daily-missed-step')?.classList.add('hidden');
  const finishBtn = qs<HTMLButtonElement>('#daily-finish-btn');
  if (finishBtn) finishBtn.disabled = true;
  const list = qs<HTMLElement>('#daily-missed-list');
  if (list) list.textContent = '';
}

function maybeOpenDailyClassCheck(): void {
  if (!(isSessionStarted() || currentUser())) return;
  if (!isAcademicSetupComplete() || !hasCompletedInitialBacklogSetup()) return;
  const overlay = qs<HTMLElement>('#daily-class-overlay');
  if (overlay?.classList.contains('show')) return;
  if (!shouldAskDailyClassCheck()) return;
  resetDailyClassDraft();
  populateSubjectChapterControls(
    'daily-missed-subject',
    'daily-missed-chapter',
    dailyMissedSubject,
  );
  setDailyClassOverlayOpen(true);
  qs<HTMLInputElement>('#daily-total-classes')?.focus();
}

function renderDailyMissedList(): void {
  const list = qs<HTMLElement>('#daily-missed-list');
  const summary = qs<HTMLElement>('#daily-missed-summary');
  const finishBtn = qs<HTMLButtonElement>('#daily-finish-btn');
  if (summary) {
    summary.textContent = `You missed ${dailyMissTarget} class${dailyMissTarget === 1 ? '' : 'es'}. Added ${dailyMissAssigned}/${dailyMissTarget} to backlog.`;
  }
  if (finishBtn) finishBtn.disabled = dailyMissAssigned < dailyMissTarget;
  if (!list) return;
  const todayItems = getBacklogs()
    .filter((item) => item.createdFrom === 'daily-check')
    .slice(-dailyMissAssigned)
    .reverse();
  list.innerHTML = todayItems.length
    ? todayItems
        .map(
          (item) => `<div class="list-item">
            <div class="info">
              <div class="title backlog-chapter-title">${escapeHTML(item.chapterName || item.name)}</div>
              <div class="meta">${escapeHTML(item.bookName || item.subject || '')}</div>
            </div>
            <span class="tag tag-green">+1</span>
          </div>`,
        )
        .join('')
    : `<div class="empty" style="padding:12px">Add each missed class to an NCERT chapter.</div>`;
}

function finishDailyCheck(): void {
  completeDailyClassCheck({ ...dailyAttendanceDraft, assignedBacklog: dailyMissAssigned });
  setDailyClassOverlayOpen(false);
  renderBacklogs();
  updateDashboard();
  showCelebrate('Daily Check-in Done', 'Your backlog is updated for today.', '🌙');
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

/**
 * Only used as a last-resort manual override. Normal login auto-merges using
 * the richer-side logic in cloudSync so PC and phone stay identical.
 */
function askSyncChoice(): 'local' | 'cloud' | 'merge' {
  return 'merge';
}

/** After cloud data lands, redraw every surface that shows progress/backlog. */
function refreshAfterCloudSync(): void {
  try {
    // Cloud data may have been written on a different day/device — realign today's
    // counters with the session log before anything is drawn.
    reconcileDailyFocus();
    updateDashboard();
    renderHabits();
    renderBacklogs();
    renderBattle();
    renderStreak();
    renderBuddy();
    renderWeekly();
    renderTrophyPreview();
    renderRitual();
    renderSubjects();
    renderProfile();
    renderAccountSettings();
    renderFocusHistory();
    renderMissionPlanner();
    updateFocusUI();
  } catch (e) {
    console.debug('refreshAfterCloudSync', e);
  }
}

// ===================================================================
// DAILY ROLLOVER
// ===================================================================

/** The calendar day the UI currently believes it is showing. */
let lastRenderedDay = todayStr();

/**
 * Keeps a long-running app honest about what day it is.
 *
 * The daily reset used to run only once, when the page first loaded. If the app
 * stayed open past midnight (phones keep PWAs alive for days), yesterday's focus
 * minutes, checks and quests were still displayed as "today". This re-runs the
 * reset, re-derives today's focus from the recorded sessions, and redraws only
 * when something actually changed.
 */
function syncDailyRollover(): void {
  const today = todayStr();
  const dayChanged = today !== lastRenderedDay;
  lastRenderedDay = today;

  try {
    applyDailyResets();
  } catch (e) {
    console.debug('applyDailyResets', e);
  }
  try {
    resetHabitsForNewDay();
  } catch (e) {
    console.debug('resetHabitsForNewDay', e);
  }

  const healed = reconcileDailyFocus();
  if (!dayChanged && !healed) return;

  if (dayChanged) {
    try {
      generateDailyQuests();
    } catch (e) {
      console.debug('generateDailyQuests', e);
    }
    dailyChecksBuilt = false;
    try {
      renderDailyChecks();
    } catch (e) {
      console.debug('renderDailyChecks', e);
    }
    // Follow the user into the new day instead of stranding them on yesterday.
    focusHistoryDate = localISODate();
  }

  try {
    updateDashboard();
    renderQuests();
    renderRitual();
    renderHabits();
  } catch (e) {
    console.debug('syncDailyRollover render', e);
  }
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

  // Calculate remaining backlogs: sum of (total - done) for each backlog
  // Guard against data corruption where done > total
  if (db) {
    const remaining = data.backlogs.reduce((sum, b) => {
      const total = b.total || 0;
      const done = Math.min(b.done || 0, total); // Prevent negative remaining
      return sum + (total - done);
    }, 0);
    db.textContent = String(remaining);
  }

  // Today's focus comes from the recorded session log — the same source the
  // "Today's Focus" panel uses — so the two can never show different stories.
  if (df) df.textContent = `${getTodayFocusHours().toFixed(1)}h`;

  if (dh) dh.textContent = String(data.habits.filter((h) => h.today).length);

  // Priority section
  const dp = qs<HTMLElement>('#dash-priority');
  if (dp) {
    const inc = data.backlogs
      .filter((b) => (b.done || 0) < (b.total || 0))
      .sort((a, b) => (b.total || 0) - (b.done || 0) - ((a.total || 0) - (a.done || 0)));
    const ht = data.habits.filter((h) => !h.today);
    let html = '';

    dp.classList.remove('next-action-highlight');

    if (inc.length > 0 && inc[0]) {
      const remaining = (inc[0].total || 0) - (inc[0].done || 0);
      const remainingText = t('backlog.lectures_remaining', { count: remaining });
      const urgentTag = t('backlog.urgent');
      const priorityTitle = inc[0].chapterName || inc[0].name;
      const priorityMeta = [inc[0].subjectLabel || inc[0].subject, inc[0].bookName, remainingText]
        .filter(Boolean)
        .join(' · ');
      html += `<div class="list-item"><div class="info"><div class="title backlog-chapter-title">${escapeHTML(priorityTitle)}</div><div class="meta">${escapeHTML(priorityMeta)}</div></div><span class="tag tag-red">${escapeHTML(urgentTag)}</span></div>`;
      dp.classList.add('next-action-highlight');
    }
    if (ht.length > 0 && ht[0]) {
      const anchorText = t('plan.after_anchor', {
        anchor: escapeHTML(ht[0].anchor || 'waking up'),
      });
      const nextTag = t('plan.next_tag');
      html += `<div class="list-item"><div class="info"><div class="title">${escapeHTML(ht[0].name)}</div><div class="meta">${anchorText}</div></div><span class="tag tag-blue">${escapeHTML(nextTag)}</span></div>`;
      if (!dp.classList.contains('next-action-highlight')) {
        dp.classList.add('next-action-highlight');
      }
    }
    dp.innerHTML =
      html ||
      `<div class="empty"><div class="empty-icon">🎉</div>${escapeHTML(t('home.priority_empty'))}</div>`;
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
  renderHomePremium();
  recordDailyStat();
  checkQuests();
  checkBadges();
  renderProfile();
  renderQuote();
  renderFocusHistory();
  renderMissionPlanner();
}

// ===================================================================
// EVENT HANDLERS
// ===================================================================

type AuthMode = 'signin' | 'signup';
type LoginView = 'choice' | 'email' | 'local' | 'forgot' | 'reset';
type MessageTone = 'error' | 'success' | 'info';

let authMode: AuthMode = 'signin';
let authSubmitting = false;
let resendSubmitting = false;
let forgotSubmitting = false;
let resetSubmitting = false;
/** True while the user opened a recovery link and must set a new password. */
let passwordRecoveryPending = false;

function setLoginHeader(
  kickerKey: TranslationKey,
  titleKey: TranslationKey,
  subtitleKey: TranslationKey,
): void {
  const kickerElement = qs<HTMLElement>('#login-kicker');
  const titleElement = qs<HTMLElement>('#login-title');
  const subtitleElement = qs<HTMLElement>('#login-subtitle');
  if (kickerElement) kickerElement.textContent = t(kickerKey);
  if (titleElement) titleElement.textContent = t(titleKey);
  if (subtitleElement) subtitleElement.textContent = t(subtitleKey);
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
    toggle.setAttribute('aria-label', t('auth.show_password'));
    toggle.textContent = t('auth.show');
  }
}

function updateAuthControls(): void {
  const sendBtn = qs<HTMLButtonElement>('#send-login-btn');
  const signInButton = qs<HTMLButtonElement>('#auth-tab-signin');
  const signUpButton = qs<HTMLButtonElement>('#auth-tab-signup');
  const action = authMode === 'signin' ? t('auth.submit_signin') : t('auth.submit_signup');
  const pendingAction =
    authMode === 'signin' ? t('auth.submit_signin_pending') : t('auth.submit_signup_pending');

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
    passwordInput.placeholder =
      mode === 'signin' ? t('auth.password_ph_signin') : t('auth.password_ph_signup');
  }

  if (mode === 'signin') {
    setLoginHeader('auth.kicker_signin', 'auth.title_signin', 'auth.subtitle_signin');
  } else {
    setLoginHeader('auth.kicker_signup', 'auth.title_signup', 'auth.subtitle_signup');
  }

  qs<HTMLButtonElement>('#forgot-password-btn')?.classList.toggle(
    'hidden',
    mode !== 'signin' || !isEmailAuthConfigured,
  );

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
  qs<HTMLElement>('#forgot-password-form')?.classList.toggle('hidden', view !== 'forgot');
  qs<HTMLElement>('#reset-password-form')?.classList.toggle('hidden', view !== 'reset');

  if (view === 'choice') {
    setLoginHeader('auth.kicker', 'auth.title', 'auth.subtitle');
    setFormMessage('login-message');
    setFormMessage('local-login-message');
    setFormMessage('forgot-message');
    setFormMessage('reset-message');
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
    const forgotBtn = qs<HTMLButtonElement>('#forgot-password-btn');
    forgotBtn?.classList.toggle('hidden', mode !== 'signin' || !isEmailAuthConfigured);
    return;
  }

  if (view === 'forgot') {
    setLoginHeader('auth.kicker_forgot', 'auth.title_forgot', 'auth.subtitle_forgot');
    setFormMessage('forgot-message');
    const emailFromLogin = qs<HTMLInputElement>('#login-email')?.value || '';
    const forgotEmail = qs<HTMLInputElement>('#forgot-email');
    if (forgotEmail && !forgotEmail.value && emailFromLogin) forgotEmail.value = emailFromLogin;
    return;
  }

  if (view === 'reset') {
    setLoginHeader('auth.kicker_reset', 'auth.title_reset', 'auth.subtitle_reset');
    setFormMessage('reset-message');
    const newPw = qs<HTMLInputElement>('#new-password');
    if (newPw) newPw.value = '';
    return;
  }

  setLoginHeader('auth.kicker_local', 'auth.title_local', 'auth.subtitle_local');
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

function setupStudyPickers(): void {
  const pickers = [
    { id: 'setup-backlog-subject', title: 'Choose a subject', search: 'Search subjects' },
    { id: 'setup-backlog-chapter', title: 'Choose a chapter', search: 'Search chapters' },
    { id: 'daily-missed-subject', title: 'Which subject did you miss?', search: 'Search subjects' },
    { id: 'daily-missed-chapter', title: 'Choose the missed chapter', search: 'Search chapters' },
    { id: 'bl-subject', title: 'Choose a subject', search: 'Search subjects' },
    { id: 'bl-chapter', title: 'Choose a chapter', search: 'Search chapters' },
    { id: 'mission-subject', title: 'Choose your focus subject', search: 'Search subjects' },
    { id: 'mission-chapter', title: 'Choose your focus topic', search: 'Search topics' },
  ];

  pickers.forEach(({ id, title, search }) => {
    const select = qs<HTMLSelectElement>(`#${id}`);
    if (!select) return;
    enhancePremiumSelect(select, {
      title,
      searchPlaceholder: search,
    });
  });
}

function setupEventListeners() {
  // Tab navigation
  qsa<HTMLElement>('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = (btn as HTMLElement).dataset.tab;
      if (tab) switchTab(tab);
    });
  });

  // Home desktop shortcuts use the same guarded tab switch as the main nav.
  qsa<HTMLElement>('[data-home-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const tab = (button as HTMLElement).dataset.homeTab;
      if (tab) switchTab(tab);
    });
  });

  // Settings button
  qs<HTMLElement>('#settings-btn')?.addEventListener('click', () => {
    qs<HTMLElement>('#settings-overlay')?.classList.add('show');
    renderProfile();
    renderAccountSettings();
    renderSoundSettings();
  });
  qs<HTMLElement>('#settings-login-btn')?.addEventListener('click', () => {
    qs<HTMLElement>('#settings-overlay')?.classList.remove('show');
    openEmailAuth('signin');
  });
  qs<HTMLElement>('#sync-now-btn')?.addEventListener('click', async () => {
    try {
      await syncNow();
      refreshAfterCloudSync();
      showCelebrate('Synced', 'Progress is the same on all your devices.', '☁️');
    } catch {
      showCelebrate('Sync unavailable', 'Your local progress is still safe.', '⚠️', true);
    }
  });
  qs<HTMLElement>('#logout-btn')?.addEventListener('click', async () => {
    await logout();
    bindLocalDataToUser(null);
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
      const confirmMessage = isSignedIn
        ? 'This will replace your current local progress. A backup of your current data will be saved automatically.\n\nImporting is local first — cloud sync remains a separate step.'
        : 'This will replace your current local progress. A backup of your current data will be saved automatically.';

      const confirmed = await confirmDialog({
        title: `Restore ${validation.fieldCount} fields from backup?`,
        message: confirmMessage,
        confirmLabel: 'Restore backup',
        cancelLabel: 'Cancel',
        danger: true,
      });
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
      reconcileDailyFocus();
      renderFocusHistory();
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

  // First-run flow: welcome screen → account start → language picker.
  qs<HTMLElement>('#welcome-cta-btn')?.addEventListener('click', () => {
    markWelcomeSeen();
    setWelcomeOverlayOpen(false);
    renderSession();
  });

  qs<HTMLElement>('#language-continue-btn')?.addEventListener('click', () => {
    confirmLanguagePick();
  });

  // Student academic setup
  qs<HTMLElement>('#academic-save-btn')?.addEventListener('click', () => {
    const name = qs<HTMLInputElement>('#student-name')?.value || data.profileName || '';
    const country = qs<HTMLInputElement>('#student-country')?.value || 'India';
    const classLevel = parseInt(qs<HTMLSelectElement>('#student-class')?.value || '10', 10);
    const medium = (qs<HTMLSelectElement>('#student-medium')?.value ||
      'English') as StudentProfile['medium'];
    const secondLanguage = (qs<HTMLSelectElement>('#student-second-language')?.value ||
      'hindi-b') as SecondLanguageChoice;
    const attendsCoaching = (qs<HTMLSelectElement>('#student-coaching')?.value || 'yes') === 'yes';
    const result = saveStudentProfile({
      name,
      country,
      classLevel,
      medium,
      secondLanguage,
      attendsCoaching,
    });
    if (!result.success) {
      setFormMessage('academic-message', result.error || 'Check your details.', 'error');
      return;
    }
    setFormMessage('academic-message');
    renderProfile();
    renderBacklogControls();
    if (result.profile?.syllabusPackId === 'india-ncert-class-10') {
      showAcademicStep('backlog');
    } else {
      completeInitialBacklogSetup();
      setAcademicOverlayOpen(false);
      showCelebrate('Study Setup Saved', 'Manual backlog mode is ready.', '🎒');
      maybeOpenDailyClassCheck();
    }
  });

  qs<HTMLSelectElement>('#setup-backlog-subject')?.addEventListener('change', (event) => {
    setupBacklogSubject = (event.currentTarget as HTMLSelectElement).value || 'Physics';
    const chapterSelect = qs<HTMLSelectElement>('#setup-backlog-chapter');
    if (chapterSelect) updateChapterSelect(event.currentTarget as HTMLSelectElement, chapterSelect);
  });

  qs<HTMLElement>('#setup-add-backlog-btn')?.addEventListener('click', () => {
    const input = backlogInputFromControls(
      'setup-backlog-subject',
      'setup-backlog-chapter',
      'setup-backlog-count',
      undefined,
      'initial-setup',
    );
    if (!input) return;
    const result = addBacklog(input);
    if (!result.success) {
      showCelebrate('Missing Info', result.error || 'Enter lecture count', '⚠️', true);
      return;
    }
    const count = qs<HTMLInputElement>('#setup-backlog-count');
    if (count) count.value = '';
    renderSetupBacklogPreview();
    renderBacklogs();
    updateDashboard();
  });

  qs<HTMLElement>('#setup-finish-btn')?.addEventListener('click', () => {
    completeInitialBacklogSetup();
    setAcademicOverlayOpen(false);
    renderBacklogs();
    updateDashboard();
    showCelebrate('NCERT Loaded', 'Your Class 10 backlog tracker is ready.', '📚');
    maybeOpenDailyClassCheck();
  });

  // Daily class check-in
  qs<HTMLElement>('#daily-skip-btn')?.addEventListener('click', () => {
    skipDailyClassCheck();
    setDailyClassOverlayOpen(false);
  });
  qs<HTMLElement>('#daily-missed-skip-btn')?.addEventListener('click', () => {
    skipDailyClassCheck();
    setDailyClassOverlayOpen(false);
  });
  qs<HTMLElement>('#daily-attendance-next-btn')?.addEventListener('click', () => {
    const total = parseInt(qs<HTMLInputElement>('#daily-total-classes')?.value || '', 10);
    const attended = parseInt(qs<HTMLInputElement>('#daily-attended-classes')?.value || '', 10);
    const result = validateDailyAttendance(total, attended);
    if (!result.success) {
      setFormMessage('daily-class-message', result.error || 'Check class numbers.', 'error');
      return;
    }
    setFormMessage('daily-class-message');
    dailyAttendanceDraft = {
      totalHeld: result.totalHeld || 0,
      attended: result.attended || 0,
      missed: result.missed || 0,
    };
    dailyMissTarget = result.missed || 0;
    dailyMissAssigned = 0;
    if (dailyMissTarget <= 0) {
      finishDailyCheck();
      return;
    }
    qs<HTMLElement>('#daily-attendance-step')?.classList.add('hidden');
    qs<HTMLElement>('#daily-missed-step')?.classList.remove('hidden');
    populateSubjectChapterControls(
      'daily-missed-subject',
      'daily-missed-chapter',
      dailyMissedSubject,
    );
    renderDailyMissedList();
  });

  qs<HTMLSelectElement>('#daily-missed-subject')?.addEventListener('change', (event) => {
    dailyMissedSubject = (event.currentTarget as HTMLSelectElement).value || 'Physics';
    const chapterSelect = qs<HTMLSelectElement>('#daily-missed-chapter');
    if (chapterSelect) updateChapterSelect(event.currentTarget as HTMLSelectElement, chapterSelect);
  });

  qs<HTMLElement>('#daily-add-missed-btn')?.addEventListener('click', () => {
    if (dailyMissAssigned >= dailyMissTarget) return;
    const input = backlogInputFromControls(
      'daily-missed-subject',
      'daily-missed-chapter',
      'daily-total-classes',
      undefined,
      'daily-check',
      1,
    );
    if (!input) return;
    const result = addBacklog(input);
    if (!result.success) {
      showCelebrate('Missing Info', result.error || 'Choose subject and chapter', '⚠️', true);
      return;
    }
    dailyMissAssigned += 1;
    renderDailyMissedList();
    renderBacklogs();
    updateDashboard();
  });

  qs<HTMLElement>('#daily-finish-btn')?.addEventListener('click', () => {
    if (dailyMissAssigned < dailyMissTarget) return;
    finishDailyCheck();
  });

  // Account start screen. All handlers are attached here (no inline JS).
  qs<HTMLElement>('#email-login-btn')?.addEventListener('click', () => openEmailAuth('signin'));
  qs<HTMLElement>('#create-account-btn')?.addEventListener('click', () => openEmailAuth('signup'));
  qs<HTMLElement>('#back-login-btn')?.addEventListener('click', renderSession);
  qs<HTMLElement>('#back-local-btn')?.addEventListener('click', renderSession);
  qs<HTMLElement>('#back-forgot-btn')?.addEventListener('click', () => openEmailAuth('signin'));
  qs<HTMLElement>('#auth-tab-signin')?.addEventListener('click', () => setAuthMode('signin'));
  qs<HTMLElement>('#auth-tab-signup')?.addEventListener('click', () => setAuthMode('signup'));
  qs<HTMLElement>('#forgot-password-btn')?.addEventListener('click', () => {
    showLoginView('forgot');
    setLoginOverlayOpen(true);
    qs<HTMLInputElement>('#forgot-email')?.focus();
  });

  const wirePasswordToggle = (toggleId: string, inputId: string) => {
    qs<HTMLButtonElement>(toggleId)?.addEventListener('click', (event) => {
      const toggle = event.currentTarget as HTMLButtonElement;
      const passwordInput = qs<HTMLInputElement>(inputId);
      if (!passwordInput) return;
      const shouldShow = passwordInput.type === 'password';
      passwordInput.type = shouldShow ? 'text' : 'password';
      toggle.setAttribute('aria-pressed', String(shouldShow));
      toggle.setAttribute(
        'aria-label',
        shouldShow ? t('auth.hide_password') : t('auth.show_password'),
      );
      toggle.textContent = shouldShow ? t('auth.hide') : t('auth.show');
    });
  };
  wirePasswordToggle('#toggle-login-password', '#login-password');
  wirePasswordToggle('#toggle-new-password', '#new-password');

  qs<HTMLFormElement>('#forgot-password-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (forgotSubmitting || !isEmailAuthConfigured) return;
    const email = qs<HTMLInputElement>('#forgot-email')?.value || '';
    forgotSubmitting = true;
    const sendBtn = qs<HTMLButtonElement>('#send-reset-btn');
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = t('auth.send_reset_pending');
    }
    setFormMessage('forgot-message');
    try {
      const result = await requestPasswordReset(email);
      setFormMessage('forgot-message', result.message, result.ok ? 'success' : 'error');
      if (!result.ok && result.message.toLowerCase().includes('email')) {
        qs<HTMLInputElement>('#forgot-email')?.setAttribute('aria-invalid', 'true');
      }
    } catch {
      setFormMessage('forgot-message', 'Something went wrong. Please try again.', 'error');
    } finally {
      forgotSubmitting = false;
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.textContent = t('auth.send_reset');
      }
    }
  });

  qs<HTMLFormElement>('#reset-password-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (resetSubmitting || !isEmailAuthConfigured) return;
    const password = qs<HTMLInputElement>('#new-password')?.value || '';
    resetSubmitting = true;
    const saveBtn = qs<HTMLButtonElement>('#save-new-password-btn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = t('auth.save_new_password_pending');
    }
    setFormMessage('reset-message');
    try {
      const result = await updatePasswordAfterReset(password);
      setFormMessage('reset-message', result.message, result.ok ? 'success' : 'error');
      if (result.ok) {
        passwordRecoveryPending = false;
        const newPw = qs<HTMLInputElement>('#new-password');
        if (newPw) newPw.value = '';
        setLoginOverlayOpen(false);
        renderAccountSettings();
        markWelcomeSeen();
        try {
          const user = currentUser();
          if (user) bindLocalDataToUser(user.id);
          const syncResult = await syncOnLogin();
          if (syncResult.kind === 'conflict') await syncOnLogin(askSyncChoice());
          startAutoSync();
          refreshAfterCloudSync();
        } catch {
          // offline ok
        }
        showCelebrate('Password updated', 'You are signed in. Progress will sync.', '🔐');
        if (!hasChosenLanguage()) openLanguagePicker();
        else maybeOpenPostLoginSetup();
      } else if (result.message.toLowerCase().includes('password')) {
        qs<HTMLInputElement>('#new-password')?.setAttribute('aria-invalid', 'true');
      }
    } catch {
      setFormMessage('reset-message', 'Something went wrong. Please try again.', 'error');
    } finally {
      resetSubmitting = false;
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = t('auth.save_new_password');
      }
    }
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
        // Anyone who has entered the app is past the explainer stage —
        // e.g. a later logout must return to login, not to the welcome screen.
        markWelcomeSeen();
        // Pull/push cloud progress immediately so phone and PC match.
        try {
          const user = currentUser();
          if (user) bindLocalDataToUser(user.id);
          const syncResult = await syncOnLogin();
          if (syncResult.kind === 'conflict') {
            await syncOnLogin(askSyncChoice());
          }
          startAutoSync();
          refreshAfterCloudSync();
        } catch {
          // Offline is fine — local progress still works.
        }
        // First-run only: let the user pick their in-app language once.
        if (!hasChosenLanguage()) openLanguagePicker();
        else maybeOpenPostLoginSetup();
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
    markWelcomeSeen();
    // First-run only: pick the in-app language, then celebrate the start.
    if (!hasChosenLanguage()) {
      openLanguagePicker(() => {
        showCelebrate('Welcome', `Ready when you are, ${data.profileName}.`, 'neuro-mark');
        maybeOpenPostLoginSetup();
      });
    } else {
      showCelebrate('Welcome', `Ready when you are, ${data.profileName}.`, 'neuro-mark');
      maybeOpenPostLoginSetup();
    }
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
    persist('profileName');
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
    persist('mission');
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
  qs<HTMLElement>('#reset-today-btn')?.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: "Reset today's progress?",
      message:
        'This clears today’s focus sessions, daily checks, ritual, and streak claim for the day. Your XP and history from previous days stay safe.',
      confirmLabel: 'Reset today',
      cancelLabel: 'Keep it',
      danger: true,
    });
    if (!confirmed) return;
    data.dailyChecks = {};
    data.detoxLastDate = null;
    // Remove today's recorded sessions too. Zeroing only the counter used to leave
    // the sessions behind, so Home showed 0h while "Today's Focus" still listed work.
    clearFocusSessionsForDate(localISODate());
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
    // Write through the storage module so cloud sync notices the change (raw
    // localStorage.setItem here used to silently skip the cloud-push trigger).
    persistMany([
      'dailyChecks',
      'detoxLastDate',
      'focusMinutes',
      'focusDate',
      'flowState',
      'sessions',
      'morningRitual',
      'dailyQuests',
      'backlogsToday',
      'habitsToday',
    ]);
    dailyChecksBuilt = false;
    renderDailyChecks();
    updateDashboard();
  });

  qs<HTMLElement>('#reset-all-btn')?.addEventListener('click', async () => {
    const first = await confirmDialog({
      title: 'Delete ALL your progress?',
      message: '⚠️ This will DELETE ALL your progress forever. This cannot be undone.',
      confirmLabel: 'Delete everything',
      cancelLabel: 'Cancel',
      danger: true,
    });
    if (!first) return;
    const second = await confirmDialog({
      title: 'Really sure?',
      message: 'This is your last chance. Every lecture, badge, and streak will be gone.',
      confirmLabel: 'Yes, delete forever',
      cancelLabel: 'Cancel',
      danger: true,
    });
    if (!second) return;
    clearAll();
    location.reload();
  });

  // Trophy preview
  qs<HTMLElement>('#trophy-preview')?.addEventListener('click', () => {
    const overlay = qs<HTMLElement>('#trophy-overlay');
    if (!overlay) return;
    updateTrophyModal();
    overlay.classList.add('show');
    document.body.classList.add('auth-open');
    qs<HTMLButtonElement>('#trophy-close-btn')?.focus();
  });

  qs<HTMLElement>('#trophy-close-btn')?.addEventListener('click', () => {
    const overlay = qs<HTMLElement>('#trophy-overlay');
    overlay?.classList.remove('show');
    if (!overlay?.classList.contains('show')) document.body.classList.remove('auth-open');
    qs<HTMLElement>('#trophy-preview')?.focus();
  });
  qs<HTMLElement>('#trophy-overlay')?.addEventListener('click', (e) => {
    const overlay = qs<HTMLElement>('#trophy-overlay');
    if (e.target === e.currentTarget && overlay) {
      overlay.classList.remove('show');
      document.body.classList.remove('auth-open');
      qs<HTMLElement>('#trophy-preview')?.focus();
    }
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

  // Backlog subject/chapter selectors
  qs<HTMLSelectElement>('#bl-subject')?.addEventListener('change', (event) => {
    selectedBacklogSubject = (event.currentTarget as HTMLSelectElement).value || 'Physics';
    const chapterSelect = qs<HTMLSelectElement>('#bl-chapter');
    if (chapterSelect) updateChapterSelect(event.currentTarget as HTMLSelectElement, chapterSelect);
  });

  // Add backlog
  qs<HTMLElement>('#bl-add-btn')?.addEventListener('click', () => {
    const input = backlogInputFromControls(
      'bl-subject',
      'bl-chapter',
      'bl-count',
      'bl-name',
      'manual',
    );
    if (!input) return;
    const result = addBacklog(input);
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

  // Mission planner controls
  qs<HTMLElement>('#mission-setup-cancel-btn')?.addEventListener('click', () => {
    closeMissionSetup();
  });
  qs<HTMLElement>('#mission-confirm-btn')?.addEventListener('click', () => {
    confirmMission();
  });
  qs<HTMLElement>('#mission-clear-btn')?.addEventListener('click', () => {
    clearActiveMission();
  });

  // Manual mission chapter picker — keeps the subject → chapter cascade in sync
  // and auto-links the mission to a Backlog tab row.
  qs<HTMLSelectElement>('#mission-subject')?.addEventListener('change', (event) => {
    const subjectSelect = event.currentTarget as HTMLSelectElement;
    const chapterSelect = qs<HTMLSelectElement>('#mission-chapter');
    if (chapterSelect) {
      chapterSelect.disabled = false;
      populateMissionChapterSelect(subjectSelect, chapterSelect, '');
    }
    updateMissionLinkHint();
  });

  qs<HTMLSelectElement>('#mission-chapter')?.addEventListener('change', () => {
    const chapterSelect = qs<HTMLSelectElement>('#mission-chapter');
    const titleInput = qs<HTMLInputElement>('#mission-title');
    if (chapterSelect && titleInput && !missionTitleTouched) {
      const chapter = findNcertChapter(chapterSelect.value, getStudentProfile());
      if (chapter) titleInput.value = chapter.title;
    }
    updateMissionLinkHint();
  });

  qs<HTMLInputElement>('#mission-title')?.addEventListener('input', () => {
    missionTitleTouched = true;
  });

  // Focus timer modes
  qsa<HTMLElement>('.timer-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      if (chip.id === 'mode-custom') {
        // The Custom chip only reveals the manual input; the timer updates on Set/Enter.
        setCustomTimerRowVisible(true);
        qs<HTMLInputElement>('#custom-timer-minutes')?.focus();
        return;
      }
      setCustomTimerRowVisible(false);
      const mode = parseInt(chip.dataset.mode || '0', 10);
      setMode(mode);
      qsa<HTMLElement>('.timer-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      updateFocusUI();
    });
  });

  // Custom focus duration (manual minutes input)
  qs<HTMLElement>('#custom-timer-set-btn')?.addEventListener('click', applyCustomTimerFromInput);
  qs<HTMLInputElement>('#custom-timer-minutes')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyCustomTimerFromInput();
    }
  });
  qs<HTMLInputElement>('#custom-timer-minutes')?.addEventListener('input', (event) => {
    (event.target as HTMLInputElement).removeAttribute('aria-invalid');
  });

  // Focus start/pause
  qs<HTMLElement>('#focus-history-today')?.addEventListener('click', () =>
    setFocusHistoryDate(localISODate()),
  );
  qs<HTMLElement>('#focus-history-prev')?.addEventListener('click', () =>
    setFocusHistoryDate(shiftISODate(focusHistoryDate, -1)),
  );
  qs<HTMLElement>('#focus-history-next')?.addEventListener('click', () =>
    setFocusHistoryDate(shiftISODate(focusHistoryDate, 1)),
  );
  qs<HTMLInputElement>('#focus-history-date')?.addEventListener('change', (event) => {
    setFocusHistoryDate((event.currentTarget as HTMLInputElement).value);
  });

  qs<HTMLElement>('#focus-btn')?.addEventListener('click', () => {
    const state = getTimerState();
    if (state.running) {
      pauseTimer();
    } else {
      startTimer();
      openImmersiveFocus();
    }
    updateFocusUI();
  });

  // Focus reset
  qs<HTMLElement>('#focus-reset-btn')?.addEventListener('click', () => {
    stopTimer();
    const btn = qs<HTMLElement>('#focus-btn');
    if (btn) btn.textContent = t('focus.start');
    updateFocusUI();
  });

  // Immersive focus controls
  qs<HTMLElement>('#focus-immersive-pause-btn')?.addEventListener('click', () => {
    const surface = qs<HTMLElement>('.focus-immersive-surface.timeup-active');
    if (surface) {
      // TIME'S UP state — dismiss
      stopAllAlerts();
      clearTimeUpState();
      closeImmersiveFocus();
      return;
    }
    const state = getTimerState();
    if (state.running) {
      pauseTimer();
    } else {
      startTimer();
    }
    updateFocusUI();
  });

  qs<HTMLElement>('#focus-immersive-reset-btn')?.addEventListener('click', () => {
    stopTimer();
    const btn = qs<HTMLElement>('#focus-btn');
    if (btn) btn.textContent = t('focus.start');
    updateFocusUI();
  });

  qs<HTMLElement>('#focus-immersive-exit-btn')?.addEventListener('click', () => {
    closeImmersiveFocus();
  });

  // Global keyboard handlers for immersive focus
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      trapFocusInImmersive(e);
    }
    if (e.key === 'Escape') {
      const overlay = qs<HTMLElement>('#focus-immersive-overlay');
      if (overlay?.classList.contains('show')) {
        e.preventDefault();
        // If the TIME'S UP alarm is showing, Escape dismisses it fully — leaving
        // the loop running with the overlay closed gives no way to stop it.
        stopAllAlerts();
        clearTimeUpState();
        closeImmersiveFocus();
        return;
      }
      // Escape also kills a looping alarm (e.g. urge timer) from anywhere.
      if (isAlarmLooping()) {
        e.preventDefault();
        stopAllAlerts();
        return;
      }
      const trophy = qs<HTMLElement>('#trophy-overlay');
      if (trophy?.classList.contains('show')) {
        e.preventDefault();
        trophy.classList.remove('show');
        document.body.classList.remove('auth-open');
        qs<HTMLElement>('#trophy-preview')?.focus();
      }
    }
  });

  // Urge timer
  qs<HTMLElement>('#urge-start-btn')?.addEventListener('click', () => {
    stopAllAlerts();
    startUrge();
    const btn = qs<HTMLElement>('#urge-start-btn');
    if (btn) btn.textContent = t('detox.surfing');
  });

  qs<HTMLElement>('#urge-reset-btn')?.addEventListener('click', () => {
    stopAllAlerts();
    resetUrge();
    const btn = qs<HTMLElement>('#urge-start-btn');
    if (btn) btn.textContent = t('detox.start_surf');
    updateUrgeUI();
  });

  // Sound & Alerts Settings
  qs<HTMLInputElement>('#sound-enabled-toggle')?.addEventListener('change', (e) => {
    const checked = (e.currentTarget as HTMLInputElement).checked;
    updateSoundSettings({ enabled: checked });
    renderSoundSettings();
    if (checked) void playTestSound(getSoundSettings().pack);
  });

  qs<HTMLInputElement>('#sound-volume-slider')?.addEventListener('input', (e) => {
    const val = parseInt((e.currentTarget as HTMLInputElement).value, 10);
    const vol = Math.min(100, Math.max(0, val)) / 100;
    updateSoundSettings({ volume: vol });
    const label = qs<HTMLElement>('#sound-volume-label');
    if (label) label.textContent = `${val}%`;
  });

  qs<HTMLInputElement>('#sound-volume-slider')?.addEventListener('change', (e) => {
    const val = parseInt((e.currentTarget as HTMLInputElement).value, 10);
    const pack = getSoundSettings().pack;
    void playTestSound(pack);
    void (e.currentTarget as HTMLInputElement).blur();
    showCelebrate('Volume', `Set to ${val}%`, '🔊', true);
  });

  qsa<HTMLElement>('.sound-pack-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pack = (btn as HTMLElement).dataset.pack as SoundPack;
      if (!pack) return;
      updateSoundSettings({ pack });
      renderSoundSettings();
      void playTestSound(pack);
    });
  });

  qs<HTMLInputElement>('#sound-loop-toggle')?.addEventListener('change', (e) => {
    const checked = (e.currentTarget as HTMLInputElement).checked;
    updateSoundSettings({ loop: checked });
    renderSoundSettings();
  });

  qs<HTMLInputElement>('#sound-vibration-toggle')?.addEventListener('change', (e) => {
    const checked = (e.currentTarget as HTMLInputElement).checked;
    updateSoundSettings({ vibration: checked });
    renderSoundSettings();
    if (checked && navigator.vibrate) navigator.vibrate([100, 50, 100]);
  });

  qs<HTMLInputElement>('#sound-notification-toggle')?.addEventListener('change', async (e) => {
    const input = e.currentTarget as HTMLInputElement;
    const checked = input.checked;

    if (checked && isNotificationSupported()) {
      const perm = getNotificationPermission();
      if (perm === 'default') {
        const result = await requestNotificationPermission();
        if (result !== 'granted') {
          input.checked = false;
          updateSoundSettings({ notifications: false });
          renderSoundSettings();
          showCelebrate(
            'Notifications Blocked',
            'Allow notifications in browser settings',
            '⚠️',
            true,
          );
          return;
        }
      } else if (perm === 'denied') {
        input.checked = false;
        updateSoundSettings({ notifications: false });
        renderSoundSettings();
        showCelebrate('Permission Denied', 'Enable in browser settings', '⚠️', true);
        return;
      }
    }

    updateSoundSettings({ notifications: checked });
    renderSoundSettings();
    if (checked)
      showCelebrate('Notifications ON', 'You will get alerts when tab hidden', '🔔', true);
  });

  qs<HTMLElement>('#sound-test-btn')?.addEventListener('click', () => {
    const pack = getSoundSettings().pack;
    void playTestSound(pack);
    vibrateStrong();
    const btn = qs<HTMLElement>('#sound-test-btn');
    if (btn) {
      btn.classList.add('btn-alarm-active');
      setTimeout(() => btn.classList.remove('btn-alarm-active'), 1500);
    }
  });

  qs<HTMLElement>('#sound-stop-btn')?.addEventListener('click', () => {
    stopAllAlerts();
    clearTimeUpState();
    showCelebrate('Alarm Stopped', 'All alerts silenced', '🔕', true);
  });

  // Ensure settings button renders sound settings
  const settingsBtnOriginal = qs<HTMLElement>('#settings-btn');
  if (settingsBtnOriginal && !(settingsBtnOriginal as any)._enhanced) {
    (settingsBtnOriginal as any)._enhanced = true;
    // We already have listener above, but also render sound settings when opening
    settingsBtnOriginal.addEventListener('click', () => {
      renderSoundSettings();
    });
  }

  // Celebration overlay click should also stop alarm
  qs<HTMLElement>('#celebrate')?.addEventListener('click', () => {
    stopAllAlerts();
  });

  // Focus buttons should stop previous alarms
  qs<HTMLElement>('#focus-btn')?.addEventListener('click', () => {
    // If starting new timer while alarm looping, stop it first and clear any
    // stale TIME'S UP visuals so the next session opens clean.
    const state = getTimerState();
    if (!state.running) {
      stopAllAlerts();
      clearTimeUpState();
    }
  });

  qs<HTMLElement>('#focus-reset-btn')?.addEventListener('click', () => {
    stopAllAlerts();
    clearTimeUpState();
  });

  qs<HTMLElement>('#focus-immersive-exit-btn')?.addEventListener('click', () => {
    stopAllAlerts();
    clearTimeUpState();
  });

  // Notification click custom event
  window.addEventListener('neurofocus:notification-click', () => {
    stopAllAlerts();
    clearTimeUpState();
    switchTab('focus');
    window.focus();
  });

  // Close alarm on visibility return + user interaction
  document.addEventListener('click', () => {
    // If title is flashing and user clicked, stop flash after delay? Keep loop until explicit dismiss though
    // We only stop title flash on manual dismiss, but allow click to focus to stop flash if no loop
    const settings = getSoundSettings();
    if (!settings.loop) {
      stopTitleFlash();
    }
  });
}

// ===================================================================
// UI UPDATE FUNCTIONS
// ===================================================================

/** Label for user-defined custom durations (mission blocks carry their own label). */
const CUSTOM_TIMER_LABEL = 'Custom';
/** Allowed range for a manual duration, matching the mission planner's blocks. */
const CUSTOM_TIMER_MIN_MINUTES = 1;
const CUSTOM_TIMER_MAX_MINUTES = 180;

/** Shows/hides the manual duration row under the timer preset chips. */
function setCustomTimerRowVisible(visible: boolean): void {
  qs<HTMLElement>('#custom-timer-row')?.classList.toggle('hidden', !visible);
}

/**
 * Applies a user-entered duration to the SAME timer engine the presets use.
 * An exact preset match (25/52/90) routes through setMode so XP and labels stay
 * identical to the standard experience; anything else runs as a custom block.
 */
function applyCustomTimerMinutes(minutes: number): void {
  const presetIndex = TIMER_MODES.findIndex((mode) => mode.minutes === minutes);
  if (presetIndex !== -1) {
    setMode(presetIndex);
    setCustomTimerRowVisible(false);
  } else {
    // 1 XP per minute keeps custom sessions fair while presets stay slightly richer.
    setCustomBlock(minutes, { xp: minutes, label: CUSTOM_TIMER_LABEL });
  }
  updateFocusUI();
}

/** Reads, validates, and applies the manual custom duration input. */
function applyCustomTimerFromInput(): void {
  const input = qs<HTMLInputElement>('#custom-timer-minutes');
  if (!input) return;
  const minutes = Math.floor(Number(input.value));
  if (
    !input.value.trim() ||
    !Number.isFinite(minutes) ||
    minutes < CUSTOM_TIMER_MIN_MINUTES ||
    minutes > CUSTOM_TIMER_MAX_MINUTES
  ) {
    input.setAttribute('aria-invalid', 'true');
    input.focus();
    showCelebrate(
      'Invalid duration',
      `Enter ${CUSTOM_TIMER_MIN_MINUTES}–${CUSTOM_TIMER_MAX_MINUTES} minutes.`,
      '⚠️',
      true,
    );
    return;
  }
  input.removeAttribute('aria-invalid');
  applyCustomTimerMinutes(minutes);
}

function updateFocusUI() {
  const state = getTimerState();
  const elTimer = qs<HTMLElement>('#focus-timer');
  const elLabel = qs<HTMLElement>('#focus-mode-label');
  const elRing = qs<HTMLElement>('#focus-ring');
  const button = qs<HTMLElement>('#focus-btn');
  const ringWrap = qs<HTMLElement>('#tab-focus .timer-ring-wrap');
  const sessionState = qs<HTMLElement>('#focus-session-state');
  const xpHint = qs<HTMLElement>('#focus-xp-hint');
  if (ringWrap) ringWrap.classList.toggle('running', state.running);
  if (sessionState)
    sessionState.textContent = state.running
      ? 'In flow'
      : isPausedMidSession()
        ? 'Paused'
        : 'Ready to begin';

  // Keep the header hint truthful for presets AND custom durations.
  if (xpHint) xpHint.textContent = `+${state.xp} XP`;

  // A restored session must also restore its controls, not only the digits.
  if (button) button.textContent = state.running ? t('focus.pause') : t('focus.start');
  // Chip highlight honesty: while ANY custom block runs (user custom or mission
  // block), no preset chip may glow — the timer is not running that preset length.
  // The Custom chip lights up only for the user's own manual custom duration.
  const customActive = state.isCustom && state.modeLabel === CUSTOM_TIMER_LABEL;
  qsa<HTMLElement>('.timer-chip').forEach((chip) => {
    const isCustomChip = chip.id === 'mode-custom';
    chip.classList.toggle(
      'active',
      isCustomChip ? customActive : !state.isCustom && Number(chip.dataset.mode) === state.mode,
    );
  });
  // A custom block restored from storage must re-open its input row.
  if (customActive) setCustomTimerRowVisible(true);

  if (elTimer) {
    const m = state.minutes.toString().padStart(2, '0');
    const s = state.seconds.toString().padStart(2, '0');
    elTimer.textContent = `${m}:${s}`;
  }
  if (elLabel) {
    if (state.isCustom) {
      elLabel.textContent = state.modeLabel;
    } else {
      // Show the mode NAME (Pomodoro / Deep Work / Flow State), not the chip
      // text — "25 min" under a "25:00" timer is redundant and hides the brand.
      const modeKeys: TranslationKey[] = [
        'focus.mode_name_25',
        'focus.mode_name_52',
        'focus.mode_name_90',
      ];
      elLabel.textContent = t(modeKeys[state.mode] || 'focus.mode_name_25');
    }
  }
  if (elRing) {
    const total = state.total || TIMER_MODES[state.mode].minutes * 60;
    const offset = 691 * (1 - (state.minutes * 60 + state.seconds) / total);
    (elRing as unknown as HTMLElement).style.strokeDashoffset = String(offset);
    // Actually set attribute for SVG circle
    (elRing as unknown as SVGCircleElement).style.strokeDashoffset = `${offset}`;
  }
  updateImmersiveFocusUI(state);
}

function openImmersiveFocus(): void {
  const overlay = qs<HTMLElement>('#focus-immersive-overlay');
  if (!overlay) return;
  // Never open over stale TIME'S UP visuals (e.g. user escaped the alarm earlier).
  clearTimeUpState();
  overlay.classList.remove('hidden');
  overlay.classList.add('show');
  document.body.classList.add('immersive-open');
  isImmersiveOpen = true;

  const pauseBtn = qs<HTMLButtonElement>('#focus-immersive-pause-btn');
  pauseBtn?.focus();

  updateImmersiveFocusUI(getTimerState());
}

function closeImmersiveFocus(): void {
  const overlay = qs<HTMLElement>('#focus-immersive-overlay');
  if (!overlay) return;
  overlay.classList.remove('show');
  document.body.classList.remove('immersive-open');
  isImmersiveOpen = false;
  lastImmersiveTime = '';
  lastImmersiveRunning = false;

  const focusBtn = qs<HTMLButtonElement>('#focus-btn');
  focusBtn?.focus();

  setTimeout(() => {
    if (!overlay.classList.contains('show')) {
      overlay.classList.add('hidden');
    }
  }, 300);
}

let immersiveEls: {
  timer: HTMLElement | null;
  label: HTMLElement | null;
  mode: HTMLElement | null;
  status: HTMLElement | null;
  ring: SVGCircleElement | null;
  ringWrap: HTMLElement | null;
  elapsed: HTMLElement | null;
  xp: HTMLElement | null;
  progress: HTMLElement | null;
  pauseBtn: HTMLButtonElement | null;
} | null = null;

function getImmersiveEls() {
  if (!immersiveEls) {
    immersiveEls = {
      timer: qs<HTMLElement>('#focus-immersive-timer'),
      label: qs<HTMLElement>('#focus-immersive-label'),
      mode: qs<HTMLElement>('#focus-immersive-mode'),
      status: qs<HTMLElement>('#focus-immersive-status'),
      ring: qs<HTMLElement>('#focus-immersive-ring') as unknown as SVGCircleElement | null,
      ringWrap: qs<HTMLElement>('#focus-immersive-ring-wrap'),
      elapsed: qs<HTMLElement>('#focus-immersive-elapsed'),
      xp: qs<HTMLElement>('#focus-immersive-xp'),
      progress: qs<HTMLElement>('#focus-immersive-progress'),
      pauseBtn: qs<HTMLButtonElement>('#focus-immersive-pause-btn'),
    };
  }
  return immersiveEls;
}

function updateImmersiveFocusUI(state: TimerState): void {
  const els = getImmersiveEls();
  const total = state.total || TIMER_MODES[state.mode].minutes * 60;
  const remaining = state.minutes * 60 + state.seconds;
  const elapsed = total - remaining;
  const pct = total > 0 ? Math.round((elapsed / total) * 100) : 0;

  if (els.timer) {
    const m = state.minutes.toString().padStart(2, '0');
    const s = state.seconds.toString().padStart(2, '0');
    els.timer.textContent = `${m}:${s}`;
  }
  if (els.label) {
    if (state.isCustom) {
      els.label.textContent = state.modeLabel;
    } else {
      const modeKeys: TranslationKey[] = [
        'focus.mode_name_25',
        'focus.mode_name_52',
        'focus.mode_name_90',
      ];
      els.label.textContent = t(modeKeys[state.mode] || 'focus.mode_name_25');
    }
  }
  if (els.mode) {
    els.mode.textContent = state.modeLabel;
  }
  if (els.status) {
    els.status.textContent = state.running
      ? 'In flow'
      : remaining < total
        ? 'Paused'
        : 'Ready to begin';
    const isPaused = !state.running && remaining < total;
    if (els.status.classList.contains('paused') !== isPaused) {
      els.status.classList.toggle('paused', isPaused);
    }
  }
  if (els.ring) {
    els.ring.style.strokeDashoffset = `${691 * (1 - elapsed / total)}`;
  }
  if (els.ringWrap && els.ringWrap.classList.contains('running') !== state.running) {
    els.ringWrap.classList.toggle('running', state.running);
  }
  if (els.elapsed) {
    const em = Math.floor(elapsed / 60).toString();
    const es = (elapsed % 60).toString().padStart(2, '0');
    els.elapsed.textContent = `${em}:${es}`;
  }
  if (els.xp) {
    els.xp.textContent = `+${state.xp} XP`;
  }
  if (els.progress) {
    els.progress.textContent = `${pct}%`;
  }
  if (els.pauseBtn) {
    els.pauseBtn.textContent = state.running ? t('focus.pause') : t('focus.start');
  }
}

function trapFocusInImmersive(e: KeyboardEvent): void {
  const overlay = qs<HTMLElement>('#focus-immersive-overlay');
  if (!overlay || !overlay.classList.contains('show')) return;

  const focusables = overlay.querySelectorAll<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  );
  if (focusables.length === 0) return;

  const first = focusables[0];
  const last = focusables[focusables.length - 1];

  if (e.key === 'Tab') {
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
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
  // Dialog semantics + labelling so the modal is screen-reader friendly.
  const overlayEl = qs<HTMLElement>('#trophy-overlay');
  if (overlayEl) {
    overlayEl.setAttribute('role', 'dialog');
    overlayEl.setAttribute('aria-modal', 'true');
    const titleEl = overlayEl.querySelector<HTMLElement>('.modal-title');
    if (titleEl) {
      titleEl.id = titleEl.id || 'trophy-modal-title';
      overlayEl.setAttribute('aria-labelledby', titleEl.id);
    }
  }
  const closeBtn = qs<HTMLElement>('#trophy-close-btn');
  if (closeBtn && !closeBtn.getAttribute('aria-label')) {
    closeBtn.setAttribute('aria-label', 'Close trophy room');
  }

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
      elNext.textContent = t('rank.next_info', { name: next.name, level: next.level, needed });
    } else {
      elNext.textContent = t('rank.max_achieved');
    }
  }

  // Render badges grid
  const elBadges = qs<HTMLElement>('#trophy-badges');
  if (!elBadges) return;

  let html = `<div class="category-label">${escapeHTML(t('trophy.category_ranks'))}</div><div class="badge-grid">`;
  html += RANK_TIERS.map((tTier) => {
    const isUnlocked = unlocked.includes(`rank_${tTier.level}`);
    const progress =
      info.level >= tTier.level ? 100 : Math.max(0, (info.level / tTier.level) * 100);
    const descText = isUnlocked
      ? t('rank.level_reached', { level: tTier.level })
      : t('rank.level_to_unlock', { level: tTier.level });
    return `
      <div class="badge-item ${isUnlocked ? 'unlocked' : 'locked'}">
        <div class="badge-icon">${tTier.icon}</div>
        <div class="badge-name">${escapeHTML(tTier.name)}</div>
        <div class="badge-rarity">${tTier.rarity}</div>
        <div class="badge-desc">${escapeHTML(descText)}</div>
        ${!isUnlocked ? `<div class="progress-track" style="height:4px;margin-top:4px"><div class="progress-fill" style="width:${progress}%"></div></div>` : ''}
      </div>`;
  }).join('');
  html += `</div><div class="category-label">${escapeHTML(t('trophy.category_special'))}</div><div class="badge-grid">`;
  html += SPECIAL_BADGES.map((b) => {
    const isUnlocked = unlocked.includes(b.id);
    return `
      <div class="badge-item ${isUnlocked ? 'unlocked' : 'locked'}">
        <div class="badge-icon">${b.icon === 'neuro-mark' ? '<img src="/favicon.svg" alt="NeuroFocus" />' : escapeHTML(b.icon)}</div>
        <div class="badge-name">${escapeHTML(b.name)}</div>
        <div class="badge-rarity">${b.rarity}</div>
        <div class="badge-desc">${isUnlocked ? escapeHTML(b.desc) : escapeHTML(t('trophy.locked'))}</div>
      </div>`;
  }).join('');
  html += '</div>';

  elBadges.innerHTML = html;
}

// ===================================================================
// TIME-UP ALERT SYSTEM (Sound + Notification + Vibration + Title Flash)
// ===================================================================

function stopAllAlerts(): void {
  stopAlarmLoop();
  stopTitleFlash();
  if (navigator.vibrate) navigator.vibrate(0);
}

/**
 * Removes the TIME'S UP visuals from the immersive overlay (loop-alarm class and
 * the extra dismiss button). Must run whenever the alarm is dismissed — otherwise
 * the next session opens showing a stale "Dismiss & Celebrate" state.
 */
function clearTimeUpState(): void {
  const surface = qs<HTMLElement>('.focus-immersive-surface.timeup-active');
  surface?.classList.remove('timeup-active');
  qs<HTMLElement>('#focus-immersive-dismiss-btn')?.remove();
}

function showTimeUpImmersiveState(modeLabel: string, xp: number): void {
  const overlay = qs<HTMLElement>('#focus-immersive-overlay');
  if (!overlay) return;
  const modeEl = qs<HTMLElement>('#focus-immersive-mode');
  const statusEl = qs<HTMLElement>('#focus-immersive-status');
  const timerEl = qs<HTMLElement>('#focus-immersive-timer');
  const labelEl = qs<HTMLElement>('#focus-immersive-label');
  const pauseBtn = qs<HTMLButtonElement>('#focus-immersive-pause-btn');
  const surface = overlay.querySelector('.focus-immersive-surface');

  // If loop is enabled, keep immersive open with TIME'S UP state
  const settings = getSoundSettings();
  if (settings.loop && overlay.classList.contains('show')) {
    if (modeEl) modeEl.textContent = "🔔 TIME'S UP!";
    if (statusEl) statusEl.textContent = `You earned +${xp} XP`;
    if (timerEl) timerEl.textContent = '00:00';
    if (labelEl) labelEl.textContent = modeLabel;
    if (pauseBtn) pauseBtn.textContent = 'Dismiss & Celebrate';
    if (surface) {
      surface.classList.add('timeup-active');
    }
    // Add extra dismiss button if not present
    if (!qs<HTMLElement>('#focus-immersive-dismiss-btn')) {
      const actions = qs<HTMLElement>('.focus-immersive-actions');
      if (actions) {
        const dismiss = document.createElement('button');
        dismiss.id = 'focus-immersive-dismiss-btn';
        dismiss.className = 'btn btn-block mt-2';
        dismiss.textContent = '🔕 Stop Alarm + Close';
        dismiss.type = 'button';
        dismiss.addEventListener('click', () => {
          stopAllAlerts();
          clearTimeUpState();
          closeImmersiveFocus();
        });
        actions.appendChild(dismiss);
      }
    }
  }
}

// ===================================================================
// TIMER CALLBACKS
// ===================================================================

let lastImmersiveTime = '';
let lastImmersiveRunning = false;
let isImmersiveOpen = false;

onTick((state) => {
  const elTimer = qs<HTMLElement>('#focus-timer');
  const elRing = qs<HTMLElement>('#focus-ring') as unknown as SVGCircleElement;
  if (elTimer) {
    const m = state.minutes.toString().padStart(2, '0');
    const s = state.seconds.toString().padStart(2, '0');
    elTimer.textContent = `${m}:${s}`;
  }
  if (elRing) {
    const total = state.total || TIMER_MODES[state.mode].minutes * 60;
    const elapsed = total - (state.minutes * 60 + state.seconds);
    elRing.style.strokeDashoffset = `${691 * (1 - elapsed / total)}`;
  }
  // Only update immersive UI when overlay is open and the displayed time changed
  if (isImmersiveOpen) {
    const currentTime = `${state.minutes}:${state.seconds}`;
    const runningChanged = lastImmersiveRunning !== state.running;
    if (currentTime !== lastImmersiveTime || runningChanged) {
      lastImmersiveTime = currentTime;
      lastImmersiveRunning = state.running;
      // Don't overwrite TIME'S UP state if alarm is looping
      if (!qs<HTMLElement>('#focus-immersive-overlay .timeup-active')) {
        updateImmersiveFocusUI(state);
      }
    }
  }
});

/**
 * Completion pipeline for a finished focus session.
 * @param mode  The finished session (preset or custom block).
 * @param options.alert  Play the real-time alarm stack (sound loop, title flash,
 *                       vibration, notification). False when replaying a session
 *                       that expired while the app was closed — credit silently
 *                       instead of blaring an alarm for something finished hours ago.
 */
function handleFocusComplete(mode: TimerMode, options?: { alert?: boolean }): void {
  const alert = options?.alert !== false;

  // A running mission credits its current block off the SAME completion event.
  const mission = getActiveMission();
  if (mission && mission.status === 'active') {
    const sessions = getRecentSessions(1);
    const sessionId = sessions.length ? sessions[0].time : null;
    const result = completeCurrentBlock({ sessionId });
    if (result.completed || result.alreadyCompleted) {
      lastBlockCompletionMinutes = result.block ? result.block.completedDuration : mode.minutes;
      if (result.missionComplete) {
        // Mission done — return the Focus tab to its preset chip instead of leaving
        // the finished mission's custom block (stale label/XP hint) behind.
        setMode(getTimerState().mode);
      }
      renderMissionPlanner();
    }
  }

  if (alert) {
    // --- TIME'S UP ALERT: Sound + Vibration + Title Flash + Notification ---
    const soundSettings = getSoundSettings();
    try {
      // Start loud pop alarm loop (respects loop setting internally)
      startAlarmLoop('focusComplete', soundSettings.loop ? 2200 : 0);
      startTitleFlash("🔔 Time's Up!");
      vibrateStrong();

      // Browser notification if enabled and permission granted
      if (soundSettings.notifications) {
        showFocusCompleteNotification(mode.label, mode.xp);
      }
    } catch (e) {
      console.debug('Time-up alert error', e);
    }

    // Show celebration but silent=false so success tone plays too (we already play focusComplete louder)
    // Use silent=true to avoid double sound when our alarm is already playing
    showCelebrate('Focus Complete', 'Take a real break. No phone.', '⏱️', true, mode.xp);

    // If looping disabled, close immersive; if looping enabled, show TIME'S UP state inside it
    if (!soundSettings.loop) {
      closeImmersiveFocus();
    } else {
      showTimeUpImmersiveState(mode.label, mode.xp);
    }
  } else {
    // Silent replay: the celebration tells the user their away-session counted.
    showCelebrate(
      'Focus Complete',
      'Your session finished while you were away.',
      '⏱️',
      true,
      mode.xp,
    );
  }

  updateFocusUI();
  updateDashboard();
  checkQuests();
  renderFlowBanner();
  recordDailyStat();
  renderWeekly();
}

onComplete((mode) => handleFocusComplete(mode));

// Replay a session that completed while the app was closed (deadline passed
// before this wiring existed). Credits the mission block and shows the record —
// without this, the XP recorded but the mission stayed stuck and the user saw nothing.
const earlyCompletion = consumePendingCompletion();
if (earlyCompletion) handleFocusComplete(earlyCompletion, { alert: false });

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
  const soundSettings = getSoundSettings();
  try {
    startAlarmLoop('urgeComplete', soundSettings.loop ? 3000 : 0);
    startTitleFlash('🌊 Urge Surfed!');
    vibrateSoft();
    if (soundSettings.notifications) {
      showUrgeCompleteNotification();
    }
  } catch (e) {
    console.debug('Urge alert error', e);
  }

  showCelebrate('Urge Surfed', 'You are stronger than your impulses.', '🌊', true);
  const btn = qs<HTMLElement>('#urge-start-btn');
  if (btn) btn.textContent = t('detox.start_surf');

  if (!soundSettings.loop) {
    // auto stop after 6s if not looping
    setTimeout(() => stopAllAlerts(), 6000);
  }
});

// Replay an urge completion that fired while the app was closed.
const earlyUrgeCompletion = consumePendingUrgeCompletion();
if (earlyUrgeCompletion) {
  // Silently consumed — the timer already reset to 20:00.
  updateUrgeUI();
}

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
  // Language: restore the saved locale and translate the static UI before first paint.
  try {
    initI18n();
  } catch (e) {
    console.warn('i18n init failed', e);
  }
  try {
    resetHabitsForNewDay();
  } catch {}
  try {
    generateDailyQuests();
  } catch {}

  // Subscribe to locale changes for real-time translation updates across all tabs
  onLocaleChange(() => {
    applyTranslations();
    dailyChecksBuilt = false; // force re-render of daily checks with new translations
    updateDashboard();
    renderHabits();
    renderBacklogs();
    renderBattle();
    renderDailyChecks();
    renderXP();
    renderHero();
    renderQuests();
    renderRitual();
    renderSubjects();
    renderFlowBanner();
    renderStreak();
    renderBuddy();
    renderWeekly();
    renderTrophyPreview();
    renderProfile();
    renderQuote();
    renderFocusHistory();
    renderMissionPlanner();
    updateFocusUI();
    updateUrgeUI();
    renderAccountSettings();
    renderSettingsLanguageList();
  });

  // Fire the rank-up celebration when XP gains cross a rank threshold. Ranks are
  // every 5 levels, so only celebrate when the RANK actually changes — a plain
  // level-up inside the same rank (e.g. 6 → 7) is already shown on the progress bar.
  onLevelUp(({ from, to }) => {
    const beforeRank = getCurrentRank(from);
    const afterRank = getCurrentRank(to);
    if (afterRank.level > beforeRank.level) {
      showRankUp(afterRank);
    }
  });

  // Initial renders - each wrapped to prevent one failure breaking entire app
  const safe = (fn: () => void, label: string) => {
    try {
      fn();
    } catch (e) {
      console.error(`Render failed [${label}]`, e);
    }
  };

  // Heal any drift left by a previous session (stale counters, cloud restores,
  // imports) BEFORE the first paint, so the very first screen is truthful.
  safe(() => reconcileDailyFocus(), 'reconcileFocus');
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
  safe(() => renderMissionPlanner(), 'missionPlanner');
  safe(() => updateFocusUI(), 'focusTimer');
  safe(() => renderHero(), 'hero');
  safe(() => renderSoundSettings(), 'soundSettings');

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
  safe(() => setupStudyPickers(), 'studyPickers');
  safe(() => wireHomePremiumFocus(), 'homePremium');
  renderAccountSettings();
  renderSettingsLanguageList();
  renderSoundSettings();
  window.setInterval(() => {
    try {
      syncDailyRollover();
    } catch {}
    try {
      maybeOpenDailyClassCheck();
    } catch {}
  }, 60_000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    try {
      syncDailyRollover();
    } catch {}
    maybeOpenDailyClassCheck();
  });
  // Password recovery links from email land here with type=recovery in the URL hash.
  if (supabase) {
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        passwordRecoveryPending = true;
        markWelcomeSeen();
        setWelcomeOverlayOpen(false);
        setLanguageOverlayOpen(false);
        showLoginView('reset');
        setLoginOverlayOpen(true);
        qs<HTMLInputElement>('#new-password')?.focus();
      }
    });
  }

  // Restore a returning account without blocking offline startup.
  void restoreAuthSession().then(async (user) => {
    if (passwordRecoveryPending) {
      // User must finish setting a new password before normal app entry.
      showLoginView('reset');
      setLoginOverlayOpen(true);
      return;
    }
    if (!user) {
      bindLocalDataToUser(null);
      renderSession();
      return;
    }
    try {
      bindLocalDataToUser(user.id);
      const result = await syncOnLogin();
      if (result.kind === 'conflict') {
        await syncOnLogin(askSyncChoice());
      }
      startAutoSync();
      renderAccountSettings();
      refreshAfterCloudSync();
      renderSession();
    } catch {
      renderAccountSettings();
      renderSession();
    }
  });
  onAuthChange((user) => {
    renderAccountSettings();
    if (passwordRecoveryPending) {
      showLoginView('reset');
      setLoginOverlayOpen(true);
      return;
    }
    if (!user) {
      bindLocalDataToUser(null);
      return;
    }
    bindLocalDataToUser(user.id);
    renderSession();
    void syncOnLogin()
      .then(async (result) => {
        if (result.kind === 'conflict') {
          await syncOnLogin(askSyncChoice());
        }
        startAutoSync();
        refreshAfterCloudSync();
      })
      .catch(() => {
        showCelebrate('Sync unavailable', 'Your local progress is still safe.', '⚠️', true);
      });
  });

  // When the user returns to the tab, pull any edits made on the other device.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !currentUser()) return;
    void pullIfCloudNewer()
      .then((result) => {
        if (result.kind === 'restored' || result.kind === 'merged') refreshAfterCloudSync();
      })
      .catch(() => undefined);
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
    'position:fixed;inset:0;z-index:9999;background:#0a0f1e;color:#fff;display:flex;align-items:center;justify-content:center;padding:20px;text-align:center;font-family:sans-serif';
  el.innerHTML = `<div><h2>⚠️ Something went wrong</h2><p>Please refresh. If persists, clear site data from Settings.</p><pre style="font-size:12px;opacity:0.7;margin-top:12px;max-width:90vw;overflow:auto">${escapeHTML(String(e))}</pre><button id="nf-crash-clear-btn" type="button" style="margin-top:16px;padding:10px 20px;background:#6366f1;color:#fff;border:none;border-radius:8px;font-weight:700">Clear Data & Reload</button></div>`;
  el.querySelector<HTMLButtonElement>('#nf-crash-clear-btn')?.addEventListener('click', () => {
    localStorage.clear();
    location.reload();
  });
  document.body.appendChild(el);
}
