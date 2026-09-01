import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPreflightSteps, parseArguments } from './release-android-preflight.mjs';

test('release preflight forces production and live endpoint gates before strict screenshots', () => {
  const steps = buildPreflightSteps({ screenshotManifest: 'evidence/manifest.json' });

  assert.equal(steps.length, 5);
  assert.equal(steps[1].env.EXPO_PUBLIC_APP_ENV, 'production');
  assert.match(steps[2].args[0], /validate-release-endpoints\.mjs$/);
  assert.match(steps[2].label, /endpoint/);
  assert.match(steps.at(-1).args[0], /validate-play-screenshots\.mjs$/);
  assert.equal(steps.at(-1).args[1], 'evidence/manifest.json');
  assert.match(steps.at(-1).label, /strict/);
});

test('release preflight has no skip flag and rejects missing manifest values', () => {
  assert.throws(() => parseArguments(['--skip-screenshots']), /알 수 없는 인자/);
  assert.throws(() => parseArguments(['--screenshot-manifest']), /경로가 필요/);
  assert.deepEqual(parseArguments([]), { help: false, screenshotManifest: undefined });
});
