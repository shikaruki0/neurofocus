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
import './styles/animations.css';
import './styles/onboarding.css';

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
import {
  addBacklog,
  incrementBacklog,
  deleteBacklog,
  getBacklogs,
  getBacklogsGroupedBySubject,
  getPendingChapterCount,
} from './modules/backlogs.ts';
import type { BacklogInput } from './modules/backlogs.ts';
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
import { todayStr, currentDOW, DAY_LABELS } from './utils/date.ts';
import { validateProfileName, validateMission } from './utils/validation.ts';

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
    elBadge.textContent = next
      ? t('rank.next_at', { name: next.name, level: next.level })
      : t('rank.max_rank');
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
    <div class="ritual-step ${r.steps[i] ? 'done' : ''}" data-idx="${i}">
      <div class="ritual-circle">${RITUAL_ICONS[i]}</div>
      <div class="ritual-label">${escapeHTML(stepLabel)}</div>
    </div>`;
  }).join('');

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

  if (elNum) elNum.textContent = String(info.consecutive);
  if (elFreeze) elFreeze.textContent = t('home.freezes_count', { count: info.freezes });

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
      <div class="check-row" id="row-${item.id}">
        <input type="checkbox" id="chk-${item.id}">
        <label>${escapeHTML(itemLabel)}</label>
      </div>`;
    }).join('');

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
                        <button class="btn btn-success btn-sm" data-action="inc-backlog" data-id="${b.id}">+1</button>
                        <button class="btn btn-danger btn-sm" data-action="del-backlog" data-id="${b.id}">×</button>
                      </div>
                    </div>`;
                })
                .join('')}`,
            )
            .join('')}
        </div>`;
      })
      .join('')}`;

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

function renderFocusHistory() {
  const el = qs<HTMLElement>('#focus-history');
  if (!el) return;

  const sessions = getRecentSessions(10);
  if (!sessions.length) {
    el.innerHTML = `<div class="empty" style="padding:12px">${escapeHTML(t('focus.no_sessions'))}</div>`;
    return;
  }

  el.innerHTML = sessions
    .map((s) => {
      const d = new Date(s.time);
      const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const sessionTitle = t('focus.deep_work_session', { min: s.duration });
      return `
        <div class="list-item">
          <div class="info">
            <div class="title">${escapeHTML(sessionTitle)}</div>
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
    const inc = data.backlogs
      .filter((b) => (b.done || 0) < (b.total || 0))
      .sort((a, b) => (b.total || 0) - (b.done || 0) - ((a.total || 0) - (a.done || 0)));
    const ht = data.habits.filter((h) => !h.today);
    let html = '';

    if (inc.length > 0 && inc[0]) {
      const remaining = (inc[0].total || 0) - (inc[0].done || 0);
      const remainingText = t('backlog.lectures_remaining', { count: remaining });
      const urgentTag = t('backlog.urgent');
      const priorityTitle = inc[0].chapterName || inc[0].name;
      const priorityMeta = [inc[0].subjectLabel || inc[0].subject, inc[0].bookName, remainingText]
        .filter(Boolean)
        .join(' · ');
      html += `<div class="list-item"><div class="info"><div class="title backlog-chapter-title">${escapeHTML(priorityTitle)}</div><div class="meta">${escapeHTML(priorityMeta)}</div></div><span class="tag tag-red">${escapeHTML(urgentTag)}</span></div>`;
    }
    if (ht.length > 0 && ht[0]) {
      const anchorText = t('plan.after_anchor', {
        anchor: escapeHTML(ht[0].anchor || 'waking up'),
      });
      const nextTag = t('plan.next_tag');
      html += `<div class="list-item"><div class="info"><div class="title">${escapeHTML(ht[0].name)}</div><div class="meta">${anchorText}</div></div><span class="tag tag-blue">${escapeHTML(nextTag)}</span></div>`;
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
    setLoginHeader('auth.kicker', 'auth.title', 'auth.subtitle');
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
  qs<HTMLElement>('#auth-tab-signin')?.addEventListener('click', () => setAuthMode('signin'));
  qs<HTMLElement>('#auth-tab-signup')?.addEventListener('click', () => setAuthMode('signup'));

  qs<HTMLButtonElement>('#toggle-login-password')?.addEventListener('click', (event) => {
    const toggle = event.currentTarget as HTMLButtonElement;
    const passwordInput = qs<HTMLInputElement>('#login-password');
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
        showCelebrate('Welcome', `Ready when you are, ${data.profileName}.`, '🧠');
        maybeOpenPostLoginSetup();
      });
    } else {
      showCelebrate('Welcome', `Ready when you are, ${data.profileName}.`, '🧠');
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
      btn.textContent = t('focus.pause');
    } else {
      startTimer();
      btn.textContent = t('focus.start');
    }
  });

  // Focus reset
  qs<HTMLElement>('#focus-reset-btn')?.addEventListener('click', () => {
    stopTimer();
    const btn = qs<HTMLElement>('#focus-btn');
    if (btn) btn.textContent = t('focus.start');
    updateFocusUI();
  });

  // Urge timer
  qs<HTMLElement>('#urge-start-btn')?.addEventListener('click', () => {
    startUrge();
    const btn = qs<HTMLElement>('#urge-start-btn');
    if (btn) btn.textContent = t('detox.surfing');
  });

  qs<HTMLElement>('#urge-reset-btn')?.addEventListener('click', () => {
    resetUrge();
    const btn = qs<HTMLElement>('#urge-start-btn');
    if (btn) btn.textContent = t('detox.start_surf');
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
  if (button) button.textContent = state.running ? t('focus.pause') : t('focus.start');
  qsa<HTMLElement>('.timer-chip').forEach((chip) => {
    chip.classList.toggle('active', Number(chip.dataset.mode) === state.mode);
  });

  if (elTimer) {
    const m = state.minutes.toString().padStart(2, '0');
    const s = state.seconds.toString().padStart(2, '0');
    elTimer.textContent = `${m}:${s}`;
  }
  if (elLabel) {
    const modeKeys: TranslationKey[] = ['focus.mode_25', 'focus.mode_52', 'focus.mode_90'];
    elLabel.textContent = t(modeKeys[state.mode] || 'focus.mode_25');
  }
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
        <div class="badge-icon">${b.icon}</div>
        <div class="badge-name">${escapeHTML(b.name)}</div>
        <div class="badge-rarity">${b.rarity}</div>
        <div class="badge-desc">${isUnlocked ? escapeHTML(b.desc) : escapeHTML(t('trophy.locked'))}</div>
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
  if (btn) btn.textContent = t('focus.start');
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
  if (btn) btn.textContent = t('detox.start_surf');
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
    updateFocusUI();
    updateUrgeUI();
    renderAccountSettings();
    renderSettingsLanguageList();
  });

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
  renderSettingsLanguageList();
  window.setInterval(() => {
    try {
      maybeOpenDailyClassCheck();
    } catch {}
  }, 60_000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) maybeOpenDailyClassCheck();
  });
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
