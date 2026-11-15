import { describe, expect, it, vi } from 'vitest';

import { EMPTY_REVIEW_LOG, nextReviewLog, shouldAskForReview } from './review-prompt';

vi.mock('expo-store-review', () => ({ hasAction: vi.fn(), requestReview: vi.fn() }));
vi.mock('@/utils/storage', () => ({ storage: { get: vi.fn(), set: vi.fn() } }));

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 15);

describe('in-app review prompt', () => {
  it('asks once at a new good moment', () => {
    expect(shouldAskForReview(EMPTY_REVIEW_LOG, 'first_win', NOW)).toBe(true);
    const log = nextReviewLog(EMPTY_REVIEW_LOG, 'first_win', NOW);
    expect(shouldAskForReview(log, 'first_win', NOW + 90 * DAY)).toBe(false);
  });

  it('waits 30 days between prompts', () => {
    const log = nextReviewLog(EMPTY_REVIEW_LOG, 'first_win', NOW);
    expect(shouldAskForReview(log, 'promotion', NOW + 29 * DAY)).toBe(false);
    expect(shouldAskForReview(log, 'promotion', NOW + 31 * DAY)).toBe(true);
  });

  it('stops after three prompts within a year', () => {
    let log = EMPTY_REVIEW_LOG;
    ['a', 'b', 'c'].forEach((moment, index) => { log = nextReviewLog(log, moment, NOW + index * 40 * DAY); });
    expect(shouldAskForReview(log, 'd', NOW + 160 * DAY)).toBe(false);
    expect(shouldAskForReview(log, 'd', NOW + 400 * DAY)).toBe(true);
  });
});
