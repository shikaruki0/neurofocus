# BUGS.md — NeuroFocusX Deep Scan & Repair Log

This file records every bug found during the total-repair deep scan, the fix applied,
and what is left. Statuses: **NOW** (fixed in this PR), **NEXT** (planned next),
**LATER** (minor / cosmetic, tracked), **REJECT** (verified not a bug / by design).

Legend for severity: 🔴 Critical · 🟠 High · 🟡 Medium · ⚪ Low

**Second-pass scan (v2)** — entries 1.12–1.17, 3.5–3.6 and the test-suite repair at
the end of section 5 come from a follow-up exhaustive scan focused on award/revoke
symmetry, reset flows, and account-switching leaks.

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

### 1.12 🔴 Boosted backlog increment/decrement cycles farmed the multiplier remainder — `src/modules/backlogs.ts`

- **Bug:** `incrementBacklog()` credits `addXP(25)` — i.e. 25 × the current boost
  (50 during the 2x morning ritual, 37 with 1.5x flow state) — but 1.8's fix made
  `decrementBacklog()` revoke a **flat** 25 XP. Every boosted +1/-1 cycle silently
  kept the +25 (or +12) remainder; repeating it minted unlimited XP with zero work.
  The subject-XP revoke also wrote to the raw subject key, so NCERT language
  courses (`Hindi Course A/B`, `Sanskrit`, `Urdu`) were never actually revoked
  (the credit lands on the canonical `Hindi` key via `canonicalSubjectKey`).
- **Fix:** Each increment now pushes the exact credits onto a dated LIFO ledger
  (`xpLedger: { xp, sx, date }[]`). Decrement pops and revokes precisely what was
  credited (works even when the boost expired between inc and dec) and revokes
  subject XP via the canonical subject key. `backlogsToday` only moves for
  same-day entries. Legacy rows without a ledger keep the old flat-25 behavior.
  `resetBacklogProgress`/`resetAllBacklogProgress` clear now-unreachable ledgers.
- **Status:** NOW. Tests: `tests/xp-revocation.test.ts` (7 cases).

### 1.13 🔴 Deleting a completed battle task kept its XP — `src/modules/battle.ts`

- **Bug:** 1.9 fixed `deleteHabit()` to revoke today's credit, but `deleteTask()`
  just dropped the task — its `xpAwarded` stayed banked. Create → complete →
  delete → recreate minted the (+10 × boost) completion XP every cycle.
- **Fix:** `deleteTask()` revokes the task's `xpAwarded` exactly (mirrors
  `deleteHabit()`), so create/complete/delete/recreate loops net zero.
- **Status:** NOW. Tests: `tests/xp-revocation.test.ts` (3 cases).

### 1.14 🔴 Streak claim → "Reset today" → re-claim farmed XP and streak freezes — `src/main.ts`

- **Bug:** Claiming the daily streak awards +50 × boost; "Reset today's progress"
  rolled back the claim markers (`detoxLastDate`, streak counters, lastStreakDate)
  but forgot the XP. Re-checking the 7 boxes and re-claiming paid +50 again,
  forever. Worse: at every 7-day boundary each cycle also re-earned a streak
  freeze (consecutive 6 → 7 re-fires `maybeAddFreeze`).
- **Fix:** The claim handler records exactly what the claim credited in a new
  optional field `streakClaimToday = { date, xp, freezeEarned }` (default null —
  backward compatible). Reset revokes precisely that (clamped) and un-awards the
  freeze. Reset → legit re-claim restores exactly one claim's worth — net zero
  across any number of cycles.
- **Status:** NOW. Test: `tests/streak-claim-reset.test.ts`.

### 1.15 🟠 "Reset today" wiped the quest pool, letting quests pay out twice — `src/main.ts`

- **Bug:** Reset set `data.dailyQuests = null`, regenerating the pool with every
  quest un-completed. Quests whose check stayed satisfied after the reset —
  `q_habit` (habits stay toggled), `q_streak` (after a re-claim), `q_ritual`
  (re-doable) — paid their reward a second time on the next `checkQuests()`.
- **Fix:** Reset keeps today's quests with their completion state (quests are
  "once done, done" like the daily checks). Day-change regeneration is already
  handled by the rollover path.
- **Status:** NOW. Test: `tests/streak-claim-reset.test.ts`.

### 1.16 🔴 Backlog create/update → delete loops minted the +10 bonus (and today's increments) — `src/modules/backlogs.ts`

- **Bug:** `addBacklog()` awards +10 × boost per new row and per same-chapter
  merge, and `deleteBacklog()` revoked nothing. Create → increment → delete →
  recreate minted +10+25 (×boost) per cycle; re-adding the same NCERT chapter
  minted +10 per tap without even deleting.
