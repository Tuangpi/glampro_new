import { describe, expect, it } from 'vitest';
import {
  addDaysToDateOnly,
  dayLabel,
  formatDate,
  formatDateTime,
  formatDateTimeInZone,
  formatMoney,
  formatTimeInZone,
  zonedDateOnly,
} from './format';

describe('formatMoney', () => {
  it('formats the selected location currency', () => {
    expect(formatMoney(14600, 'SGD')).toBe('$146');
    expect(formatMoney(14600, 'USD')).toBe('US$146');
  });
});

describe('formatDateTime', () => {
  it('renders an ISO timestamp as a local date and time', () => {
    const rendered = formatDateTime('2026-09-23T04:30:00.000Z');

    expect(rendered).toContain('2026');
    expect(rendered.length).toBeGreaterThan(8);
  });
});

describe('formatDate', () => {
  it('renders an ISO timestamp as a local date', () => {
    expect(formatDate('2026-09-23T04:30:00.000Z')).toContain('2026');
  });
});

describe('zoned calendar helpers', () => {
  it('reads the calendar day and time in the location zone', () => {
    expect(zonedDateOnly(new Date('2026-09-23T16:30:00.000Z'), 'Asia/Singapore')).toBe(
      '2026-09-24',
    );
    expect(formatTimeInZone('2026-09-24T01:00:00.000Z', 'Asia/Singapore')).toBe('09:00');
    expect(formatDateTimeInZone('2026-09-24T01:00:00.000Z', 'Asia/Singapore')).toContain('2026');
  });

  it('steps days and labels them without shifting the date', () => {
    expect(addDaysToDateOnly('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDaysToDateOnly('2026-10-01', -1)).toBe('2026-09-30');
    expect(dayLabel('2026-09-24')).toContain('Thu');
    expect(dayLabel('2026-09-24')).toContain('Sep');
  });
});
