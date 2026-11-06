import { describe, expect, it } from 'vitest';

import {
  PARK_GOLF_HOLES,
  createInitialAlkkagiStones,
  createSacheonseongBoard,
  executeAlkkagiFlick,
  findFirstSacheonseongHint,
  findSacheonseongPath,
  isCalendarDayChanged,
  resetDailyMissions,
  resolveRankProgress,
  simulateParkGolfShot,
  todayKey,
} from './arcade-logic';

describe('Senior Club Arcade core systems', () => {
  it('resolves rank progression from 18급 to 클럽 명인 accurately', () => {
    expect(resolveRankProgress(0).current.shortLabel).toBe('18급');
    expect(resolveRankProgress(240).current.shortLabel).toBe('15급');
    expect(resolveRankProgress(950).current.shortLabel).toBe('9급');
    const master = resolveRankProgress(4000);
    expect(master.current.shortLabel).toBe('명인');
    expect(master.progressRatio).toBe(1);
  });

  it('simulates Park Golf shots and detects hole-in / cup proximity', () => {
    const hole1 = PARK_GOLF_HOLES[0];
    const shot = simulateParkGolfShot(hole1, { x: 50, y: 40 }, 2, 1);
    expect(shot.path.length).toBeGreaterThan(2);
    expect(shot.holed).toBe(true);
  });

  it('executes Alkkagi flicks and triggers double knockout (일석이조)', () => {
    const stones = createInitialAlkkagiStones();
    const outcome = executeAlkkagiFlick(stones, 'p2', 'a2', 'double');
    expect(outcome.knockedOutEnemies).toBeGreaterThanOrEqual(2);
    expect(outcome.doubleKnockout).toBe(true);
  });

  it('finds valid <=2-turn orthogonal paths and hints in Sacheonseong', () => {
    const board = createSacheonseongBoard(4, 6);
    const hint = findFirstSacheonseongHint(board);
    expect(hint).not.toBeNull();
    const [a, b] = hint!;
    const path = findSacheonseongPath(board, a, b);
    expect(path).not.toBeNull();
    expect(path!.length).toBeLessThanOrEqual(4);
  });
});

describe('Daily mission date-keyed reset', () => {
  const allDone = {
    parkGolfDone: true,
    alkkagiDone: true,
    sacheonseongDone: true,
    attendanceStampClaimed: true,
  };
  const allFresh = {
    parkGolfDone: false,
    alkkagiDone: false,
    sacheonseongDone: false,
    attendanceStampClaimed: false,
  };

  it('builds local YYYY-MM-DD keys via todayKey', () => {
    expect(todayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(todayKey(new Date(2026, 11, 31))).toBe('2026-12-31');
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('treats missing, empty, or invalid last dates as a day change', () => {
    expect(isCalendarDayChanged(null, '2026-11-04')).toBe(true);
    expect(isCalendarDayChanged(undefined, '2026-11-04')).toBe(true);
    expect(isCalendarDayChanged('', '2026-11-04')).toBe(true);
    expect(isCalendarDayChanged('not-a-date', '2026-11-04')).toBe(true);
    expect(isCalendarDayChanged('2026-11-04', '2026-11-04')).toBe(false);
    expect(isCalendarDayChanged('2026-11-03', '2026-11-04')).toBe(true);
  });

  it('resets missions on a new day and leaves them untouched on the same day', () => {
    expect(resetDailyMissions(allDone, '2026-11-04', '2026-11-03')).toEqual(allFresh);
    expect(resetDailyMissions(allDone, '2026-11-04', '2026-11-04')).toBe(allDone);
    expect(resetDailyMissions(allDone, '2026-11-04', null)).toEqual(allFresh);
    expect(resetDailyMissions(allDone, '2026-11-04', '')).toEqual(allFresh);
    expect(resetDailyMissions(allDone, '2026-11-04')).toEqual(allFresh);
  });

  it('tolerates missing mission fields when resetting', () => {
    const partial = { parkGolfDone: true };
    expect(resetDailyMissions(partial, '2026-11-04', '2026-11-03')).toEqual(allFresh);
    expect(resetDailyMissions(partial, '2026-11-04', '2026-11-04')).toBe(partial);
  });
});
