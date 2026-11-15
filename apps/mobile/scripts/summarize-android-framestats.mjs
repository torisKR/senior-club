#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const MARKER = '---PROFILEDATA---';
const FRAME_BUDGET_MS = 1000 / 60;
const STAGES = [
  ['vsyncDelay', 'IntendedVsync', 'Vsync'],
  ['uiToDraw', 'Vsync', 'DrawStart'],
  ['drawToSync', 'DrawStart', 'SyncStart'],
  ['renderToSwap', 'SyncStart', 'SwapBuffers'],
  ['swapToGpu', 'SwapBuffers', 'GpuCompleted'],
];

function percentile(sorted, fraction) {
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

/** 각 Android 윈도우의 raw 프레임을 따로 요약합니다. 여러 윈도우를 합쳐 FPS로 해석하지 않습니다. */
export function summarizeFrameStats(input) {
  const chunks = input.split(MARKER);
  const profiles = [];
  for (let i = 1; i < chunks.length; i += 2) {
    const lines = chunks[i].split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const header = lines.findIndex((line) => line.split(',').includes('IntendedVsync') && line.split(',').includes('FrameCompleted'));
    if (header < 0) continue;
    const columns = lines[header].split(',').map((field) => field.trim());
    const flagIndex = columns.indexOf('Flags');
    const startIndex = columns.indexOf('IntendedVsync');
    const endIndex = columns.indexOf('FrameCompleted');
    if (flagIndex < 0) continue;
    const durations = [];
    const stages = Object.fromEntries(STAGES
      .filter(([, start, end]) => columns.includes(start) && columns.includes(end))
      .map(([name]) => [name, []]));
    let skipped = 0;
    for (const line of lines.slice(header + 1)) {
      const fields = line.split(',');
      try {
        if (fields.length <= Math.max(flagIndex, startIndex, endIndex)) throw new Error('incomplete');
        if (![flagIndex, startIndex, endIndex].every((index) => /^\d+$/.test(fields[index].trim()))) throw new Error('invalid');
        const flags = BigInt(fields[flagIndex].trim());
        const start = BigInt(fields[startIndex].trim());
        const end = BigInt(fields[endIndex].trim());
        if (flags !== 0n || start <= 0n || end <= start) throw new Error('invalid');
        const duration = Number(end - start) / 1_000_000;
        if (!Number.isFinite(duration)) throw new Error('invalid');
        durations.push(duration);
        for (const [name, startName, endName] of STAGES) {
          if (!stages[name]) continue;
          const values = [fields[columns.indexOf(startName)], fields[columns.indexOf(endName)]];
          if (!values.every((value) => value && /^\d+$/.test(value.trim()))) continue;
          const [stageStart, stageEnd] = values.map((value) => BigInt(value.trim()));
          // 일부 기기에서는 아직 기록되지 않은 시간이나 sentinel 값을 내보냅니다.
          if (stageStart < start || stageEnd < stageStart || stageEnd > end) continue;
          stages[name].push(Number(stageEnd - stageStart) / 1_000_000);
        }
      } catch {
        skipped += 1;
      }
    }
    if (!durations.length) continue;
    durations.sort((a, b) => a - b);
    const overBudget = durations.filter((duration) => duration > FRAME_BUDGET_MS).length;
    const stageSummary = Object.fromEntries(Object.entries(stages).flatMap(([name, values]) => {
      if (!values.length) return [];
      values.sort((a, b) => a - b);
      return [[name, { frames: values.length, p50Ms: percentile(values, 0.5), p95Ms: percentile(values, 0.95), maxMs: values[values.length - 1] }]];
    }));
    profiles.push({
      profile: profiles.length + 1,
      frames: durations.length,
      skippedRows: skipped,
      p50Ms: percentile(durations, 0.5),
      p95Ms: percentile(durations, 0.95),
      p99Ms: percentile(durations, 0.99),
      maxMs: durations[durations.length - 1],
      over60HzBudget: overBudget,
      over60HzBudgetPercent: overBudget / durations.length * 100,
      ...(Object.keys(stageSummary).length ? { stages: stageSummary } : {}),
    });
  }
  return { budgetMs: FRAME_BUDGET_MS, profiles };
}

function main() {
  const filename = process.argv[2];
  if (!filename || filename === '--help') {
    console.log('Usage: node summarize-android-framestats.mjs <captured-gfxinfo-framestats.txt>');
    process.exitCode = filename ? 0 : 2;
    return;
  }
  const result = summarizeFrameStats(readFileSync(filename, 'utf8'));
  if (!result.profiles.length) throw new Error('No complete PROFILEDATA frames found.');
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
