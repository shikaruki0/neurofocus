import { describe, it, expect, beforeEach } from 'vitest';
import {
  recommendMission,
  calculateBlocks,
  buildMissionSetup,
} from '../src/modules/missionPlanner.ts';
import { validateMissionSetup } from '../src/utils/validation.ts';
import { escapeHTML } from '../src/utils/sanitize.ts';
import type { Backlog } from '../src/modules/backlogs.ts';

/**
 * Helper: creates a minimal Backlog-compatible object for testing.
 * Only fields required by the planner are set; optional fields are omitted
 * to verify the planner tolerates sparse data (backward compatibility).
 */
function makeBacklog(overrides: Partial<Backlog> & { id: number }): Backlog {
  return {
    name: overrides.name ?? `Topic ${overrides.id}`,
    total: overrides.total ?? 10,
    done: overrides.done ?? 0,
    subject: overrides.subject ?? 'Physics',
    ...overrides,
  } as Backlog;
}

// ===================================================================
// RECOMMENDATION LOGIC
// ===================================================================

describe('Mission Planner — recommendMission', () => {
  let backlogs: Backlog[];

  beforeEach(() => {
    backlogs = [];
  });

  // 1. Empty backlog
  it('returns empty recommendation when backlog is empty', () => {
    const rec = recommendMission([]);
    expect(rec.reason).toBe('empty');
    expect(rec.backlog).toBeNull();
    expect(rec.quickWin).toBeNull();
    expect(rec.reasonLabel).toMatch(/no backlog/i);
  });

  it('returns empty recommendation when all backlogs are completed', () => {
    backlogs = [
      makeBacklog({ id: 1, total: 5, done: 5 }),
      makeBacklog({ id: 2, total: 3, done: 3 }),
    ];
    const rec = recommendMission(backlogs);
    expect(rec.reason).toBe('empty');
    expect(rec.backlog).toBeNull();
  });

  // 2. Recommended backlog item — pending lectures (highest remaining)
  it('recommends backlog item with most pending lectures', () => {
    backlogs = [
      makeBacklog({ id: 1, total: 5, done: 2, subject: 'Physics' }), // 3 remaining
      makeBacklog({ id: 2, total: 20, done: 2, subject: 'Chemistry' }), // 18 remaining
      makeBacklog({ id: 3, total: 10, done: 5, subject: 'Math' }), // 5 remaining
    ];
    const rec = recommendMission(backlogs);
    expect(rec.reason).toBe('pending-lectures');
    expect(rec.backlog?.id).toBe(2);
    expect(rec.reasonLabel).toMatch(/18 lectures pending/);
  });

  it('recommends subject-matching item when selectedSubject is provided', () => {
    backlogs = [
      makeBacklog({ id: 1, total: 20, done: 2, subject: 'Chemistry' }), // 18 remaining
      makeBacklog({ id: 2, total: 10, done: 3, subject: 'Math' }), // 7 remaining
    ];
    const rec = recommendMission(backlogs, 'Math');
    expect(rec.reason).toBe('selected-subject');
    expect(rec.backlog?.id).toBe(2);
    expect(rec.reasonLabel).toMatch(/Math/);
  });

  it('falls back to pending-lectures when selectedSubject has no matches', () => {
    backlogs = [
      makeBacklog({ id: 1, total: 10, done: 2, subject: 'Physics' }),
      makeBacklog({ id: 2, total: 20, done: 5, subject: 'Chemistry' }),
    ];
    const rec = recommendMission(backlogs, 'Biology');
    expect(rec.reason).toBe('pending-lectures');
    expect(rec.backlog?.id).toBe(2);
  });

  // 3. Oldest backlog tie-break
  it('uses oldest (smallest id) as tie-break when remaining is equal', () => {
    backlogs = [
      makeBacklog({ id: 200, total: 10, done: 5, subject: 'Physics' }),
      makeBacklog({ id: 100, total: 10, done: 5, subject: 'Physics' }),
    ];
    const rec = recommendMission(backlogs);
    expect(rec.backlog?.id).toBe(100);
  });

  // 4. Quick-win (smallest remaining) as alternative
  it('surfaces quick-win alternative when different from recommended', () => {
    backlogs = [
      makeBacklog({ id: 1, total: 20, done: 2, subject: 'Physics' }), // 18 remaining — recommended
      makeBacklog({ id: 2, total: 3, done: 1, subject: 'Math' }), // 2 remaining — quick win
    ];
    const rec = recommendMission(backlogs);
    expect(rec.backlog?.id).toBe(1);
    expect(rec.quickWin?.id).toBe(2);
  });

  it('does not surface quick-win if it is the same as recommended', () => {
    backlogs = [makeBacklog({ id: 1, total: 5, done: 2, subject: 'Physics' })];
    const rec = recommendMission(backlogs);
    expect(rec.backlog?.id).toBe(1);
    expect(rec.quickWin).toBeNull();
  });

  // Existing backlog tests (backward compatibility)
  it('handles sparse backlog objects without optional fields', () => {
    const sparse: Backlog = {
      id: 1,
      name: 'Old Topic',
      total: 8,
      done: 3,
      subject: 'Physics',
    };
    const rec = recommendMission([sparse]);
    expect(rec.backlog?.id).toBe(1);
    expect(rec.reason).toBe('pending-lectures');
  });
});

