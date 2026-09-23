import { describe, expect, it } from 'vitest';
import { formatSgd } from './format';

describe('formatSgd', () => {
  it('formats integer minor units as Singapore dollars', () => {
    expect(formatSgd(14600)).toBe('$146');
  });
});
