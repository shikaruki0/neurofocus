# BUGS.md — NeuroFocusX Deep Scan & Repair Log

This file records every bug found during the total-repair deep scan, the fix applied,
and what is left. Statuses: **NOW** (fixed in this PR), **NEXT** (planned next),
**LATER** (minor / cosmetic, tracked), **REJECT** (verified not a bug / by design).

Legend for severity: 🔴 Critical · 🟠 High · 🟡 Medium · ⚪ Low

---

## 1. XP / Level / Streak (the "numbers look wrong" area)

### 1.1 🔴 Morning-ritual 2x boost leaked past noon — `src/modules/xp.ts`

- **Bug:** `getMultiplier()` used `hour <= 12`, so the 2x "Morning Ritual" boost was
  active during 12:00–12:59 (noon / early afternoon), while the ritual UI
  (`isBoostActive()` in `ritual.ts`) correctly used `hour < 12`. The two disagreed,
  and the spec says "before noon".
- **Effect:** Any XP earned in the noon hour was silently doubled — inflating level and
  rank numbers and disagreeing with the on-screen "boost active" banner.
- **Fix:** `hour < 12` so the boost ends at 12:00 sharp, matching `isBoostActive()`.
- **Status:** NOW. Test: `tests/xp.test.ts`.

### 1.2 🔴 Celebration/notification showed base XP, not the boosted XP actually earned — `src/modules/focus.ts`

- **Bug:** `completeSession()` credits XP through `addXP()` (which applies the
  2x / 1.5x multiplier) and stores the credited amount on the session — but handed the
  **base** `mode.xp` to `notifyComplete()`. The celebration toast, browser notification
  and immersive "TIME'S UP" screen all displayed the base number.
- **Effect:** A 2x-boosted Pomodoro toasted "+40 XP" while the player actually earned
  +80 XP. Numbers on screen didn't match the XP actually added to the total.
- **Fix:** Pass a fresh `{ minutes, xp: credited, label }` object to the completion
  callback so every UI surface shows the credited amount.
- **Status:** NOW. Test: `tests/focus.test.ts`.

### 1.3 🟠 "N XP to next rank" showed the full level requirement, not the remaining distance — `src/main.ts`

- **Bug:** `renderHomePremium()` fed `info.need` (the _whole_ XP requirement for the
  current level) into `home.xp_to_next`, so a player with 80/100 XP was told they still
  needed "100 XP to Apprentice" when only 20 remained.
- **Fix:** Compute the true remaining distance `xpForLevel(next.level) - data.xp`
  (the same formula the Trophy Room already uses).
- **Status:** NOW. Test: `tests/xp.test.ts` (formula documented).

### 1.4 🔴 Rank-up celebration never fired — `src/modules/xp.ts` + `src/main.ts` + `src/modules/celebration.ts`

- **Bug:** `showRankUp()` and `fireConfetti()` were exported but **never called
  anywhere**. Nothing detected a level/rank change, so the rank-up modal, sound and
  confetti were dead code — the user never saw a rank-up celebration.
- **Fix:** Added `onLevelUp()` subscription to the XP module (fired inside `addXP()`
  only when the level actually rises). `main.ts` subscribes and calls `showRankUp()`
  when the **rank** tier changes (ranks are every 5 levels, so a 6→7 level-up does not
  re-open the modal).
- **Status:** NOW. Test: `tests/xp.test.ts` (`onLevelUp`).

### 1.5 🔴 Streak could reset across daylight-saving time — `src/utils/date.ts`

- **Bug:** `daysBetween()` used `Math.floor((b - a) / 86400000)`. Two local midnights
  23 hours apart (the "spring forward" Sunday) rounded **down** to 0 days, so a streak
  claimed the day after the shift was treated as "same day" and reset to 1.
- **Fix:** Normalize each local calendar date to its UTC calendar day before
  subtracting, making the result immune to DST and timezone offsets.
- **Status:** NOW. Test: `tests/date.test.ts`.

### 1.6 🔴 XP could be farmed by toggling habit / battle completion — `src/modules/habits.ts`, `src/modules/battle.ts`

