import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { summarizeFrameStats } from './summarize-android-framestats.mjs';

test('summarizes completed frames separately per profile and excludes invalid or flagged rows', () => {
  const input = `Window one
---PROFILEDATA---
Flags,IntendedVsync,FrameCompleted,
0,1000000000,1010000000,
0,2000000000,2020000000,
1,3000000000,3002000000,
0,4000000000,0,
,5000000000,5010000000,
---PROFILEDATA---
Window two
---PROFILEDATA---
Flags,IntendedVsync,FrameCompleted,
0,9007199254740993000,9007199254775993000,
---PROFILEDATA---`;
  const result = summarizeFrameStats(input);
  assert.equal(result.profiles.length, 2);
  assert.deepEqual(result.profiles[0], {
    profile: 1, frames: 2, skippedRows: 3, p50Ms: 10, p95Ms: 20, p99Ms: 20, maxMs: 20,
    over60HzBudget: 1, over60HzBudgetPercent: 50,
  });
  assert.equal(result.profiles[1].p50Ms, 35);
  assert.equal(result.profiles[1].over60HzBudgetPercent, 100);
});

test('returns no profile for missing headers or incomplete frames', () => {
  assert.deepEqual(summarizeFrameStats('---PROFILEDATA---\nFlags,IntendedVsync\n0,123\n---PROFILEDATA---').profiles, []);
  assert.deepEqual(summarizeFrameStats('not an Android frame capture').profiles, []);
});

test('summarizes available frame stages without counting unfinished or sentinel timestamps', () => {
  const input = `---PROFILEDATA---
Flags,IntendedVsync,Vsync,DrawStart,SyncStart,SwapBuffers,GpuCompleted,FrameCompleted,
0,1000000000,1001000000,1005000000,1006000000,1008000000,1010000000,1011000000,
0,2000000000,2002000000,2008000000,2009000000,2012000000,9223372036854775807,2015000000,
1,3000000000,3000000000,3001000000,3002000000,3003000000,3004000000,3005000000,
---PROFILEDATA---`;
  const [profile] = summarizeFrameStats(input).profiles;
  assert.deepEqual(profile.stages.vsyncDelay, { frames: 2, p50Ms: 1, p95Ms: 2, maxMs: 2 });
  assert.deepEqual(profile.stages.uiToDraw, { frames: 2, p50Ms: 4, p95Ms: 6, maxMs: 6 });
  assert.deepEqual(profile.stages.swapToGpu, { frames: 1, p50Ms: 2, p95Ms: 2, maxMs: 2 });
});
