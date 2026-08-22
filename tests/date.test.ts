import { describe, it, expect } from 'vitest';
import { daysBetween, localISODate, shiftISODate, isValidISODate } from '../src/utils/date.ts';

describe('daysBetween (calendar-day difference)', () => {
  it('returns 0 for the same day', () => {
    expect(daysBetween('Tue Jul 21 2026', 'Tue Jul 21 2026')).toBe(0);
  });

  it('returns 1 for consecutive days', () => {
    expect(daysBetween('Tue Jul 21 2026', 'Wed Jul 22 2026')).toBe(1);
  });

  it('returns a positive difference across a month boundary', () => {
    expect(daysBetween('Fri Jul 31 2026', 'Sat Aug 01 2026')).toBe(1);
  });

  it('returns a negative difference when B is before A', () => {
    expect(daysBetween('Wed Jul 22 2026', 'Tue Jul 21 2026')).toBe(-1);
  });

  it('returns 2 for a two-day gap', () => {
    expect(daysBetween('Mon Jul 20 2026', 'Wed Jul 22 2026')).toBe(2);
  });

  it('is immune to daylight-saving shifts (calendar-day, not elapsed-time)', () => {
    // These two strings are real local midnights on either side of a typical
    // "spring forward" Sunday. The difference must be a whole day even though
    // the wall-clock elapsed time is only 23 hours in DST-observing timezones.
    expect(daysBetween('Sun Mar 08 2026', 'Mon Mar 09 2026')).toBe(1);
  });

  it('returns 0 for invalid input instead of NaN', () => {
    expect(daysBetween('not a date', 'Wed Jul 22 2026')).toBe(0);
    expect(daysBetween('Wed Jul 22 2026', 'not a date')).toBe(0);
  });
});

describe('ISO date helpers', () => {
  it('localISODate returns a stable YYYY-MM-DD key', () => {
    expect(localISODate(new Date(2026, 6, 24))).toBe('2026-07-24');
  });

  it('shiftISODate moves across month boundaries safely', () => {
    expect(shiftISODate('2026-08-01', -1)).toBe('2026-07-31');
    expect(shiftISODate('2026-07-31', 1)).toBe('2026-08-01');
  });

  it('isValidISODate rejects overflow dates', () => {
    expect(isValidISODate('2026-02-29')).toBe(false);
    expect(isValidISODate('2026-13-01')).toBe(false);
    expect(isValidISODate('2026-07-24')).toBe(true);
  });
});