- **Bug:** `toggleHabit()` awarded +15 XP every time `today` flipped `false → true`
  (and `toggleTask()` +10 every `done` flip), with **no** revocation on un-check. A
  user could tap a habit/task on-off-on repeatedly to mint unlimited XP and level up.
- **Fix:** Each habit/task now stores `xpAwarded` (the exact boost-adjusted XP
  credited). Un-checking revokes exactly that amount; re-checking re-awards it. The
  daily habit reset clears `xpAwarded` so a new day awards fresh XP. Net result: a
  full on→off→on cycle nets zero XP.
- **Status:** NOW. Tests: `tests/habit-battle-xp.test.ts`.

### 1.7 🟠 Focus badges counted minutes, but describe themselves in sessions — `src/modules/badges.ts`

- **Bug:** `First Dive` (1 session), `Flow State` (10 sessions), `Machine` (50),
  `Deep Worker` (100) checked `totalFocusMinutes >= 25/250/1250/2500`. A single
  90-minute Flow State session (270 min) unlocked the "10 focus sessions" badge after
  3 sessions — the description and the behavior disagreed.
- **Fix:** Count the recorded session log (`data.sessions.length`), which is the
  authoritative per-session record.
- **Status:** NOW. Test: `tests/badges.test.ts`.

### 1.8 🔴 Backlog increment/decrement had XP farm vulnerability — `src/modules/backlogs.ts`

- **Bug:** `incrementBacklog()` awarded +25 XP and +25 subject XP, but `decrementBacklog()`
  did not revoke any XP. Users could repeatedly increment and decrement a backlog to
  farm unlimited XP.
- **Fix:** `decrementBacklog()` now safely revokes the 25 XP and 25 subject XP.
- **Status:** NOW. Test: `tests/habit-battle-xp.test.ts`.

### 1.9 🟠 Habit deletion left phantom daily counts and awarded XP — `src/modules/habits.ts`

- **Bug:** Deleting a habit that was marked done today left `data.habitsToday` inflated
  and retained the earned XP without rollback.
- **Fix:** `deleteHabit()` decrements `data.habitsToday` and revokes `xpAwarded` when
  deleting a habit marked complete today.
- **Status:** NOW. Test: `tests/habit-battle-xp.test.ts`.

### 1.10 🟠 Streak freeze rescue window was limited to today — `src/modules/streak.ts`

- **Bug:** `canUseFreeze()` and `useFreeze()` only handled proactive freezes (`diff === 1`).
  If the user missed yesterday (`diff === 2`), they could not use a streak freeze
  to rescue their streak, and `getStreakInfo()` did not reflect lapsed streaks as 0.
- **Fix:** Supported both proactive (`diff === 1`) and retroactive (`diff === 2`) freeze
  rescues, and ensured `getStreakInfo()` accurately returns 0 consecutive streak when
  lapsed without freezes.
- **Status:** NOW. Test: `tests/streak.test.ts`.

### 1.11 🟡 Non-finite or negative XP inputs could corrupt progress — `src/modules/xp.ts`

- **Bug:** `addXP()`, `xpLevel()`, and `xpForLevel()` lacked guards against `NaN`,
  `Infinity`, or negative values.
- **Fix:** Added strict positive and finite numeric validation to all XP math helpers.
- **Status:** NOW. Test: `tests/xp.test.ts`.

---

## 2. Browser-native popups → branded in-app dialogs

### 2.1 🟠 Four native `confirm()` / `window.confirm()` dialogs — `src/main.ts`

- **Bug:** Chrome's blocking native dialogs were used for (a) import/restore
  confirmation, (b) "Reset today's progress?", (c)+(d) the double "Delete ALL your
  progress" confirmation. These look nothing like the app, block the whole page, and
  can't be themed or translated.
- **Fix:** New `src/modules/confirmDialog.ts` (+ `src/styles/confirm-dialog.css`)
  renders a premium, accessible modal (`.overlay.center` / `.modal`, focus trapped,
  Escape/backdrop cancel, message via `textContent` — no XSS) and resolves a Promise.
  All four call sites now use it; destructive actions focus **Cancel** by default.
