import { describe, expect, it } from 'vitest';

import {
  DAILY_ACORN_CAP, DAILY_WARMTH_CAP, EMPTY_PLAY_RECORDS, MIN_REWARD_SCORE, STAR_SCORES, commitPlayRound, nextLowStreak, normalizePlayRecords, playStars,
  settlePlayRound, shouldSuggestEasy, withoutReward, type PlayRecords,
} from './play-rewards';

const TODAY = '2026-11-28';

describe('play stars', () => {
  it('gives one to three stars by score', () => {
    expect(playStars('jegi', 0)).toBe(1);
    expect(playStars('jegi', STAR_SCORES.jegi[0])).toBe(2);
    expect(playStars('jegi', STAR_SCORES.jegi[1])).toBe(3);
    expect(playStars('stones', STAR_SCORES.stones[0] - 1)).toBe(1);
    expect(playStars('stones', STAR_SCORES.stones[1])).toBe(3);
  });
});

describe('play records', () => {
  it('falls back to empty records for missing or broken data', () => {
    expect(normalizePlayRecords(null)).toEqual(EMPTY_PLAY_RECORDS);
    expect(normalizePlayRecords('oops')).toEqual(EMPTY_PLAY_RECORDS);
    expect(normalizePlayRecords({ best: { jegi: -3, stones: 'x' }, acornsToday: Number.NaN })).toEqual(EMPTY_PLAY_RECORDS);
  });

  it('keeps valid saved values and ignores unknown fields', () => {
    const saved = { best: { jegi: 12, stones: 7, yut: 3 }, rewardDay: TODAY, acornsToday: 20, warmthToday: 2, extra: true };
    expect(normalizePlayRecords(saved)).toEqual({ best: { jegi: 12, stones: 7 }, rewardDay: TODAY, acornsToday: 20, warmthToday: 2 });
  });

  it('records a new best and leaves the other game alone', () => {
    const first = settlePlayRound(EMPTY_PLAY_RECORDS, 'jegi', 9, TODAY);
    expect(first.isNewBest).toBe(true);
    expect(first.records.best).toEqual({ jegi: 9, stones: 0 });
    const worse = settlePlayRound(first.records, 'jegi', 4, TODAY);
    expect(worse.isNewBest).toBe(false);
    expect(worse.records.best.jegi).toBe(9);
    expect(EMPTY_PLAY_RECORDS.best.jegi).toBe(0);
  });
});

describe('play rewards', () => {
  it('rewards more for more stars', () => {
    const one = settlePlayRound(EMPTY_PLAY_RECORDS, 'jegi', MIN_REWARD_SCORE, TODAY);
    const three = settlePlayRound(EMPTY_PLAY_RECORDS, 'jegi', STAR_SCORES.jegi[1], TODAY);
    expect(one.acorns).toBeGreaterThan(0);
    expect(three.acorns).toBeGreaterThan(one.acorns);
    expect(one.warmth).toBe(1);
  });

  it('gives nothing for a round that barely started, but still no penalty', () => {
    const none = settlePlayRound(EMPTY_PLAY_RECORDS, 'stones', MIN_REWARD_SCORE - 1, TODAY);
    expect(none.acorns).toBe(0);
    expect(none.warmth).toBe(0);
    expect(none.capReached).toBe(false);
    expect(none.stars).toBe(1);
  });

  it('stops at the daily cap shared by both games', () => {
    let records = EMPTY_PLAY_RECORDS;
    let acorns = 0;
    let warmth = 0;
    for (let round = 0; round < 30; round += 1) {
      const result = settlePlayRound(records, round % 2 === 0 ? 'jegi' : 'stones', 99, TODAY);
      records = result.records;
      acorns += result.acorns;
      warmth += result.warmth;
    }
    expect(acorns).toBe(DAILY_ACORN_CAP);
    expect(warmth).toBe(DAILY_WARMTH_CAP);
    expect(acorns % 4).toBe(0);
    const capped = settlePlayRound(records, 'jegi', 99, TODAY);
    expect(capped.acorns).toBe(0);
    expect(capped.capReached).toBe(true);
  });

  it('starts counting again the next day', () => {
    const full = { ...EMPTY_PLAY_RECORDS, rewardDay: TODAY, acornsToday: DAILY_ACORN_CAP, warmthToday: DAILY_WARMTH_CAP };
    const next = settlePlayRound(full, 'jegi', 99, '2026-11-29');
    expect(next.acorns).toBeGreaterThan(0);
    expect(next.records.rewardDay).toBe('2026-11-29');
  });

  it('can keep the best score without counting a reward that failed to save', () => {
    const result = settlePlayRound(EMPTY_PLAY_RECORDS, 'jegi', 20, TODAY);
    expect(withoutReward(result, EMPTY_PLAY_RECORDS)).toEqual({ ...EMPTY_PLAY_RECORDS, best: { jegi: 20, stones: 0 } });
  });
});

describe('saving a round', () => {
  const result = settlePlayRound(EMPTY_PLAY_RECORDS, 'jegi', 20, TODAY);
  const disk = () => {
    const saved: PlayRecords[] = [];
    return { saved, save: (records: PlayRecords) => { saved.push(records); } };
  };

  it('writes what was earned today before paying the reward', () => {
    const order: string[] = [];
    const commit = commitPlayRound(EMPTY_PLAY_RECORDS, result, {
      save: () => { order.push('save'); },
      pay: () => { order.push('pay'); return true; },
    });
    expect(order).toEqual(['save', 'pay']);
    expect(commit).toEqual({ records: result.records, acorns: result.acorns, warmth: result.warmth, saveFailed: false });
  });

  it('pays nothing when the record cannot be saved, so the daily cap cannot be exceeded', () => {
    let paid = false;
    const commit = commitPlayRound(EMPTY_PLAY_RECORDS, result, {
      save: () => { throw new Error('disk full'); },
      pay: () => { paid = true; return true; },
    });
    expect(paid).toBe(false);
    expect(commit).toEqual({ records: EMPTY_PLAY_RECORDS, acorns: 0, warmth: 0, saveFailed: true });
  });

  it('takes the reward back out of today\'s total when paying fails, keeping the best score', () => {
    const { saved, save } = disk();
    const commit = commitPlayRound(EMPTY_PLAY_RECORDS, result, { save, pay: () => false });
    expect(commit.saveFailed).toBe(true);
    expect(commit.acorns).toBe(0);
    expect(saved[saved.length - 1]).toEqual({ ...EMPTY_PLAY_RECORDS, best: { jegi: 20, stones: 0 } });
  });

  it('does not call pay for a round without a reward', () => {
    const none = settlePlayRound(EMPTY_PLAY_RECORDS, 'jegi', 1, TODAY);
    const commit = commitPlayRound(EMPTY_PLAY_RECORDS, none, { save: () => undefined, pay: () => { throw new Error('should not pay'); } });
    expect(commit.saveFailed).toBe(false);
  });
});

describe('suggesting slow mode', () => {
  it('suggests it after three rounds in a row below the reward score', () => {
    const streak = [1, 2, 0].reduce(nextLowStreak, 0);
    expect(streak).toBe(3);
    expect(shouldSuggestEasy(streak, false)).toBe(true);
    expect(shouldSuggestEasy(2, false)).toBe(false);
    expect(shouldSuggestEasy(streak, true)).toBe(false);
  });

  it('starts counting again after a rewarded round', () => {
    expect(nextLowStreak(2, MIN_REWARD_SCORE)).toBe(0);
  });
});
