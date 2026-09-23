import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatSgd } from './format';

describe('formatSgd', () => {
  it('formats integer minor units as Singapore dollars', () => {
    expect(formatSgd(14600)).toBe('$146');
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