// ===================================================================
// BLOCK CALCULATION
// ===================================================================

describe('Mission Planner — calculateBlocks', () => {
  // 6. 60 minutes / 25 minutes → [25, 25, 10]
  it('60 min / 25 min block → [25, 25, 10]', () => {
    const blocks = calculateBlocks(60, 25);
    expect(blocks).toHaveLength(3);
    expect(blocks.map((b) => b.minutes)).toEqual([25, 25, 10]);
    expect(blocks[0].index).toBe(1);
    expect(blocks[2].index).toBe(3);
    expect(blocks[2].cumulative).toBe(60);
  });

  // 7. 60 minutes / 52 minutes → [52, 8]
  it('60 min / 52 min block → [52, 8]', () => {
    const blocks = calculateBlocks(60, 52);
    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => b.minutes)).toEqual([52, 8]);
    expect(blocks[1].cumulative).toBe(60);
  });

  // 8. 60 minutes / 90 minutes → [60]
  it('60 min / 90 min block → [60] (last block = remaining)', () => {
    const blocks = calculateBlocks(60, 90);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].minutes).toBe(60);
    expect(blocks[0].cumulative).toBe(60);
  });

  it('exact multiple: 50 min / 25 min → [25, 25]', () => {
    const blocks = calculateBlocks(50, 25);
    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => b.minutes)).toEqual([25, 25]);
  });

  it('single block when total equals block size', () => {
    const blocks = calculateBlocks(25, 25);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].minutes).toBe(25);
  });

  it('1 minute total with 25 min block → [1]', () => {
    const blocks = calculateBlocks(1, 25);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].minutes).toBe(1);
  });

  // Validation edge cases
  it('returns empty array for zero total', () => {
    expect(calculateBlocks(0, 25)).toEqual([]);
  });

  it('returns empty array for negative total', () => {
    expect(calculateBlocks(-10, 25)).toEqual([]);
  });

  it('returns empty array for zero block', () => {
    expect(calculateBlocks(60, 0)).toEqual([]);
  });

  it('returns empty array for negative block', () => {
    expect(calculateBlocks(60, -5)).toEqual([]);
  });

  it('returns empty array for NaN inputs', () => {
    expect(calculateBlocks(NaN, 25)).toEqual([]);
    expect(calculateBlocks(60, NaN)).toEqual([]);
  });

  it('floors non-integer inputs', () => {
    const blocks = calculateBlocks(60.7, 25.3);
    expect(blocks.map((b) => b.minutes)).toEqual([25, 25, 10]);
  });

  it('cumulative values are correct across all blocks', () => {
    const blocks = calculateBlocks(100, 30);
    // 30, 30, 30, 10
    expect(blocks[0].cumulative).toBe(30);
    expect(blocks[1].cumulative).toBe(60);
    expect(blocks[2].cumulative).toBe(90);
    expect(blocks[3].cumulative).toBe(100);
  });
});

// ===================================================================
// MISSION SETUP VALIDATION
// ===================================================================

