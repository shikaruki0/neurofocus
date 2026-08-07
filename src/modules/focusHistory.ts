import { data } from './data.ts';
import type { Session } from './data.ts';
import { getActiveMission, type ActiveMission } from './mission.ts';
import { MISSION_BLOCK_LABEL, TIMER_MODES, xpForSessionMinutes } from './focus.ts';
import { isValidISODate, localISODate } from '../utils/date.ts';

function sessionISODate(session: { date: string; time: number }): string {
  // `time` is authoritative and handles midnight/local timezone boundaries safely.
  if (Number.isFinite(session.time)) {
    const dt = new Date(session.time);
    if (!Number.isNaN(dt.getTime())) return localISODate(dt);
  }
  const parsed = new Date(session.date);
  return Number.isNaN(parsed.getTime()) ? '' : localISODate(parsed);
}

function emptyHistory(forDate: string): DailyFocusHistory {
  return {
    date: forDate,
    sessions: [],
    totalMinutes: 0,
    completedBlocks: 0,
    completedMissions: 0,
    xpEarned: 0,
  };
}

export interface FocusHistorySession {
  date: string;
  time: number;
  duration: number;
  missionName: string;
  subject: string;
  completionTime: string;
}

export interface DailyFocusHistory {
  date: string;
  sessions: FocusHistorySession[];
  totalMinutes: number;
  completedBlocks: number;
  completedMissions: number;
  xpEarned: number;
}

function missionForSession(mission: ActiveMission | null, sessionTime: number) {
  return mission?.blocks.find((block) => block.sessionId === sessionTime) ?? null;
}

const PRESET_LABELS = new Set(TIMER_MODES.map((mode) => mode.label));

/** Exact stored XP when present; otherwise the app's earning rule for that duration. */
function sessionXp(session: Session): number {
  if (typeof session.xp === 'number' && Number.isFinite(session.xp) && session.xp >= 0) {
    return session.xp;
  }
  return xpForSessionMinutes(session.duration);
}

/** Display name: mission titles win, then stored custom/mission labels, else generic. */
function sessionDisplayName(
  session: Session,
  block: ReturnType<typeof missionForSession>,
  mission: ActiveMission | null,
): string {
  if (block) return mission?.title || 'Mission block';
  if (session.label === MISSION_BLOCK_LABEL) return 'Mission block';
  if (session.label && !PRESET_LABELS.has(session.label)) return session.label;
  return 'Focus session';
}

/** Builds a date-scoped view without changing or deleting persisted history. */
export function getDailyFocusHistory(selectedDate: string): DailyFocusHistory {
  // Guard against invalid or malformed date inputs — never crash and never corrupt.
  if (!isValidISODate(selectedDate)) return emptyHistory(selectedDate || '');

  const mission = getActiveMission();
  const daySessions = data.sessions
    .filter((session) => sessionISODate(session) === selectedDate)
    .slice()
    .sort((a, b) => b.time - a.time);

  // Dedupe identical completion timestamps so nothing double-counts.
  const uniqueSessions = daySessions.filter(
    (session, index, all) =>
      all.findIndex((candidate) => candidate.time === session.time) === index,
  );

  const linkedBlocks = new Set<string>();
  let unlinkedMissionSessions = 0;
  let xpEarned = 0;

  const sessions = uniqueSessions.map((session) => {
    const block = missionForSession(mission, session.time);
    if (block) {
      linkedBlocks.add(block.id);
    } else if (session.label === MISSION_BLOCK_LABEL) {
      // Mission blocks stay countable even after the mission is finished/cleared,
      // thanks to the label recorded at completion time.
      unlinkedMissionSessions += 1;
    }
    xpEarned += sessionXp(session);

    return {
      date: selectedDate,
      time: session.time,
      duration: session.duration,
      missionName: sessionDisplayName(session, block, mission),
      subject: block ? mission?.subject || '' : '',
      completionTime: new Date(session.time).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };
  });

  return {
    date: selectedDate,
    sessions,
    totalMinutes: uniqueSessions.reduce((total, session) => total + session.duration, 0),
    // A normal focus session is one completed block; linked blocks are counted once.
    completedBlocks: uniqueSessions.length,
    completedMissions: linkedBlocks.size + unlinkedMissionSessions,
    xpEarned,
  };
}
