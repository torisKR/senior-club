import { describe, expect, it } from 'vitest';

import { needsDailyReset, todayKey, withDailyReset } from './daily-reset';

describe('todayKey', () => {
  it('formats the local date as YYYY-MM-DD', () => {
    expect(todayKey(new Date(2026, 10, 4, 12, 0, 0))).toBe('2026-11-04');
  });

  it('zero-pads month and day', () => {
    expect(todayKey(new Date(2026, 0, 5, 9, 30))).toBe('2026-01-05');
  });

  it('does not shift near-midnight local times across days', () => {
    expect(todayKey(new Date(2026, 0, 1, 23, 59))).toBe('2026-01-01');
    expect(todayKey(new Date(2026, 0, 1, 0, 1))).toBe('2026-01-01');
  });
});

describe('needsDailyReset', () => {
  it('requires a reset when there is no previous stamp', () => {
    expect(needsDailyReset(null, '2026-11-04')).toBe(true);
    expect(needsDailyReset(undefined, '2026-11-04')).toBe(true);
  });

  it('skips the reset on the same day', () => {
    expect(needsDailyReset('2026-11-04', '2026-11-04')).toBe(false);
  });

  it('requires a reset on a different day', () => {
    expect(needsDailyReset('2026-11-03', '2026-11-04')).toBe(true);
  });

  it('does nothing when today is unknown', () => {
    expect(needsDailyReset('2026-11-03', '')).toBe(false);
  });
});

describe('withDailyReset', () => {
  const baseState = {
    lastDailyResetDate: '2026-11-03' as string | null,
    stats: {
      vitality: 80,
      maxVitality: 100,
      wisdomExp: 350,
      acorns: 120,
      reputation: 15,
      dailyMorningGymDone: true,
      dailyMedicationTaken: true,
    },
    currentChapterId: 'chapter_2',
  };

  it('clears the daily wellness flags and stamps the new day', () => {
    const next = withDailyReset(baseState, '2026-11-04');

    expect(next.lastDailyResetDate).toBe('2026-11-04');
    expect(next.stats.dailyMorningGymDone).toBe(false);
    expect(next.stats.dailyMedicationTaken).toBe(false);
  });

  it('keeps non-daily state untouched', () => {
    const next = withDailyReset(baseState, '2026-11-04');

    expect(next.stats.vitality).toBe(80);
    expect(next.stats.acorns).toBe(120);
    expect(next.stats.reputation).toBe(15);
    expect(next.currentChapterId).toBe('chapter_2');
  });

  it('does not mutate the input state', () => {
    withDailyReset(baseState, '2026-11-04');

    expect(baseState.lastDailyResetDate).toBe('2026-11-03');
    expect(baseState.stats.dailyMorningGymDone).toBe(true);
  });

  it('returns the same object when already reset today', () => {
    const alreadyReset = { ...baseState, lastDailyResetDate: '2026-11-04' };

    expect(withDailyReset(alreadyReset, '2026-11-04')).toBe(alreadyReset);
  });

  it('stamps the date even when stats are missing', () => {
    const noStats: { lastDailyResetDate: string | null; stats?: { dailyMorningGymDone?: boolean } } = {
      lastDailyResetDate: null,
    };
    const next = withDailyReset(noStats, '2026-11-04');

    expect(next.lastDailyResetDate).toBe('2026-11-04');
    expect(next.stats).toBeUndefined();
  });
});

describe('withDailyReset — 마음 온도', () => {
  it('날이 바뀌면 10만큼 식는다', () => {
    const state = { lastDailyResetDate: '2026-11-04', heartWarmth: 55 };
    expect(withDailyReset(state, '2026-11-05').heartWarmth).toBe(45);
  });

  it('0 아래로 내려가지 않는다', () => {
    const state = { lastDailyResetDate: '2026-11-04', heartWarmth: 4 };
    expect(withDailyReset(state, '2026-11-05').heartWarmth).toBe(0);
  });

  it('같은 날에는 그대로 둔다', () => {
    const state = { lastDailyResetDate: '2026-11-05', heartWarmth: 55 };
    expect(withDailyReset(state, '2026-11-05')).toBe(state);
  });

  it('마음 온도가 없는 옛 세이브에는 키를 추가하지 않는다', () => {
    const state = { lastDailyResetDate: '2026-11-04' };
    expect('heartWarmth' in withDailyReset(state, '2026-11-05')).toBe(false);
  });
});

it('resets only an unfinished wellness quest when the day changes', () => {
  const state = {
    lastDailyResetDate: '2026-11-04',
    quests: [
      { targetType: 'daily_wellness', currentCount: 1, completed: false },
      { targetType: 'parkgolf', currentCount: 1, completed: true },
    ],
  };
  expect(withDailyReset(state, '2026-11-05').quests).toEqual([
    { targetType: 'daily_wellness', currentCount: 0, completed: false },
    { targetType: 'parkgolf', currentCount: 1, completed: true },
  ]);
});
