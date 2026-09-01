import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildEvidence,
  parseArguments,
  parseBuildResult,
} from './extract-eas-build-id.mjs';

const buildId = '89cbd11f-03c0-4d30-9062-295654924f59';
const finishedAndroidBuild = {
  id: buildId,
  platform: 'ANDROID',
  status: 'FINISHED',
  artifacts: { buildUrl: 'https://example.invalid/build.aab' },
};

test('extracts the exact top-level UUID from one finished Android build', () => {
  assert.deepEqual(parseBuildResult(JSON.stringify(finishedAndroidBuild)), {
    id: buildId,
    platform: 'ANDROID',
    status: 'FINISHED',
  });
  assert.deepEqual(parseBuildResult(JSON.stringify([finishedAndroidBuild])), {
    id: buildId,
    platform: 'ANDROID',
    status: 'FINISHED',
  });
  assert.equal(
    parseBuildResult(
      JSON.stringify({ ...finishedAndroidBuild, id: buildId.toUpperCase() }),
    ).id,
    buildId.toUpperCase(),
  );
});

test('fails closed for malformed, empty, or ambiguous build results', () => {
  assert.throws(() => parseBuildResult('{'), /유효한 JSON/);
  assert.throws(() => parseBuildResult('[]'), /정확히 한 건/);
  assert.throws(
    () => parseBuildResult(JSON.stringify([finishedAndroidBuild, finishedAndroidBuild])),
    /정확히 한 건/,
  );
  assert.throws(
    () => parseBuildResult(JSON.stringify({ build: finishedAndroidBuild })),
    /최상위 id/,
  );
});

test('rejects non-UUID ids, unfinished builds, and non-Android builds', () => {
  assert.throws(
    () => parseBuildResult(JSON.stringify({ ...finishedAndroidBuild, id: 'latest' })),
    /유효한 UUID/,
  );
  assert.throws(
    () => parseBuildResult(JSON.stringify({ ...finishedAndroidBuild, status: 'IN_QUEUE' })),
    /FINISHED/,
  );
  assert.throws(
    () => parseBuildResult(JSON.stringify({ ...finishedAndroidBuild, platform: 'IOS' })),
    /Android/,
  );
});

test('writes a minimal evidence record bound to the raw JSON hash and source run', () => {
  const rawJson = `${JSON.stringify([finishedAndroidBuild])}\n`;
  const build = parseBuildResult(rawJson);
  const evidence = buildEvidence(rawJson, build, {
    GITHUB_SHA: 'A'.repeat(40),
    GITHUB_RUN_ID: '12345',
    GITHUB_RUN_ATTEMPT: '2',
  });

  assert.deepEqual(evidence.build, build);
  assert.equal(evidence.easCliVersion, '21.3.0');
  assert.equal(
    evidence.rawBuildJsonSha256,
    crypto.createHash('sha256').update(rawJson).digest('hex'),
  );
  assert.equal(evidence.sourceCommit, 'a'.repeat(40));
  assert.equal(evidence.githubRunId, '12345');
  assert.equal(evidence.githubRunAttempt, '2');
  assert.equal('artifacts' in evidence, false);
});

test('CLI arguments require one input path and an optional evidence path', () => {
  assert.deepEqual(parseArguments(['result.json', '--evidence', 'evidence.json']), {
    help: false,
    inputPath: 'result.json',
    evidencePath: 'evidence.json',
  });
  assert.throws(() => parseArguments([]), /파일 경로가 필요/);
  assert.throws(() => parseArguments(['one.json', 'two.json']), /하나만/);
  assert.throws(() => parseArguments(['result.json', '--latest']), /알 수 없는 인자/);
});

test('evidence JSON remains valid when serialized to a private temporary file', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'senior-club-eas-evidence-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const evidencePath = path.join(directory, 'validated-build.json');
  const rawJson = JSON.stringify(finishedAndroidBuild);

  fs.writeFileSync(
    evidencePath,
    `${JSON.stringify(buildEvidence(rawJson, parseBuildResult(rawJson)), null, 2)}\n`,
    { mode: 0o600 },
  );

  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  assert.equal(evidence.build.id, buildId);
  assert.equal(fs.statSync(evidencePath).mode & 0o077, 0);
});