- **Status:** NOW. Test: `tests/confirm-dialog.test.ts`; integration tests updated
  (`phantom-focus-ui.test.ts`, `auth-flow.integration.test.ts`).

---

## 3. Data / cloud-sync consistency

### 3.1 🟡 Raw `localStorage.setItem` bypassed the storage module — `src/main.ts`

- **Bug:** `renderDailyChecks`, "save name", "save mission", and "reset today" wrote
  `localStorage` directly instead of through `persist()`/`persistMany()`. This skipped
  the in-memory store and — more importantly — the debounced **cloud-push trigger** in
  `storage.set()`, so those edits could fail to sync to the signed-in account.
- **Fix:** Routed all of them through `persist()` / `persistMany()`.
- **Status:** NOW.

### 3.2 🟡 NCERT second language courses fragmented subject mastery — `src/modules/subjects.ts`

- **Bug:** NCERT language variations (`Hindi Course A`, `Hindi Course B`, `Sanskrit`,
  `Urdu`) were stored under distinct keys rather than aggregating into the standard
  `Hindi` mastery category.
- **Fix:** Added `canonicalSubjectKey` mapping NCERT language courses to `Hindi`.
- **Status:** NOW. Test: `tests/feature-modules.test.ts`.

### 3.3 🟡 Cloud smart merge missed subject XP max-merge — `src/modules/cloudSync.ts`

- **Bug:** `smartMerge()` replaced the entire `subjects` object instead of doing a
  per-subject maximum merge, potentially losing mastery XP earned across devices.
- **Fix:** Deep max-merged `subjects` dictionary in `smartMerge()`, and added missing
  fields (`lastStreakDate`, `detoxLastDate`, `streakFreezes`, `dailyChecks`, `morningRitual`,
  `buddyName`, `'Political Science'`) in `wipeProgressKeys()`.
- **Status:** NOW.

### 3.4 ⚪ Missing known fields in progress import — `src/modules/progressImport.ts`

- **Bug:** `soundSettings` and `activeMission` were omitted from `KNOWN_FIELDS`.
- **Fix:** Added `soundSettings` and `activeMission` to `KNOWN_FIELDS`.
- **Status:** NOW.

---

## 4. Dependencies

- **`npm audit --omit=dev` → 0 vulnerabilities.** ✅
- `npm audit` (all) reports 5 dev-only findings (1 moderate, 4 high) from the
  `eslint@8` toolchain (and its transitive `glob`). These do not ship to users.
  **Status:** LATER — leave unless the toolchain is upgraded separately.

---

## 5. What's left (tracked, not shipped in this PR)

### NEXT

- _(none currently — the high/medium XP, streak, sync, and popup issues are closed.)_

### LATER (minor / cosmetic — documented so they aren't forgotten)

- ⚪ `src/modules/xp.ts` — `addXP(amount, _reason)` ignores `_reason`; harmless but
  dead parameter.
- ⚪ `src/modules/habits.ts` — `dailyChecks.dc7` is set on completion but never unset
  on undo (deliberately kept: daily checks are "once done, done").

### REJECT (verified — not bugs)

- `xpLevel`/`xpForLevel` use `Math.floor(need * 1.35)` — matches the spec exactly
  (100 → 135 → 182 → …). Verified by `tests/xp.test.ts` and `tests/ranks.test.ts`.
- The cloud `progressScore()` / `smartMerge()` "richer side wins" heuristics are
  intentional and heavily commented — left as-is.
- `addXP()` returning `0` and skipping persistence for a non-positive award is the
  intended guard.

---

## Verification (all gates)

| Gate                                   | Result                                      |
| -------------------------------------- | ------------------------------------------- |
| `npm run typecheck`                    | ✅ clean (0 errors)                         |
| `npm test`                             | ✅ 464 tests / 36 files green               |
| `npm run build`                        | ✅ succeeds (PWA + SPA fallback)            |
| `npm run format:check` (files touched) | ✅ pass                                     |
| `git diff --check`                     | ✅ clean                                    |
| `npm audit --omit=dev`                 | ✅ 0 vulnerabilities                        |
| `npm run dev` smoke test               | ✅ HTTP 200, app loads, no transform errors |
