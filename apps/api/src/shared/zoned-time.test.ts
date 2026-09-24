import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayOfWeekOfDate,
  minutesOfDay,
  timeOfMinutes,
  timeZoneOffsetMs,
  zonedDayRange,
  zonedPartsAt,
  zonedTimeToUtc,
} from './zoned-time.js';

/**
 * The salon's default zone is Asia/Singapore (UTC+8 all year), and the
 * daylight-saving cases use America/New_York so the two-pass offset resolution
 * is actually exercised.
 */
describe('zoned time helpers', () => {
  it('reads an instant as wall clock in the location zone', () => {
    const parts = zonedPartsAt(new Date('2026-09-24T01:00:00.000Z'), 'Asia/Singapore');

    expect(parts).toMatchObject({ date: '2026-09-24', time: '09:00', dayOfWeek: 4 });
    expect(timeZoneOffsetMs(new Date('2026-09-24T01:00:00.000Z'), 'Asia/Singapore')).toBe(
      8 * 60 * 60 * 1000,
    );
  });

  it('reports local midnight as 00:00 rather than 24:00', () => {
    expect(zonedPartsAt(new Date('2026-09-23T16:00:00.000Z'), 'Asia/Singapore').time).toBe('00:00');
  });

  it('turns wall clock into the instant it names', () => {
    expect(zonedTimeToUtc('2026-09-24', '09:00', 'Asia/Singapore').toISOString()).toBe(
      '2026-09-24T01:00:00.000Z',
    );
    expect(zonedTimeToUtc('2026-06-15', '09:30', 'Europe/London').toISOString()).toBe(
      '2026-06-15T08:30:00.000Z',
    );
  });

  it('holds across a daylight-saving change', () => {
    // 2026-03-08 is the spring-forward day in New York: 09:00 is already EDT.
    expect(zonedTimeToUtc('2026-03-08', '09:00', 'America/New_York').toISOString()).toBe(
      '2026-03-08T13:00:00.000Z',
    );

    const springForward = zonedDayRange('2026-03-08', 'America/New_York');

    expect(springForward.startsAt.toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(springForward.endsAt.toISOString()).toBe('2026-03-09T04:00:00.000Z');
    expect(springForward.endsAt.getTime() - springForward.startsAt.getTime()).toBe(
      23 * 60 * 60 * 1000,
    );
  });

  it('brackets a local day, and the day has a weekday and a next day', () => {
    const day = zonedDayRange('2026-09-24', 'Asia/Singapore');

    expect(day.startsAt.toISOString()).toBe('2026-09-23T16:00:00.000Z');
    expect(day.endsAt.toISOString()).toBe('2026-09-24T16:00:00.000Z');
    expect(day.dayOfWeek).toBe(dayOfWeekOfDate('2026-09-24'));
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('converts between minutes past midnight and HH:MM', () => {
    expect(minutesOfDay('09:00')).toBe(540);
    expect(minutesOfDay('09:45')).toBe(585);
    expect(timeOfMinutes(540)).toBe('09:00');
    expect(timeOfMinutes(585)).toBe('09:45');
    expect(timeOfMinutes(minutesOfDay('18:15'))).toBe('18:15');
  });
});
