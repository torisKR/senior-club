import { describe, expect, it } from 'vitest';

import { JEGI } from './jegi-logic';
import { STONES } from './stones-logic';
import { SIM_SEEDS, playJegiByCue, playJegiByMashing, playJegiByRhythm, playStonesByCue, playStonesByRhythm, summarize } from './sim-players';

/**
 * 난이도 목표를 고정합니다(45~69세 사용자 기준). 수치를 바꿔 이 테스트가 깨지면 목표를 다시 확인하세요.
 * 보통 모드의 오차는 고른 분포 ±값, 느린 모드는 신호 뒤 반응 시간 ±60ms입니다.
 */
const SEEDS = SIM_SEEDS.slice(0, 120);
const jegi = (ms: number, px: number) => summarize('jegi', SEEDS.map((seed) => playJegiByRhythm(seed, ms, px)));
const stones = (ms: number) => summarize('stones', SEEDS.map((seed) => playStonesByRhythm(seed, ms)));

describe('normal mode balance', () => {
  it('jegi: a ±130ms / ±18px player keeps going (median 8+, at most 15% unrewarded)', () => {
    const result = jegi(130, 18);
    expect(result.median).toBeGreaterThanOrEqual(8);
    expect(result.noReward).toBeLessThanOrEqual(0.15);
  });

  it('jegi: a ±70ms player can aim for three stars, a ±200ms player rarely gets them', () => {
    expect(jegi(70, 12).stars[2]).toBeGreaterThanOrEqual(0.5);
    expect(jegi(200, 26).stars[2]).toBeLessThanOrEqual(0.1);
  });

  it('stones: a ±130ms player builds a tower (median 6+, at most 15% unrewarded)', () => {
    const result = stones(130);
    expect(result.median).toBeGreaterThanOrEqual(6);
    expect(result.noReward).toBeLessThanOrEqual(0.15);
  });

  it('stones: a ±70ms player can aim for three stars, a ±200ms player rarely gets them', () => {
    expect(stones(70).stars[2]).toBeGreaterThanOrEqual(0.5);
    expect(stones(200).stars[2]).toBeLessThanOrEqual(0.1);
  });
});

describe('slow mode balance', () => {
  it.each([250, 350, 450, 600])('a player who reacts %ims after either cue is always rewarded', (reactionMs) => {
    for (const cue of ['soon', 'now'] as const) {
      expect(summarize('jegi', SEEDS.map((seed) => playJegiByCue(seed, cue, reactionMs, 60, 12))).noReward).toBe(0);
      expect(summarize('stones', SEEDS.map((seed) => playStonesByCue(seed, cue, reactionMs, 60, 8))).noReward).toBe(0);
    }
  });
});

describe('mashing', () => {
  it.each([100, 200, 400, 700, 1000])('pressing the kick button every %ims without looking earns nothing', (intervalMs) => {
    for (const slow of [false, true]) {
      expect(summarize('jegi', SEEDS.map((seed) => playJegiByMashing(seed, intervalMs, slow))).noReward).toBe(1);
    }
  });
});

describe('rounds always end', () => {
  it('a slow-mode player who never misses stops at the master goal', () => {
    const seeds = SEEDS.slice(0, 20);
    for (const reactionMs of [250, 450, 750]) {
      expect(new Set(seeds.map((seed) => playJegiByCue(seed, 'now', reactionMs, 60, 999)))).toEqual(new Set([JEGI.goal]));
      expect(new Set(seeds.map((seed) => playStonesByCue(seed, 'now', reactionMs, 60, 999)))).toEqual(new Set([STONES.goal]));
    }
  });

  it.each([1200, 1500, 2000])('pressing every %ims in slow mode never goes past the goal', (intervalMs) => {
    const scores = SEEDS.slice(0, 40).map((seed) => playJegiByMashing(seed, intervalMs, true, 999));
    expect(Math.max(...scores)).toBeLessThanOrEqual(JEGI.goal);
  });
});
