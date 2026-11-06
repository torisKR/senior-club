import { describe, expect, it } from 'vitest';

import {
  calculateOfflineIdleRewards,
  calculateProductionRate,
  DEFAULT_FACILITIES,
  DEFAULT_PARTNERS,
} from './idle-system';

describe('Senior Club Idle RPG production engine', () => {
  it('calculates real-time production rates with assigned partner multipliers', () => {
    const rates = calculateProductionRate(DEFAULT_FACILITIES, DEFAULT_PARTNERS);
    expect(rates.acornsPerSec).toBeGreaterThan(5);
    expect(rates.expPerSec).toBeGreaterThan(5);
  });

  it('calculates capped offline rewards accurately', () => {
    const last = Date.now() - 3600 * 10 * 1000; // 10 hours ago
    const now = Date.now();
    const rewards = calculateOfflineIdleRewards(last, now, DEFAULT_FACILITIES, DEFAULT_PARTNERS);
    expect(rewards).not.toBeNull();
    expect(rewards!.cappedElapsedSec).toBe(8 * 3600);
    expect(rewards!.earnedAcorns).toBeGreaterThan(100);
  });
});