describe('Mission Planner — validateMissionSetup', () => {
  // 4. Mission title validation
  it('accepts valid mission setup', () => {
    const result = validateMissionSetup({
      title: 'Finish Kinematics',
      totalMinutes: 60,
      blockMinutes: 25,
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.title).toBe('Finish Kinematics');
      expect(result.data.totalMinutes).toBe(60);
      expect(result.data.blockMinutes).toBe(25);
    }
  });

  it('rejects empty title', () => {
    const result = validateMissionSetup({ title: '', totalMinutes: 60, blockMinutes: 25 });
    expect(result.valid).toBe(false);
  });

  it('rejects whitespace-only title', () => {
    const result = validateMissionSetup({ title: '   ', totalMinutes: 60, blockMinutes: 25 });
    expect(result.valid).toBe(false);
  });

  it('rejects title too long', () => {
    const result = validateMissionSetup({
      title: 'A'.repeat(101),
      totalMinutes: 60,
      blockMinutes: 25,
    });
    expect(result.valid).toBe(false);
  });

  it('accepts title at max length (100)', () => {
    const result = validateMissionSetup({
      title: 'A'.repeat(100),
      totalMinutes: 60,
      blockMinutes: 25,
    });
    expect(result.valid).toBe(true);
  });

  it('trims title whitespace', () => {
    const result = validateMissionSetup({
      title: '  Study Physics  ',
      totalMinutes: 60,
      blockMinutes: 25,
    });
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.data.title).toBe('Study Physics');
  });

  // 5. Duration validation
  it('rejects zero total duration', () => {
    const result = validateMissionSetup({ title: 'Test', totalMinutes: 0, blockMinutes: 25 });
    expect(result.valid).toBe(false);
  });

  it('rejects negative total duration', () => {
    const result = validateMissionSetup({ title: 'Test', totalMinutes: -5, blockMinutes: 25 });
    expect(result.valid).toBe(false);
  });

  it('rejects excessively large total duration', () => {
    const result = validateMissionSetup({ title: 'Test', totalMinutes: 721, blockMinutes: 25 });
    expect(result.valid).toBe(false);
  });

  it('accepts max total duration (720)', () => {
    const result = validateMissionSetup({ title: 'Test', totalMinutes: 720, blockMinutes: 25 });
    expect(result.valid).toBe(true);
  });

  it('rejects zero block duration', () => {
    const result = validateMissionSetup({ title: 'Test', totalMinutes: 60, blockMinutes: 0 });
    expect(result.valid).toBe(false);
  });

  it('rejects negative block duration', () => {
    const result = validateMissionSetup({ title: 'Test', totalMinutes: 60, blockMinutes: -10 });
    expect(result.valid).toBe(false);
  });

  it('rejects excessively large block duration', () => {
    const result = validateMissionSetup({ title: 'Test', totalMinutes: 60, blockMinutes: 181 });
    expect(result.valid).toBe(false);
  });

  it('rejects non-integer total duration', () => {
    const result = validateMissionSetup({ title: 'Test', totalMinutes: 60.5, blockMinutes: 25 });
    expect(result.valid).toBe(false);
  });

  it('rejects non-integer block duration', () => {
    const result = validateMissionSetup({ title: 'Test', totalMinutes: 60, blockMinutes: 25.5 });
    expect(result.valid).toBe(false);
  });

  it('rejects NaN total', () => {
    const result = validateMissionSetup({ title: 'Test', totalMinutes: 'abc', blockMinutes: 25 });
    expect(result.valid).toBe(false);
  });

  it('accepts string numbers that parse to valid integers', () => {
    const result = validateMissionSetup({ title: 'Test', totalMinutes: '60', blockMinutes: '25' });
    expect(result.valid).toBe(true);
  });
});

// ===================================================================
// BUILD MISSION SETUP
// ===================================================================

