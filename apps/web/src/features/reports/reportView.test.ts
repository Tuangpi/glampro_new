import { describe, expect, it } from 'vitest';
import { barHeightPercentage, formatMinutes, rangeForPreset } from './reportView';

describe('report view helpers', () => {
  it('builds inclusive date presets from the location day', () => {
    expect(rangeForPreset(0, '2026-09-24')).toEqual({ from: '2026-09-24', to: '2026-09-24' });
    expect(rangeForPreset(7, '2026-09-24')).toEqual({ from: '2026-09-18', to: '2026-09-24' });
    expect(rangeForPreset(30, '2026-03-01')).toEqual({ from: '2026-01-31', to: '2026-03-01' });
  });

  it('scales chart bars while keeping a visible non-zero floor', () => {
    expect(barHeightPercentage(50, 100)).toBe(50);
    expect(barHeightPercentage(1, 100)).toBe(4);
    expect(barHeightPercentage(0, 100)).toBe(0);
    expect(barHeightPercentage(5, 0)).toBe(0);
  });

  it('formats service minutes for report tables', () => {
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(120)).toBe('2h');
    expect(formatMinutes(135)).toBe('2h 15m');
  });
});
