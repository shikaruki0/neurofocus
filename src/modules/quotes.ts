/**
 * Daily Quotes — Motivational quotes that refresh once per day.
 * Stored in storage to persist the same quote throughout the day.
 */

import { set as storageSet, get as storageGet } from './storage.ts';
import { todayStr } from '../utils/date.ts';

export const QUOTES = [
  'Discipline is choosing between what you want now and what you want most.',
  'Small daily improvements create stunning results over time.',
  'Your future is built by what you do today, not tomorrow.',
  'Focus is a muscle. The more you train it, the stronger it becomes.',
  'The expert in anything was once a beginner.',
  "Don't watch the clock. Do what it does. Keep going.",
  'One day, or day one. You decide.',
  'Consistency beats intensity. Every single time.',
  'Your brain is plastic. You are literally rewiring yourself with every session.',
  'Success is the sum of small efforts, repeated day in and day out.',
  'What you do today can improve all your tomorrows.',
  'Deep work is the superpower of the 21st century.',
  'Strive for progress, not perfection.',
  'The pain of discipline is far less than the pain of regret.',
  'Every distraction you avoid is a deposit in your future.',
  "You don't have to be great to start, but you have to start to be great.",
  'Learning is not attained by chance, it must be sought for with ardor.',
  "The only bad workout is the one that didn't happen.",
  'Invest in your mind. It pays the best interest.',
  'Your only limit is the one you set yourself.',
] as const;

/**
 * Gets today's quote (generating and storing if needed).
 * @returns Today's quote
 */
export function getDailyQuote(): string {
  const today = todayStr();
  const savedDate = storageGet<string>('quoteDate', '');
  const savedText = storageGet<string>('quoteText', '');

  if (savedDate === today && savedText) {
    return savedText;
  }

  const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  storageSet('quoteDate', today);
  storageSet('quoteText', quote);
  return quote;
}

/**
 * Forces a new random quote (for "refresh" button).
 * @returns New quote
 */
export function refreshQuote(): string {
  const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  storageSet('quoteDate', todayStr());
  storageSet('quoteText', quote);
  return quote;
}
