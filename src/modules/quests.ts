/**
 * Daily Quests — Generates and tracks 3 daily quests.
 * Quests reset each day and award XP on completion.
 */

import { data, persist } from './data.ts';
import { getTodayFocusMinutes, getTodayFocusSessionCount } from './focusDaily.ts';
import { todayStr } from '../utils/date.ts';
import { addXP } from './xp.ts';

interface QuestDefinition {
  id: string;
  type: string;
  label: string;
  target: number;
  reward: number;
  check: () => boolean;
}

interface Quest {
  id: string;
  label: string;
  reward: number;
  completed: boolean;
}

interface DailyQuests {
  date: string;
  quests: Quest[];
}

const QUEST_POOL: QuestDefinition[] = [
  {
    id: 'q_focus',
    type: 'focus',
    label: 'Complete 1 focus session',
    target: 1,
    reward: 20,
    // Must be backed by a real recorded session today — not a leftover counter.
    check: () => getTodayFocusSessionCount() >= 1 || getTodayFocusMinutes() >= 25,
  },
  {
    id: 'q_backlog',
    type: 'backlog',
    label: 'Clear 2 backlog lectures',
    target: 2,
    reward: 25,
    // Counts lectures cleared TODAY (backlogsToday), not the lifetime total.
    // Summing `done` over all backlogs made this a permanent free 25 XP once the
    // user had ever cleared 2 lectures — it even lit up right after a single
    // 25-min focus block of a longer mission.
    check: () => (data.backlogsToday || 0) >= 2,
  },
  {
    id: 'q_streak',
    type: 'streak',
    label: 'Claim daily streak',
    target: 1,
    reward: 15,
    check: () => data.detoxLastDate === todayStr(),
  },
  {
    id: 'q_habit',
    type: 'habit',
    label: 'Complete 2 habits',
    target: 2,
    reward: 20,
    check: () => data.habits.filter((h) => h.today).length >= 2,
  },
  {
    id: 'q_ritual',
    type: 'ritual',
    label: 'Complete morning ritual',
    target: 1,
    reward: 30,
    check: () => data.morningRitual.completed && data.morningRitual.date === todayStr(),
  },
];

/**
 * Generates 3 random daily quests for today.
 */
export function generateDailyQuests(): void {
  if (
    data.dailyQuests &&
    data.dailyQuests.date === todayStr() &&
    Array.isArray(data.dailyQuests.quests) &&
    data.dailyQuests.quests.length === 3
  ) {
    return;
  }

  const pool = [...QUEST_POOL].sort(() => Math.random() - 0.5);
  const selected = pool.slice(0, 3);

  data.dailyQuests = {
    date: todayStr(),
    quests: selected.map((q) => ({
      id: q.id,
      label: q.label,
      reward: q.reward,
      completed: false,
    })),
  };
  persist('dailyQuests');
}

/**
 * Checks all incomplete quests and awards XP for newly completed ones.
 * @returns Newly completed quests
 */
export function checkQuests(): Quest[] {
  if (!data.dailyQuests || data.dailyQuests.date !== todayStr()) return [];

  const completed: Quest[] = [];
  for (const quest of data.dailyQuests.quests) {
    if (quest.completed) continue;
    const poolQ = QUEST_POOL.find((p) => p.id === quest.id);
    if (poolQ && poolQ.check()) {
      quest.completed = true;
      completed.push(quest);
      addXP(quest.reward, `Quest: ${quest.label}`);
    }
  }

  if (completed.length > 0) {
    persist('dailyQuests');
  }
  return completed;
}

/**
 * Gets today's quests (generating if needed).
 * @returns Today's quests
 */
export function getQuests(): Quest[] {
  generateDailyQuests();
  return data.dailyQuests?.quests ?? [];
}

export { QUEST_POOL };
