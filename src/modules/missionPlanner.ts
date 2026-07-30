/**
 * Mission Planner — Recommendation & block calculation (planning layer only).
 *
 * This module does NOT start timers, award XP, or mutate backlog state.
 * It is a pure decision layer consumed by the Focus tab UI.
 */

import type { Backlog } from './backlogs.ts';

export interface MissionRecommendation {
  backlog: Backlog | null;
  reason: MissionReason;
  /** Human-readable reason for the recommendation. */
  reasonLabel: string;
  /** Quick-win alternative (smallest remaining) if different from recommended. */
  quickWin: Backlog | null;
}

export type MissionReason =
  | 'pending-lectures'
  | 'selected-subject'
  | 'oldest'
  | 'quick-win'
  | 'empty';

export interface MissionBlock {
  index: number;
  minutes: number;
  /** Total minutes up to and including this block. */
  cumulative: number;
}

export interface MissionSetup {
  title: string;
  subject: string;
  backlogId: number | null;
  totalMinutes: number;
  blockMinutes: number;
  blocks: MissionBlock[];
}

/** Hard caps for mission setup validation. */
export const MISSION_LIMITS = {
  TITLE_MAX: 100,
  MIN_TOTAL: 1,
  MAX_TOTAL: 720, // 12 hours — generous but bounded
  MIN_BLOCK: 1,
  MAX_BLOCK: 180, // 3 hours — beyond ultradian rhythm
} as const;

function remaining(backlog: Backlog): number {
  return Math.max(0, (backlog.total || 0) - (backlog.done || 0));
}

/**
 * Returns pending backlogs (remaining > 0), oldest-first by id.
 */
function pendingBacklogs(backlogs: Backlog[]): Backlog[] {
  return backlogs
    .filter((b) => remaining(b) > 0)
    .slice()
    .sort((a, b) => (a.id || 0) - (b.id || 0));
}

/**
 * Deterministic recommendation for the next mission.
 *
 * Priority:
 *   1. Pending lectures — highest remaining wins (backlog pressure).
 *   2. If selectedSubject matches any pending item, prefer that subject's top item.
 *   3. Otherwise fall back to the oldest pending item (smallest id).
 *   4. Separately surface a quick-win (smallest remaining) as an alternative.
 *   5. If no pending backlogs, return an "empty" recommendation for manual mission.
 */
export function recommendMission(
  backlogs: Backlog[],
  selectedSubject?: string,
): MissionRecommendation {
  const pending = pendingBacklogs(backlogs);

  if (!pending.length) {
    return {
      backlog: null,
      reason: 'empty',
      reasonLabel: 'No backlog items — create a manual mission',
      quickWin: null,
    };
  }

  // Highest remaining lectures first; tie-break oldest.
  const byPressure = pending
    .slice()
    .sort((a, b) => remaining(b) - remaining(a) || (a.id || 0) - (b.id || 0));

  const subjectMatch = selectedSubject
    ? pending
        .filter(
          (b) =>
            (b.subject || '') === selectedSubject ||
            (b.subjectLabel || '') === selectedSubject,
        )
        .sort((a, b) => remaining(b) - remaining(a) || (a.id || 0) - (b.id || 0))
    : [];

  let recommended: Backlog;
  let reason: MissionReason;
  let reasonLabel: string;

  if (subjectMatch.length) {
    recommended = subjectMatch[0];
    reason = 'selected-subject';
    reasonLabel = `Priority pick for ${recommended.subjectLabel || recommended.subject}`;
  } else {
    recommended = byPressure[0];
    reason = 'pending-lectures';
    reasonLabel = `${remaining(recommended)} lectures pending — highest pressure`;
  }

  // Quick-win: smallest remaining that is not the recommended one.
  const byQuick = pending
    .slice()
    .sort((a, b) => remaining(a) - remaining(b) || (a.id || 0) - (b.id || 0));
  const quickWin =
    byQuick[0] && byQuick[0].id !== recommended.id ? byQuick[0] : null;

  return { backlog: recommended, reason, reasonLabel, quickWin };
}

/**
 * Calculates focus blocks from a total duration and block size.
 *
 * Examples (per spec):
 *   - 60 / 25 → [25, 25, 10]
 *   - 60 / 52 → [52, 8]
 *   - 60 / 90 → [60]
 *
 * The final block is always the actual remaining minutes, never overshoots.
 */
export function calculateBlocks(totalMinutes: number, blockMinutes: number): MissionBlock[] {
  if (
    !Number.isFinite(totalMinutes) ||
    !Number.isFinite(blockMinutes) ||
    totalMinutes <= 0 ||
    blockMinutes <= 0
  ) {
    return [];
  }

  const total = Math.floor(totalMinutes);
  const block = Math.floor(blockMinutes);
  const blocks: MissionBlock[] = [];
  let remainingMin = total;
  let index = 1;
  let cumulative = 0;

  while (remainingMin > 0) {
    const current = Math.min(block, remainingMin);
    cumulative += current;
    blocks.push({ index, minutes: current, cumulative });
    remainingMin -= current;
    index += 1;
  }

  return blocks;
}

/**
 * Builds a full mission setup from user inputs, computing blocks deterministically.
 * Returns null if inputs are invalid (caller should use validateMissionSetup first).
 */
export function buildMissionSetup(input: {
  title: string;
  subject: string;
  backlogId: number | null;
  totalMinutes: number;
  blockMinutes: number;
}): MissionSetup | null {
  const blocks = calculateBlocks(input.totalMinutes, input.blockMinutes);
  if (!blocks.length) return null;
  return {
    title: input.title.trim(),
    subject: input.subject || 'Other',
    backlogId: input.backlogId,
    totalMinutes: Math.floor(input.totalMinutes),
    blockMinutes: Math.floor(input.blockMinutes),
    blocks,
  };
}
