import { writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { SIM_SEEDS, playJegiByCue, playJegiByMashing, playJegiByRhythm, playStonesByCue, playStonesByRhythm, summarize, type SimSummary } from './sim-players';

const pct = (value: number) => `${Math.round(value * 100)}%`;
const row = (label: string, s: SimSummary) => `${label.padEnd(34)} 중앙값 ${String(s.median).padStart(2)}  무보상 ${pct(s.noReward).padStart(4)}  별1/2/3 ${s.stars.map(pct).join('/')}`;

/** PLAY_SIM_TABLE=<파일 경로> 로 돌리면 보고용 표를 그 파일에 씁니다. */
describe.runIf(Boolean(process.env.PLAY_SIM_TABLE))('balance table', () => {
  it('prints the simulation table', () => {
    const lines: string[] = [];
    for (const [ms, px] of [[40, 8], [70, 12], [100, 14], [130, 18], [160, 22], [200, 26]]) {
      lines.push(row(`제기 보통 ±${ms}ms ±${px}px`, summarize('jegi', SIM_SEEDS.map((seed) => playJegiByRhythm(seed, ms, px)))));
    }
    for (const ms of [40, 70, 100, 130, 160, 200]) {
      lines.push(row(`돌탑 보통 ±${ms}ms`, summarize('stones', SIM_SEEDS.map((seed) => playStonesByRhythm(seed, ms)))));
    }
    for (const cue of ['soon', 'now'] as const) {
      for (const ms of [250, 350, 450, 600, 750]) {
        lines.push(row(`제기 느린 '${cue}' 신호 뒤 ${ms}±60ms`, summarize('jegi', SIM_SEEDS.map((seed) => playJegiByCue(seed, cue, ms, 60)))));
        lines.push(row(`돌탑 느린 '${cue}' 신호 뒤 ${ms}±60ms`, summarize('stones', SIM_SEEDS.map((seed) => playStonesByCue(seed, cue, ms, 60)))));
      }
    }
    for (const slow of [false, true]) {
      for (const ms of [100, 200, 400, 700, 1000]) {
        lines.push(row(`제기 ${slow ? '느린' : '보통'} 연타 ${ms}ms`, summarize('jegi', SIM_SEEDS.map((seed) => playJegiByMashing(seed, ms, slow)))));
      }
    }
    writeFileSync(process.env.PLAY_SIM_TABLE ?? '', `${lines.join('\n')}\n`);
    expect(lines.length).toBeGreaterThan(0);
  }, 300000);
});
