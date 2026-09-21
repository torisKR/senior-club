import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const workflow = fs.readFileSync(new URL('../../../.github/workflows/android-play-internal.yml', import.meta.url), 'utf8');
const shared = fs.readFileSync(new URL('../../../.github/workflows/android-play-production.yml', import.meta.url), 'utf8');
test('internal is manual, optional, draft-only and cannot bypass screenshots', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n  (push|pull_request|schedule):/);
  assert.match(workflow, /default: false/);
  assert.match(workflow, /internal_release: true/);
  assert.match(workflow, /binary_update: false/);
  assert.match(workflow, /submit_to_play: \$\{\{ inputs.submit_to_play \}\}/);
  assert.match(workflow, /uses: .\/\.github\/workflows\/android-play-production.yml/);
  assert.match(shared, /inputs.internal_release && 'play-internal' \|\| 'play-store-production'/);
  assert.match(shared, /PLAY_TRACK:.*inputs.internal_release && 'internal' \|\| 'production'/);
  assert.match(shared, /PLAY_STATUS:.*!inputs.internal_release.*\|\| 'draft'/);
});