- **Fix:** Creation/update bonuses are tracked per row (`createdXP` +
  `createdXPDate`, accumulable same-day). Deleting a row revokes **today's**
  credits exactly (creation bonus + today's ledgered increments + subject XP),
  so farm loops net zero while honestly banked history from previous days is
  never punished (mirrors the habit/task delete rules).
- **Status:** NOW. Tests: `tests/xp-revocation.test.ts` (5 cases).

### 1.17 🟡 Test suite was red at HEAD (flaky quest forcing) — `tests/quest-backlog-loophole.test.ts`

- **Bug:** `forceBacklogQuest()` injected a 1-quest pool, but `getQuests()` →
  `generateDailyQuests()` re-rolls any pool whose length ≠ 3. The forced quest
  vanished ~40% of the time and `q?.completed` read `undefined` — the
  "Full user story" test failed intermittently (red at HEAD on 2026-08-25).
- **Fix:** The harness now forces a valid 3-quest pool (incl. `q_backlog`) whose
  other quests cannot complete in-scenario — deterministic under `Math.random()`.
- **Status:** NOW (test-side repair; app behavior of "always exactly 3 quests"
  is by design and unchanged).

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

### 3.5 🟠 Account switch leaked User A's mission into User B — `src/modules/cloudSync.ts`

- **Bug:** `wipeProgressKeys()` only removed the `activeMission` storage key, not
  the mission module's **in-memory** state (`restoreMission()` runs only on the
  cached-restore branch). Switching User A → User B with no cache kept A's active
  mission running in memory and re-persisted it into B. The `mission` statement
  field was also never wiped, so B inherited A's personal mission text.
- **Fix:** `wipeProgressKeys()` now calls `clearMission()` (resets both storage
  and in-memory mission state) and resets `data.mission` to the shared
  `DEFAULT_MISSION` constant exported from `data.ts`.
- **Status:** NOW.

### 3.6 ⚪ `streakClaimToday` missing from import/cloud hygiene — `src/modules/progressImport.ts`, `src/modules/cloudSync.ts`

- **Bug:** The new claim-record field (see 1.14) was not among importable known
  fields or the account-switch wipe list.
- **Fix:** Added `streakClaimToday` to `KNOWN_FIELDS` and to `wipeProgressKeys()`.
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
- ⚪ 17 pre-existing files fail the repo-wide `npm run format:check` (untouched by
  this PR; reformatting them here would pollute a surgical diff). Tracked for a
  dedicated formatting PR. All files touched by this PR pass Prettier.
- ✅ DONE v2 — `src/modules/mission.ts` Hindi-English mixed comment
  ("backlog se reduce karo") translated to English.

### REJECT (verified — not bugs)

- `xpLevel`/`xpForLevel` use `Math.floor(need * 1.35)` — matches the spec exactly
  (100 → 135 → 182 → …). Verified by `tests/xp.test.ts` and `tests/ranks.test.ts`.
- The cloud `progressScore()` / `smartMerge()` "richer side wins" heuristics are
  intentional and heavily commented — left as-is.
- `addXP()` returning `0` and skipping persistence for a non-positive award is the
  intended guard.

---

## 6. Security audit (defense-in-depth hardening)

Full audit: auth, cloud sync, import/restore, XSS surface, CI, CSP, deployment.
Findings and fixes:

### 6.1 🟠 Cross-account data leak via `accountCache:*` in cloud uploads — `src/modules/cloudSync.ts`

- **Bug:** `bindLocalDataToUser()` caches each signed-in account's full
  progress under `accountCache:<userId>` (shared-device account switching).
  `appSnapshot()` excluded only `META_KEYS`, so every cloud upload
  (`syncOnLogin`, `syncNow`, `flushCloudSync`) included the cached progress of
  **other** accounts that had used the same device. On a shared phone/tablet,
  signing in as Account B silently uploaded Account A's private study data
  (name, backlog, mission, habits, XP) into B's `user_states` row — where B
  (or anyone restoring that row) could see it via backup export.
- **Fix:** `isExcludedSyncKey()` now also drops `accountCache:*` from the
  snapshot, and `restoreApp()` refuses to apply them from a cloud row (so an
  already-leaked row cannot re-infect the next device either).
- **Status:** NOW. Test: `tests/sync-isolation.test.ts`.

### 6.2 🟠 Cloud row was an arbitrary localStorage write primitive — `src/modules/cloudSync.ts`

- **Bug:** `restoreApp()` applied every key found in the cloud `app_data`
  (except a small meta blocklist). If RLS were misconfigured — or a future
  code path ever wrote an untrusted row — an attacker-controlled row could
  seed arbitrary `nf_*` keys on the victim's device (e.g. a forged
  `focusTimer` state, `welcomeSeen`, `lastCloudPushAt` sync bookkeeping).
- **Fix:** restores now apply only `RESTORE_ALLOWED_KEYS` — the explicit set
  of storage keys this app version knows. Unknown keys are dropped and
  `console.debug`-logged. Defense in depth on top of RLS, not a replacement.
- **Status:** NOW. Test: `tests/sync-isolation.test.ts`.

### 6.3 🟠 Raw interpolation of data-row fields into innerHTML attributes — `src/main.ts`

