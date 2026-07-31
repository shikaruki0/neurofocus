/**
 * Mission Runtime — Active mission state that rides on top of the EXISTING focus timer.
 *
 * Design contract (Milestone 2):
 *   - This module NEVER starts a timer, NEVER counts down seconds, and NEVER awards XP.
 *     The focus timer (focus.ts) remains the single source of truth for countdown, focus
 *     minutes, focus sessions and XP. This module only tracks *mission* progress
 *     (which block, how many blocks done, how many minutes accounted for).
 *   - It is a thin, persisted accounting layer so a mission survives reloads and so
 *     completed blocks can never be completed — or rewarded — twice.
 *
 * The planning layer (missionPlanner.ts) decides *what* the mission is (blocks, durations).
 * This runtime layer tracks *progress through* that plan.
 */

import { get, remove, set } from './storage.ts';
import type { MissionSetup } from './missionPlanner.ts';
import { incrementBacklog } from './backlogs.ts';

export type MissionStatus = 'active' | 'paused' | 'completed' | 'cancelled';
export type BlockStatus = 'pending' | 'active' | 'completed';

export interface RuntimeBlock {
  /** Stable block id (unique within a mission). */
  id: string;
  /** Planned focus minutes for this block (from the plan). */
  plannedDuration: number;
  /** Actual minutes credited when the block was completed (0 until done). */
  completedDuration: number;
  status: BlockStatus;
  /** Focus session this block was linked to (session.time), null until completed. */
  sessionId: number | null;
  /** Timestamp the block was completed, null until done. */
  completedAt: number | null;
}

export interface ActiveMission {
  id: string;
  title: string;
  /** Optional backlog this mission draws from. Never auto-completed by the mission. */
  backlogId: number | null;
  /** Whether the backlog was already incremented for this mission. */
  backlogUpdated?: boolean;
  subject: string;
  /** Total planned minutes across all blocks. */
  totalDuration: number;
  /** Minutes accounted for by completed blocks. */
  completedDuration: number;
  /** Planned per-block length chosen at setup. */
  blockDuration: number;
  blocks: RuntimeBlock[];
  /** Index into `blocks` of the block the user is currently working (or about to work). */
  currentBlock: number;
  status: MissionStatus;
  createdAt: number;
  updatedAt: number;
}

export interface BlockCompletionResult {
  /** True only when a pending/active block transitioned to completed on THIS call. */
  completed: boolean;
  /** True when the current block was already completed (duplicate protection). */
  alreadyCompleted: boolean;
  /** The block that was completed (or already completed), if any. */
  block: RuntimeBlock | null;
  /** The next pending block, if one exists (never auto-started). */
  nextBlock: RuntimeBlock | null;
  /** True when the mission has no more pending blocks. */
  missionComplete: boolean;
}

const STORAGE_KEY = 'activeMission';
const SCHEMA_VERSION = 1;

interface PersistedMission {
  version: number;
  mission: ActiveMission;
}

let active: ActiveMission | null = null;
let idCounter = 0;

function uid(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

function touch(mission: ActiveMission): void {
  mission.updatedAt = Date.now();
}

function save(): void {
  if (!active) {
    remove(STORAGE_KEY);
    return;
  }
  set(STORAGE_KEY, { version: SCHEMA_VERSION, mission: active } satisfies PersistedMission);
}

/** Recomputes accounted minutes from completed blocks (never drifts). */
function recomputeCompletedDuration(mission: ActiveMission): void {
  mission.completedDuration = mission.blocks
    .filter((b) => b.status === 'completed')
    .reduce((sum, b) => sum + (b.completedDuration || 0), 0);
}

function isRuntimeBlock(value: unknown): value is RuntimeBlock {
  if (!value || typeof value !== 'object') return false;
  const b = value as Record<string, unknown>;
  return (
    typeof b.id === 'string' &&
    typeof b.plannedDuration === 'number' &&
    typeof b.completedDuration === 'number' &&
    (b.status === 'pending' || b.status === 'active' || b.status === 'completed')
  );
}

function isActiveMission(value: unknown): value is ActiveMission {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.id === 'string' &&
    typeof m.title === 'string' &&
    Array.isArray(m.blocks) &&
    m.blocks.every(isRuntimeBlock) &&
    typeof m.currentBlock === 'number' &&
    (m.status === 'active' ||
      m.status === 'paused' ||
      m.status === 'completed' ||
      m.status === 'cancelled')
  );
}

/** Loads any persisted mission. Safe to call repeatedly (idempotent). */
export function restoreMission(): ActiveMission | null {
  const saved = get<Partial<PersistedMission> | null>(STORAGE_KEY, null);
  if (!saved || saved.version !== SCHEMA_VERSION || !isActiveMission(saved.mission)) {
    active = null;
    return null;
  }
  active = saved.mission;
  // Defensive: keep the accounted total honest against the persisted blocks.
  recomputeCompletedDuration(active);
  return active;
}

/** Returns the current in-memory mission (does not touch storage). */
export function getActiveMission(): ActiveMission | null {
  return active;
}

/** The block the user is currently on, if the mission is running. */
export function getCurrentBlock(): RuntimeBlock | null {
  if (!active) return null;
  return active.blocks[active.currentBlock] ?? null;
}

/** 1-based number of the current block for display ("Block 1 of 3"). */
export function getCurrentBlockNumber(): number {
  if (!active) return 0;
  return active.currentBlock + 1;
}

