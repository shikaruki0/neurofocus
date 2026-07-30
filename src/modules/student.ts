/**
 * Student setup and daily class check-in.
 *
 * This module stores the beginner-friendly academic profile and enforces the
 * anti-disturbance rule: after 9 PM, the class check-in can appear only once per
 * local day (completed or skipped both count as handled for that day).
 */

import { data, persistMany, persist } from './data.ts';
import { todayStr, currentHour } from '../utils/date.ts';
import { validateProfileName } from '../utils/validation.ts';

export type SecondLanguageChoice = 'hindi-a' | 'hindi-b' | 'sanskrit' | 'urdu' | 'other' | 'none';

export interface StudentProfile {
  name: string;
  country: string;
  classLevel: number;
  board: 'NCERT' | 'Other';
  medium: 'English' | 'Hindi' | 'Other';
  secondLanguage: SecondLanguageChoice;
  attendsCoaching: boolean;
  syllabusPackId: 'india-ncert-class-10' | 'manual';
  createdAt: number;
  updatedAt: number;
}

export interface StudentProfileInput {
  name: string;
  country: string;
  classLevel: number;
  medium: StudentProfile['medium'];
  secondLanguage: SecondLanguageChoice;
  attendsCoaching: boolean;
}

export interface StudentProfileResult {
  success: boolean;
  profile?: StudentProfile;
  error?: string;
}

export type DailyClassCheckStatus = 'complete' | 'skipped';

export interface DailyClassCheck {
  date: string;
  status: DailyClassCheckStatus;
  totalHeld: number;
  attended: number;
  missed: number;
  assignedBacklog: number;
  handledAt: number;
}

export interface DailyAttendanceResult {
  success: boolean;
  totalHeld?: number;
  attended?: number;
  missed?: number;
  error?: string;
}

export const SECOND_LANGUAGE_OPTIONS: { value: SecondLanguageChoice; label: string }[] = [
  { value: 'hindi-a', label: 'Hindi Course A' },
  { value: 'hindi-b', label: 'Hindi Course B' },
  { value: 'sanskrit', label: 'Sanskrit' },
  { value: 'urdu', label: 'Urdu' },
  { value: 'other', label: 'Other / Not listed' },
  { value: 'none', label: 'No second language' },
];

export function getStudentProfile(): StudentProfile | null {
  return data.studentProfile;
}

export function isAcademicSetupComplete(): boolean {
  return Boolean(data.studentProfile);
}

export function isIndiaClass10(): boolean {
  const profile = data.studentProfile;
  if (!profile) return false;
  return profile.country.trim().toLowerCase() === 'india' && Number(profile.classLevel) === 10;
}

export function isNcertClass10Enabled(): boolean {
  return isIndiaClass10() && data.studentProfile?.syllabusPackId === 'india-ncert-class-10';
}

export function hasCompletedInitialBacklogSetup(): boolean {
  return data.initialBacklogSetupComplete === true;
}

export function saveStudentProfile(input: StudentProfileInput): StudentProfileResult {
  const nameValidation = validateProfileName(input.name);
  if (!nameValidation.valid) return { success: false, error: nameValidation.error };

  const country = String(input.country || '').trim();
  if (!country) return { success: false, error: 'Enter your country' };
  if (country.length > 60) return { success: false, error: 'Country name too long' };

  const classLevel = Number(input.classLevel);
  if (!Number.isInteger(classLevel) || classLevel < 1 || classLevel > 12) {
    return { success: false, error: 'Choose a valid class from 1 to 12' };
  }

  const medium: StudentProfile['medium'] = ['English', 'Hindi', 'Other'].includes(input.medium)
    ? input.medium
    : 'English';
  const secondLanguage = SECOND_LANGUAGE_OPTIONS.some(
    (option) => option.value === input.secondLanguage,
  )
    ? input.secondLanguage
    : 'other';
  const isNcertClass10 = country.toLowerCase() === 'india' && classLevel === 10;
  const now = Date.now();
  const existingCreatedAt = data.studentProfile?.createdAt || now;

  const profile: StudentProfile = {
    name: nameValidation.data,
    country,
    classLevel,
    board: isNcertClass10 ? 'NCERT' : 'Other',
    medium,
    secondLanguage,
    attendsCoaching: Boolean(input.attendsCoaching),
    syllabusPackId: isNcertClass10 ? 'india-ncert-class-10' : 'manual',
    createdAt: existingCreatedAt,
    updatedAt: now,
  };

  data.profileName = profile.name;
  data.studentProfile = profile;
  if (!isNcertClass10) {
    data.initialBacklogSetupComplete = true;
  }
  persistMany(['profileName', 'studentProfile', 'initialBacklogSetupComplete']);
  return { success: true, profile };
}

export function completeInitialBacklogSetup(): void {
  data.initialBacklogSetupComplete = true;
  persist('initialBacklogSetupComplete');
}

export function shouldAskDailyClassCheck(hour = currentHour(), date = todayStr()): boolean {
  if (!isAcademicSetupComplete()) return false;
  if (hour < 21) return false;
  const handled = data.dailyClassCheck;
  return !(handled && handled.date === date);
}

export function validateDailyAttendance(
  totalInput: number,
  attendedInput: number,
): DailyAttendanceResult {
  const totalHeld = Number(totalInput);
  const attended = Number(attendedInput);
  if (!Number.isInteger(totalHeld) || totalHeld < 0 || totalHeld > 20) {
    return { success: false, error: 'Enter total classes from 0 to 20' };
  }
  if (!Number.isInteger(attended) || attended < 0 || attended > 20) {
    return { success: false, error: 'Enter attended classes from 0 to 20' };
  }
  if (attended > totalHeld) {
    return { success: false, error: 'Attended classes cannot be more than total classes' };
  }
  return { success: true, totalHeld, attended, missed: totalHeld - attended };
}

export function completeDailyClassCheck(input: {
  totalHeld: number;
  attended: number;
  missed: number;
  assignedBacklog: number;
}): void {
  data.dailyClassCheck = {
    date: todayStr(),
    status: 'complete',
    totalHeld: input.totalHeld,
    attended: input.attended,
    missed: input.missed,
    assignedBacklog: input.assignedBacklog,
    handledAt: Date.now(),
  };
  persist('dailyClassCheck');
}

export function skipDailyClassCheck(): void {
  data.dailyClassCheck = {
    date: todayStr(),
    status: 'skipped',
    totalHeld: 0,
    attended: 0,
    missed: 0,
    assignedBacklog: 0,
    handledAt: Date.now(),
  };
  persist('dailyClassCheck');
}