- **Bug:** `renderBacklogs`/`renderHabits`/`renderBattle` interpolated
  `b.id`/`h.id`/`taskItem.id` raw into `data-id="..."` inside innerHTML
  templates. Ids are normally `Date.now()` numbers, but rows can arrive from
  cloud sync or an imported backup with arbitrary shapes (import validation
  only checks the array type, not row shape). A crafted string id containing
  quotes could break out of the attribute (execution only possible if the CSP
  is ever bypassed — but the attribute-break itself was a real hygiene hole).
  Same class of issue: quest `reward` and focus-history `duration` were
  rendered un-coerced.
- **Fix:** `safeEntityId()` / `safeCount()` helpers — ids are coerced to
  non-negative integer strings (handlers already `parseInt` them, so `'0'`
  simply no-ops), counts are coerced to non-negative integers.
- **Status:** NOW.

### 6.4 🟠 "Delete ALL your progress" left the cloud row behind — `src/main.ts`, `docs/supabase-setup.md`

- **Bug:** the reset-all flow cleared local storage and reloaded, but the
  account's `user_states` row (full study history) persisted in Supabase
  forever. There was also no DELETE RLS policy in the documented schema.
- **Fix:** best-effort `user_states.delete()` for the signed-in user before
  clearing local data (never blocks the local delete), plus the documented
  `Users can delete their own state` policy.
- **Status:** NOW.

### 6.5 🟠 Deployment shipped unverified code — `.github/workflows/deploy.yml`

- **Bug:** the Pages workflow ran `npm ci && npm run build` only — no
  `typecheck`, no tests. A red test suite or a type regression would still
  deploy to production.
- **Fix:** `npm run typecheck` + `npm test` now gate the build.
- **Status:** NOW (committed on this branch as the "ci: gate deployment…"
  commit). NOTE: the GitHub App used by this session lacks the `workflows`
  permission, so that single commit could not be pushed; it is the last
  commit on the branch and pushes cleanly once permission is granted (or
  apply the 6-line change manually — snippet in the PR description).

### 6.6 🟡 Hard-coded Supabase project URL in the CSP meta tag — `index.html`, `vite.config.ts`

- **Issue:** the strict CSP meta tag embedded the exact production project
  reference (`connect-src https://zgrwthwfbjzpwngfazwc...`). Any environment
  change (project rotation, per-deploy env) would require a code change, and
  the repo permanently fingerprints the project.
- **Fix:** `__CSP_CONTENT__` placeholder replaced at build/dev time by the
  `neurofocus-csp` Vite plugin, which adds only the `VITE_SUPABASE_URL`
  **https** origin when configured (https-only, URL-sanitized; no wss — the
  app uses no Realtime channels). Local/GitHub-Pages builds ship a strict CSP
  without the extra origin. Same policy as before for the live Vercel env.
- **Status:** NOW.

### 6.7 🟡 Production source maps — `vite.config.ts`

- **Issue:** `build.sourcemap: true` shipped full original-source maps with
  the production bundle — free reconnaissance for anyone finding a client bug.
- **Fix:** `sourcemap: mode !== 'production'`.
- **Status:** NOW.

### Security: remaining risks (tracked, not code changes)

- 🟡 **RLS on `user_states` must be verified on the live project** — the
  documented schema is correct, but a live read-only probe is required
  (procedure added to `docs/supabase-setup.md`: anon-key curl must return
  `[]`, and `pg_policies` must show exactly the four `auth.uid() = user_id`
  policies). Code above is hard so the app is safe even if RLS regresses.
- ⚪ **Client-side gamification is trusted by design** — XP/levels live in
  localStorage; `smartMerge` takes `Math.max` for XP, so devtools-farmed XP
  can be merged into the cloud. Inherent to a backend-free product; a server
  authority (edge function validating session-credit rules) is the only real
  fix, and is a product decision.
- ⚪ **ESLint cannot parse the codebase** — `@typescript-eslint` v7 is
  incompatible with the project's TypeScript 7 (`ts.SyntaxKind.BarBarToken`
  crash). `npm run lint` is an intentional no-op. Re-enable once a TS7-
  compatible `@typescript-eslint` (v9+) lands; `typecheck` + tests are the
  active CI gate in the meantime.
- ⚪ **No client-side login throttle** — relies on Supabase Attack Protection
  (rate limits + optional CAPTCHA, recommended in the setup docs).
- ⚪ `public/_redirects` is Netlify-specific while deployment targets GitHub
  Pages — inert file, no action needed.

---

## Verification (all gates)

| Gate                                   | Result                                                                                                               |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                    | ✅ clean (0 errors)                                                                                                  |
| `npm test`                             | ✅ 490 tests / 40 files green (was 487/39; +3 sync-isolation tests)                                                  |
| `npm run build`                        | ✅ succeeds (PWA + SPA fallback; 0 `.map` files in `dist/`)                                                          |
| Built CSP verified                     | ✅ Vercel-env build → identical policy to previous live CSP (minus unused wss); no-env build → strict local-mode CSP |
| `npm run format:check` (files touched) | ✅ all touched files pass                                                                                            |
| `git diff --check`                     | ✅ clean                                                                                                             |
| `npm audit --omit=dev`                 | ✅ 0 vulnerabilities                                                                                                 |
