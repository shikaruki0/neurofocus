import { beforeEach, describe, expect, it, vi } from 'vitest';
import { data } from '../src/modules/data.ts';
import { clearAll } from '../src/modules/storage.ts';
import { addBacklog, getBacklogs } from '../src/modules/backlogs.ts';
import {
  getChaptersForProfile,
  getSubjectOptionsForProfile,
  findNcertChapter,
} from '../src/modules/ncert.ts';
import {
  completeDailyClassCheck,
  completeInitialBacklogSetup,
  isNcertClass10Enabled,
  saveStudentProfile,
  shouldAskDailyClassCheck,
  skipDailyClassCheck,
  validateDailyAttendance,
} from '../src/modules/student.ts';

function reset(): void {
  clearAll();
  data.profileName = 'Warrior';
  data.studentProfile = null;
  data.initialBacklogSetupComplete = false;
  data.dailyClassCheck = null;
  data.backlogs = [];
  data.xp = 0;
}

beforeEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  reset();
});

describe('India Class 10 NCERT setup', () => {
  it('loads strict NCERT Class 10 subjects when country is India and class is 10', () => {
    const result = saveStudentProfile({
      name: 'Rahul',
      country: 'India',
      classLevel: 10,
      medium: 'English',
      secondLanguage: 'hindi-b',
      attendsCoaching: true,
    });

    expect(result.success).toBe(true);
    expect(isNcertClass10Enabled()).toBe(true);
    expect(data.initialBacklogSetupComplete).toBe(false);

    const subjects = getSubjectOptionsForProfile(data.studentProfile).map(
      (subject) => subject.label,
    );
    expect(subjects).toContain('Physics');
    expect(subjects).toContain('Chemistry');
    expect(subjects).toContain('Biology');
    expect(subjects).toContain('Economics');
    expect(subjects).toContain('Hindi Course B');

    const titles = getChaptersForProfile(data.studentProfile).map((chapter) => chapter.title);
    expect(titles).toContain('Electricity');
    expect(titles).toContain('Money and Credit');
    expect(titles).toContain('Real Numbers');
  });

  it('does not auto-load NCERT for non-India or non-Class-10 profiles', () => {
    const result = saveStudentProfile({
      name: 'Alex',
      country: 'Other',
      classLevel: 10,
      medium: 'English',
      secondLanguage: 'none',
      attendsCoaching: false,
    });

    expect(result.success).toBe(true);
    expect(isNcertClass10Enabled()).toBe(false);
    expect(data.initialBacklogSetupComplete).toBe(true);
    expect(getChaptersForProfile(data.studentProfile)).toEqual([]);
  });

  it('stores backlog by exact NCERT chapter and merges repeated additions', () => {
    saveStudentProfile({
      name: 'Rahul',
      country: 'India',
      classLevel: 10,
      medium: 'English',
      secondLanguage: 'hindi-b',
      attendsCoaching: true,
    });
    completeInitialBacklogSetup();

    const electricity = getChaptersForProfile(data.studentProfile).find(
      (chapter) => chapter.title === 'Electricity',
    );
    expect(electricity).toBeTruthy();
    if (!electricity) return;

    addBacklog({
      name: `${electricity.subjectLabel} — ${electricity.title}`,
      count: 2,
      subject: electricity.subjectKey,
      subjectLabel: electricity.subjectLabel,
      chapterId: electricity.id,
      chapterName: electricity.title,
      bookId: electricity.bookId,
      bookName: electricity.bookName,
      source: 'ncert-class10',
      createdFrom: 'initial-setup',
    });
    addBacklog({
      name: `${electricity.subjectLabel} — ${electricity.title}`,
      count: 1,
      subject: electricity.subjectKey,
      subjectLabel: electricity.subjectLabel,
      chapterId: electricity.id,
      chapterName: electricity.title,
      bookId: electricity.bookId,
      bookName: electricity.bookName,
      source: 'ncert-class10',
      createdFrom: 'daily-check',
    });

    expect(getBacklogs()).toHaveLength(1);
    expect(getBacklogs()[0]).toMatchObject({
      chapterName: 'Electricity',
      subject: 'Physics',
      bookName: 'Science',
      total: 3,
    });
  });
});

describe('daily 9 PM class check-in', () => {
  it('asks only after 9 PM and only once per day after complete or skip', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T20:59:00'));
    saveStudentProfile({
      name: 'Rahul',
      country: 'India',
      classLevel: 10,
      medium: 'English',
      secondLanguage: 'hindi-b',
      attendsCoaching: true,
    });
    completeInitialBacklogSetup();

    expect(shouldAskDailyClassCheck()).toBe(false);

    vi.setSystemTime(new Date('2026-07-30T21:01:00'));
    expect(shouldAskDailyClassCheck()).toBe(true);

    completeDailyClassCheck({ totalHeld: 6, attended: 4, missed: 2, assignedBacklog: 2 });
    expect(shouldAskDailyClassCheck()).toBe(false);

    vi.setSystemTime(new Date('2026-07-31T21:01:00'));
    expect(shouldAskDailyClassCheck()).toBe(true);
    skipDailyClassCheck();
    expect(shouldAskDailyClassCheck()).toBe(false);
  });

  it('validates total and attended class counts safely', () => {
    expect(validateDailyAttendance(6, 4)).toMatchObject({ success: true, missed: 2 });
    expect(validateDailyAttendance(4, 6).success).toBe(false);
    expect(validateDailyAttendance(-1, 0).success).toBe(false);
    expect(validateDailyAttendance(21, 0).success).toBe(false);
  });

  it('can find NCERT chapters by id for UI selectors', () => {
    saveStudentProfile({
      name: 'Rahul',
      country: 'India',
      classLevel: 10,
      medium: 'English',
      secondLanguage: 'hindi-b',
      attendsCoaching: false,
    });
    const chapter = getChaptersForProfile(data.studentProfile).find(
      (item) => item.title === 'Money and Credit',
    );
    expect(chapter).toBeTruthy();
    expect(chapter ? findNcertChapter(chapter.id, data.studentProfile)?.title : null).toBe(
      'Money and Credit',
    );
  });
});
