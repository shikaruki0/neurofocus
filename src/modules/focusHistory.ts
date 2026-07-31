import { data } from './data.ts';
import { getActiveMission, type ActiveMission } from './mission.ts';
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
    xpEarned: null,
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
  xpEarned: number | null;
}

function missionForSession(mission: ActiveMission | null, sessionTime: number) {
  return mission?.blocks.find((block) => block.sessionId === sessionTime) ?? null;
}

/** Builds a date-scoped view without changing or deleting persisted history. */
export function getDailyFocusHistory(selectedDate: string): DailyFocusHistory {
  // Guard against invalid or malformed date inputs — never crash and never corrupt.
  if (!isValidISODate(selectedDate)) return emptyHistory(selectedDate || '');

  const mission = getActiveMission();
  const sessions = data.sessions
    .filter((session) => sessionISODate(session) === selectedDate)
    .slice()
    .sort((a, b) => b.time - a.time)
    .map((session) => {
      const block = missionForSession(mission, session.time);
      const completion = new Date(session.time).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      return {
        date: selectedDate,
        time: session.time,
        duration: session.duration,
        missionName: block ? mission?.title || 'Mission block' : 'Focus session',
        subject: block ? mission?.subject || '' : '',
        completionTime: completion,
      };
    });

  const uniqueSessions = sessions.filter(
    (session, index, all) =>
      all.findIndex((candidate) => candidate.time === session.time) === index,
  );
  const linkedBlocks = new Set(
    uniqueSessions
      .map((session) => missionForSession(mission, session.time)?.id)
      .filter((id): id is string => Boolean(id)),
  );

  return {
    date: selectedDate,
    sessions: uniqueSessions,
    totalMinutes: uniqueSessions.reduce((total, session) => total + session.duration, 0),
    // A normal focus session is one completed block; linked blocks are counted once.
    completedBlocks: uniqueSessions.length,
    completedMissions: linkedBlocks.size,
    // Existing storage only keeps aggregate XP, not XP per session/date.
    xpEarned: null,
  };
}
