/**
 * Daily Quests — Generates and tracks 3 daily quests.
 * Quests reset each day and award XP on completion.
 */

import { data, persist } from './data.js';
import { todayStr } from '../utils/date.js';
import { addXP } from './xp.js';

const QUEST_POOL = [
  {
    id: 'q_focus',
    type: 'focus',
    label: 'Complete 1 focus session',
    target: 1,
    reward: 20,
    check: () => data.focusMinutes >= 25,
  },
  {
    id: 'q_backlog',
    type: 'backlog',
    label: 'Clear 2 backlog lectures',
    target: 2,
    reward: 25,
    check: () => totalBacklogsDone() >= 2,
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

function totalBacklogsDone() {
  return data.backlogs.reduce((sum, b) => sum + (b.done || 0), 0);
}

/**
 * Generates 3 random daily quests for today.
 */
export function generateDailyQuests() {
  if (data.dailyQuests && data.dailyQuests.date === todayStr()) return;

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
 * @returns {object[]} Newly completed quests
 */
export function checkQuests() {
  if (!data.dailyQuests || data.dailyQuests.date !== todayStr()) return [];

  const completed = [];
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
 * @returns {object[]}
 */
export function getQuests() {
  generateDailyQuests();
  return data.dailyQuests.quests;
}

export { QUEST_POOL };