describe('Mission Planner — buildMissionSetup', () => {
  it('builds a valid mission with blocks', () => {
    const mission = buildMissionSetup({
      title: 'Study Physics',
      subject: 'Physics',
      backlogId: 123,
      totalMinutes: 60,
      blockMinutes: 25,
    });
    expect(mission).not.toBeNull();
    expect(mission!.title).toBe('Study Physics');
    expect(mission!.subject).toBe('Physics');
    expect(mission!.backlogId).toBe(123);
    expect(mission!.blocks).toHaveLength(3);
    expect(mission!.blocks.map((b) => b.minutes)).toEqual([25, 25, 10]);
  });

  it('returns null for invalid inputs (zero total)', () => {
    const mission = buildMissionSetup({
      title: 'Test',
      subject: 'Physics',
      backlogId: null,
      totalMinutes: 0,
      blockMinutes: 25,
    });
    expect(mission).toBeNull();
  });

  it('handles null backlogId for manual missions', () => {
    const mission = buildMissionSetup({
      title: 'Manual revision',
      subject: 'Other',
      backlogId: null,
      totalMinutes: 30,
      blockMinutes: 25,
    });
    expect(mission).not.toBeNull();
    expect(mission!.backlogId).toBeNull();
  });
});

// ===================================================================
// 9. UNSAFE MISSION TEXT (XSS)
// ===================================================================

describe('Mission Planner — unsafe text handling', () => {
  it('escapes script tags in mission title via escapeHTML', () => {
    const raw = '<script>alert("xss")</script>';
    const escaped = escapeHTML(raw);
    expect(escaped).not.toContain('<script>');
    expect(escaped).toContain('&lt;script&gt;');
  });

  it('escapes HTML entities in backlog chapter names', () => {
    const raw = '<img src=x onerror=alert(1)>';
    const escaped = escapeHTML(raw);
    expect(escaped).not.toContain('<img');
    expect(escaped).toContain('&lt;img');
  });

  it('escapes ampersands and quotes in subject names', () => {
    expect(escapeHTML('Physics & Chemistry')).toBe('Physics &amp; Chemistry');
    expect(escapeHTML('say "hello"')).toBe('say &quot;hello&quot;');
  });

  it('validateMissionSetup accepts titles with HTML-like content but render escapes them', () => {
    const result = validateMissionSetup({
      title: '<b>Bold</b> study session',
      totalMinutes: 60,
      blockMinutes: 25,
    });
    expect(result.valid).toBe(true);
    // The title is accepted as-is (trimmed) — the UI must escape it on render
    if (result.valid) {
      const escaped = escapeHTML(result.data.title);
      expect(escaped).not.toContain('<b>');
      expect(escaped).toContain('&lt;b&gt;');
    }
  });

  it('handles null and undefined safely in escapeHTML', () => {
    expect(escapeHTML(null)).toBe('');
    expect(escapeHTML(undefined)).toBe('');
  });
});

// ===================================================================
// 3. MANUAL MISSION
// ===================================================================

describe('Mission Planner — manual mission flow', () => {
  it('allows building a mission with no linked backlog', () => {
    const mission = buildMissionSetup({
      title: 'Free revision',
      subject: 'Math',
      backlogId: null,
      totalMinutes: 45,
      blockMinutes: 25,
    });
    expect(mission).not.toBeNull();
    expect(mission!.backlogId).toBeNull();
    expect(mission!.blocks).toHaveLength(2); // 25 + 20
    expect(mission!.blocks.map((b) => b.minutes)).toEqual([25, 20]);
  });

  it('recommendation returns empty for manual mission prompt when backlog is clear', () => {
    const rec = recommendMission([]);
    expect(rec.reason).toBe('empty');
    expect(rec.reasonLabel).toMatch(/manual mission/i);
  });
});

// ===================================================================
// 10 & 11. Existing focus and backlog tests are in separate files
// This section verifies the planner does not interfere with them.
// ===================================================================

describe('Mission Planner — isolation from existing systems', () => {
  it('recommendMission does not mutate the input array', () => {
    const original = [
      makeBacklog({ id: 1, total: 10, done: 3 }),
      makeBacklog({ id: 2, total: 5, done: 1 }),
    ];
    const copy = JSON.parse(JSON.stringify(original));
    recommendMission(original);
    expect(original).toEqual(copy);
  });

  it('calculateBlocks does not depend on any global state', () => {
    // Pure function — same inputs always produce same outputs
    const a = calculateBlocks(60, 25);
    const b = calculateBlocks(60, 25);
    expect(a).toEqual(b);
  });
});
