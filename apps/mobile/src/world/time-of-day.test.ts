import { describe, expect, it } from 'vitest';
import { timeOfDayTint } from './time-of-day';

const rgba = (hour: number) => timeOfDayTint(hour).match(/[\d.]+/g)!.map(Number);

describe('village daylight', () => {
  it('keeps daytime clear and the night tint translucent', () => {
    expect(rgba(12)[3]).toBe(0);
    expect(rgba(23)[3]).toBeGreaterThan(0);
    expect(rgba(23)[3]).toBeLessThan(0.3);
  });

  it('transitions continuously at dawn, dusk and midnight', () => {
    for (const hour of [0, 5, 7, 9, 17, 19, 21, 24]) {
      const before = rgba(hour - 1 / 60);
      const after = rgba(hour + 1 / 60);
      for (let channel = 0; channel < 3; channel += 1) expect(Math.abs(before[channel] - after[channel])).toBeLessThanOrEqual(2);
      expect(Math.abs(before[3] - after[3])).toBeLessThan(0.01);
    }
  });

  it('changes light through a transition and handles invalid time safely', () => {
    expect(timeOfDayTint(18)).not.toBe(timeOfDayTint(17));
    expect(timeOfDayTint(18)).not.toBe(timeOfDayTint(19));
    expect(timeOfDayTint(Number.NaN)).toBe(timeOfDayTint(12));
  });
});