/**
 * Creates a runtime mission from a validated planning setup and persists it.
 * The first block is marked active; no timer is started here.
 */
export function startMission(setup: MissionSetup): ActiveMission {
  const now = Date.now();
  const blocks: RuntimeBlock[] = setup.blocks.map((b, i) => ({
    id: uid(`block${i + 1}`),
    plannedDuration: b.minutes,
    completedDuration: 0,
    status: i === 0 ? 'active' : 'pending',
    sessionId: null,
    completedAt: null,
  }));

  active = {
    id: uid('mission'),
    title: setup.title,
    backlogId: setup.backlogId,
    subject: setup.subject,
    totalDuration: setup.totalMinutes,
    completedDuration: 0,
    blockDuration: setup.blockMinutes,
    blocks,
    currentBlock: 0,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
  save();
  return active;
}

/**
 * Marks the current block complete exactly once.
 *
 * Duplicate protection: if the current block is already completed this is a no-op
 * (returns alreadyCompleted). This is what prevents the same block awarding progress
 * — and, because XP is owned by the focus timer, the same XP — twice.
 *
 * @param options.sessionId  The focus session (session.time) this block finished with.
 * @param options.minutes    Actual minutes to credit; defaults to the planned duration.
 */
export function completeCurrentBlock(options?: {
  sessionId?: number | null;
  minutes?: number;
}): BlockCompletionResult {
  const empty: BlockCompletionResult = {
    completed: false,
    alreadyCompleted: false,
    block: null,
    nextBlock: null,
    missionComplete: false,
  };
  if (!active) return empty;

  const block = active.blocks[active.currentBlock];
  if (!block) return { ...empty, missionComplete: true };

  if (block.status === 'completed') {
    // Already done — do not re-credit minutes or advance. Duplicate protection.
    const next = active.blocks.find((b) => b.status === 'pending') ?? null;
    return {
      completed: false,
      alreadyCompleted: true,
      block,
      nextBlock: next,
      missionComplete: active.blocks.every((b) => b.status === 'completed'),
    };
  }

  block.status = 'completed';
  block.completedDuration =
    typeof options?.minutes === 'number' && options.minutes >= 0
      ? Math.floor(options.minutes)
      : block.plannedDuration;
  block.sessionId = options?.sessionId ?? null;
  block.completedAt = Date.now();
  recomputeCompletedDuration(active);

  // Point currentBlock at the next pending block (kept pending — never auto-started).
  const nextIndex = active.blocks.findIndex((b) => b.status === 'pending');
  const missionComplete = nextIndex === -1;
  if (missionComplete) {
    active.status = 'completed';
    // Exactly one lecture backlog se reduce karo (Milestone 3)
    if (active.backlogId && !active.backlogUpdated) {
      incrementBacklog(active.backlogId);
      active.backlogUpdated = true;
    }
    // Leave currentBlock on the last block for display purposes.
  } else {
    active.currentBlock = nextIndex;
  }

  touch(active);
  save();

  return {
    completed: true,
    alreadyCompleted: false,
    block,
    nextBlock: missionComplete ? null : (active.blocks[nextIndex] ?? null),
    missionComplete,
  };
}

/**
 * Explicitly activates the next pending block (manual "Start next block").
 * Does not start any timer. Returns the newly active block, or null if none.
 */
export function startNextBlock(): RuntimeBlock | null {
  if (!active) return null;
  const nextIndex = active.blocks.findIndex((b) => b.status === 'pending');
  if (nextIndex === -1) return null;
  active.currentBlock = nextIndex;
  active.blocks[nextIndex].status = 'active';
  if (active.status === 'paused') active.status = 'active';
  touch(active);
  save();
  return active.blocks[nextIndex];
}

/**
 * Ends the mission early while preserving all block history.
 * Completed blocks stay completed, unfinished blocks stay as-is; nothing is deleted
 * and no backlog is touched. Default status is 'paused' so the user can resume later;
 * pass { cancel: true } to mark it 'cancelled'.
 */
export function endMission(options?: { cancel?: boolean }): ActiveMission | null {
  if (!active) return null;
  active.status = options?.cancel ? 'cancelled' : 'paused';
  // Any block that was mid-flight drops back to pending so it can be resumed cleanly.
  const current = active.blocks[active.currentBlock];
  if (current && current.status === 'active') current.status = 'pending';
  touch(active);
  save();
  return active;
}

/** Resumes a paused mission, re-activating the current pending block. */
export function resumeMission(): ActiveMission | null {
  if (!active) return null;
  if (active.status === 'completed') return active;
  active.status = 'active';
  const pendingIndex = active.blocks.findIndex((b) => b.status === 'pending');
  if (pendingIndex !== -1) {
    active.currentBlock = pendingIndex;
    active.blocks[pendingIndex].status = 'active';
  }
  touch(active);
  save();
  return active;
}

/** Fully removes the mission (used by "Change"). Timer state is untouched. */
export function clearMission(): void {
  active = null;
  remove(STORAGE_KEY);
}

/** True when every block is completed. */
export function isMissionComplete(): boolean {
  return (
    !!active && active.blocks.length > 0 && active.blocks.every((b) => b.status === 'completed')
  );
}

// Restore on module load so a mission survives a page refresh, mirroring focus.ts.
restoreMission();
