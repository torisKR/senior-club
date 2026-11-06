import { describe, expect, it } from 'vitest';

import { STORY_CHAPTERS } from '../rpg/story-data';
import { INITIAL_ARCADE_STATE } from './arcade-defaults';
import { resolveRankProgress } from './arcade-logic';

describe('INITIAL_ARCADE_STATE', () => {
  it('신규 설치는 18급 신입(0 CP)으로 시작한다', () => {
    const rank = resolveRankProgress(INITIAL_ARCADE_STATE.cp);
    expect(rank.current.id).toBe('18k');
    expect(rank.current.label).toBe('18급 신입 회원');
    expect(INITIAL_ARCADE_STATE.cp).toBe(0);
  });

  it('전적·인장·일일 미션이 모두 비어 있다', () => {
    expect(INITIAL_ARCADE_STATE.seals).toBe(0);
    expect(INITIAL_ARCADE_STATE.parkGolfClears).toBe(0);
    expect(INITIAL_ARCADE_STATE.alkkagiWins).toBe(0);
    expect(INITIAL_ARCADE_STATE.sacheonseongClears).toBe(0);
    expect(INITIAL_ARCADE_STATE.dailyMissions).toEqual({
      parkGolfDone: false,
      alkkagiDone: false,
      sacheonseongDone: false,
      attendanceStampClaimed: false,
    });
  });

  it('스토리 1막(18급 입문)과 급수가 일치한다', () => {
    const firstAct = STORY_CHAPTERS[0];
    expect(firstAct.rankRequirement).toContain('18급');
    expect(INITIAL_ARCADE_STATE.cp).toBeGreaterThanOrEqual(firstAct.minCp ?? 0);
    expect(resolveRankProgress(INITIAL_ARCADE_STATE.cp).current.label).toBe('18급 신입 회원');
  });
});
