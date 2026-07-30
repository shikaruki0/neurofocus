import { describe, it, expect, beforeEach } from 'vitest';
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
  restoreMission,
  isMissionComplete,
} from '../src/modules/mission.ts';
import { buildMissionSetup } from '../src/modules/missionPlanner.ts';
import { clearAll, get } from '../src/modules/storage.ts';

/** Builds a 60/25 → [25, 25, 10] mission setup for tests. */
function setup60_25() {
  return buildMissionSetup({
    title: 'Complete Ray Optics lecture',
    subject: 'Physics',
    backlogId: 7,
    totalMinutes: 60,
    blockMinutes: 25,
  })!;
}

describe('Mission runtime — accounting layer (no timer, no XP)', () => {
  beforeEach(() => {
    clearMission();
    clearAll();
  });

  // 1. Mission start
  it('starts a mission with the first block active and the rest pending', () => {
    const mission = startMission(setup60_25());
    expect(mission.title).toBe('Complete Ray Optics lecture');
    expect(mission.backlogId).toBe(7);
    expect(mission.totalDuration).toBe(60);
    expect(mission.blockDuration).toBe(25);
    expect(mission.completedDuration).toBe(0);
    expect(mission.status).toBe('active');
    expect(mission.blocks.map((b) => b.plannedDuration)).toEqual([25, 25, 10]);
    expect(mission.blocks[0].status).toBe('active');
    expect(mission.blocks[1].status).toBe('pending');
    expect(mission.blocks[2].status).toBe('pending');
  });

  // 2. Current block display
  it('reports the current block and 1-based number', () => {
    startMission(setup60_25());
    expect(getCurrentBlockNumber()).toBe(1);
    expect(getCurrentBlock()?.plannedDuration).toBe(25);
  });

  // 4. Block completion
  it('completes the current block, credits minutes, and advances to next pending', () => {
    startMission(setup60_25());
    const result = completeCurrentBlock({ sessionId: 111 });
    expect(result.completed).toBe(true);
    expect(result.alreadyCompleted).toBe(false);
    expect(result.block?.status).toBe('completed');
    expect(result.block?.completedDuration).toBe(25);
    expect(result.block?.sessionId).toBe(111);
    expect(result.missionComplete).toBe(false);
    expect(result.nextBlock?.plannedDuration).toBe(25);

    const mission = getActiveMission()!;
    expect(mission.completedDuration).toBe(25);
    // Next block stays PENDING (not auto-started).
    expect(mission.blocks[1].status).toBe('pending');
    expect(getCurrentBlockNumber()).toBe(2);
  });

  // 5 & 6. Next block does not auto-start / start next block manually
  it('does not auto-start the next block, but startNextBlock activates it', () => {
    startMission(setup60_25());
    completeCurrentBlock();
    expect(getActiveMission()!.blocks[1].status).toBe('pending');

    const next = startNextBlock();
    expect(next?.status).toBe('active');
    expect(getActiveMission()!.blocks[1].status).toBe('active');
    expect(getCurrentBlockNumber()).toBe(2);
  });

  // 9. Duplicate block completion protection
  it('protects against completing the same block twice', () => {
    startMission(setup60_25());
    completeCurrentBlock({ minutes: 25 });
    const mission = getActiveMission()!;
    // Point back at the already-completed block 1 and try to complete it again.
    mission.currentBlock = 0;
    const second = completeCurrentBlock({ minutes: 25 });
    expect(second.completed).toBe(false);
    expect(second.alreadyCompleted).toBe(true);
    // completedDuration must not double-count.
    expect(getActiveMission()!.completedDuration).toBe(25);
  });

  // 10. Duplicate XP protection (accounting side): a completed block cannot re-credit.
  it('never re-credits a completed block (XP duplication guard)', () => {
    startMission(setup60_25());
    completeCurrentBlock();
    const before = getActiveMission()!.completedDuration;
    // Re-invoking on an already-completed current block is a no-op for accounting.
    const mission = getActiveMission()!;
    mission.currentBlock = 0; // force point back at the completed block
    const again = completeCurrentBlock();
    expect(again.alreadyCompleted).toBe(true);
    expect(getActiveMission()!.completedDuration).toBe(before);
  });

  it('marks mission complete after the final block', () => {
    startMission(setup60_25());
    completeCurrentBlock(); // block 1
    startNextBlock();
    completeCurrentBlock(); // block 2
    startNextBlock();
    const last = completeCurrentBlock(); // block 3 (10 min)
    expect(last.missionComplete).toBe(true);
    expect(last.block?.completedDuration).toBe(10);
    expect(isMissionComplete()).toBe(true);
    expect(getActiveMission()!.status).toBe('completed');
    expect(getActiveMission()!.completedDuration).toBe(60);
  });

  // 7. End mission early
  it('ends a mission early, preserving completed and unfinished blocks', () => {
    startMission(setup60_25());
    completeCurrentBlock(); // block 1 done
    const mission = endMission();
    expect(mission?.status).toBe('paused');
    // Completed block preserved.
    expect(getActiveMission()!.blocks[0].status).toBe('completed');
    expect(getActiveMission()!.blocks[0].completedDuration).toBe(25);
    // Unfinished blocks preserved (not deleted).
    expect(getActiveMission()!.blocks[1].status).toBe('pending');
    expect(getActiveMission()!.blocks[2].status).toBe('pending');
    // Completed minutes preserved.
    expect(getActiveMission()!.completedDuration).toBe(25);
  });

  it('can cancel a mission while preserving history', () => {
    startMission(setup60_25());
    completeCurrentBlock();
    const mission = endMission({ cancel: true });
    expect(mission?.status).toBe('cancelled');
    expect(getActiveMission()!.completedDuration).toBe(25);
  });

  it('resumes a paused mission and re-activates the current pending block', () => {
    startMission(setup60_25());
    completeCurrentBlock();
    endMission();
    const resumed = resumeMission();
    expect(resumed?.status).toBe('active');
    expect(getActiveMission()!.blocks[1].status).toBe('active');
    expect(getCurrentBlockNumber()).toBe(2);
  });

  // 8. Mission refresh restore
  it('persists and restores the mission across a reload', () => {
    startMission(setup60_25());
    completeCurrentBlock({ sessionId: 42 });
    // Simulate reload: forget the in-memory mission then restore from storage.
    const restored = restoreMission();
    expect(restored).not.toBeNull();
    expect(restored!.title).toBe('Complete Ray Optics lecture');
    expect(restored!.completedDuration).toBe(25);
    expect(restored!.blocks[0].status).toBe('completed');
    expect(restored!.blocks[0].sessionId).toBe(42);
    expect(restored!.blocks[1].status).toBe('pending');
    // Restored active block is the next pending one.
    expect(getCurrentBlockNumber()).toBe(2);
  });

  it('restored completed blocks cannot be re-completed (no duplicate progress after refresh)', () => {
    startMission(setup60_25());
    completeCurrentBlock();
    restoreMission();
    // Point the current block back at the already-completed block 1.
    const mission = getActiveMission()!;
    mission.currentBlock = 0;
    const dup = completeCurrentBlock();
    expect(dup.alreadyCompleted).toBe(true);
    expect(getActiveMission()!.completedDuration).toBe(25);
  });

  it('clearMission removes persisted state', () => {
    startMission(setup60_25());
    expect(get('activeMission', null)).not.toBeNull();
    clearMission();
    expect(get('activeMission', null)).toBeNull();
    expect(getActiveMission()).toBeNull();
  });
});
