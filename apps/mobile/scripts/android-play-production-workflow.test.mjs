import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const workflow = fs.readFileSync(new URL('../../../.github/workflows/android-play-production.yml', import.meta.url), 'utf8');
const deploy = fs.readFileSync(new URL('../../../.github/workflows/deploy-main.yml', import.meta.url), 'utf8');
function step(name) {
  const marker = `      - name: ${name}`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1);
  const end = workflow.indexOf('\n      - name:', start + marker.length);
  return workflow.slice(start, end < 0 ? undefined : end);
}
test('reviewed main deployment retains upstream success and explicit binary update policy', () => {
  assert.match(deploy, /needs: \[backend, sites-package\]/);
  assert.match(deploy, /needs\.backend\.result == 'success' && needs\.sites-package\.result == 'success'/);
  assert.match(deploy, /binary_update: true/);
  assert.match(workflow, /workflow_call:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /inputs\.binary_update && 'completed' \|\| 'draft'/);
  assert.match(workflow, /env\.SUBMIT_TO_PLAY == 'true'/);
});
test('manual release defaults to no upload and explicitly opts into published binary validation', () => {
  const dispatch = workflow.slice(workflow.indexOf('  workflow_dispatch:'), workflow.indexOf('\npermissions:'));
  assert.match(dispatch, /binary_update:[\s\S]*?default: false/);
  assert.match(dispatch, /submit_to_play:[\s\S]*?default: false/);
  assert.match(deploy, /submit_to_play: false/);
  assert.match(workflow, /SUBMIT_TO_PLAY: \$\{\{ inputs.submit_to_play \}\}/);
});

test('main caller explicitly forwards reviewed evidence with artifact read permission', () => {
  assert.match(deploy, /github\.event_name == 'workflow_dispatch' && inputs\.screenshot_evidence_run_id != ''/);
  assert.match(deploy, /screenshot_evidence_run_id: \$\{\{ inputs.screenshot_evidence_run_id \}\}/);
  const android = deploy.slice(deploy.indexOf('\n  android:'));
  assert.match(android, /permissions:\n      contents: read\n      actions: read/);
  assert.match(android, /submit_to_play: false/);
});

test('quality, live endpoints and strict screenshot provenance remain before native build', () => {
  const build = workflow.indexOf('pnpm exec expo prebuild');
  for (const gate of ['pnpm lint', 'pnpm typecheck', 'pnpm test', 'pnpm test:release-validators', 'expo-doctor@1.20.1', 'pnpm release:android:preflight', 'node scripts/validate-release-endpoints.mjs']) {
    assert.ok(workflow.indexOf(gate) > 0 && workflow.indexOf(gate) < build, gate);
  }
  assert.match(step('Bind final screenshot evidence to checked-out commit'), /manifest\?\.capture\?\.commit !== process\.env\.GITHUB_SHA/);
  assert.doesNotMatch(step('Bind final screenshot evidence to checked-out commit'), /^        if:/m);
  assert.match(step('Validate published app update'), /pnpm validate:manifest/);
  assert.match(step('Verify release endpoints and Play service account'), /toris-play-uploader@toris-play-uploader/);
});
test('all release modes consume exact issuer evidence before preflight and Play edits', () => {
  const receive = step('Receive exact reviewed screenshot evidence');
  const preflight = step('Run production release preflight with final screenshot evidence');
  assert.doesNotMatch(receive + preflight, /^        if:/m);
  assert.match(receive, /SCREENSHOT_EVIDENCE_RUN_ID: \$\{\{ inputs.screenshot_evidence_run_id \}\}/);
  assert.match(receive, /python3 -B .github\/scripts\/download-play-screenshot-evidence.py/);
  assert.match(preflight, /FINAL_SCREENSHOT_MANIFEST: \$\{\{ steps.screenshot_evidence.outputs.manifest \}\}/);
  assert.match(preflight, /steps.screenshot_evidence.outputs.provenance/);
  assert.match(workflow, /permissions:\n  contents: read\n  actions: read\n/);
  assert.doesNotMatch(workflow, /store-listing\/screenshots\/final\/ko-KR\/manifest.json/);
  const playEdit = workflow.indexOf('      - name: Allocate versionCode from Play history');
  assert.ok(workflow.indexOf(receive) < workflow.indexOf(preflight));
  assert.ok(workflow.indexOf(preflight) < playEdit);
  assert.match(step('Check out repository'), /persist-credentials: false/);
});
test('certificate evidence uses actual prebuilt keystore before bounded native build', () => {
  const build = step('Build Play production AAB directly');
  assert.ok(build.indexOf('expo prebuild') < build.indexOf('python3 scripts/kakao-key-hashes.py'));
  assert.ok(build.indexOf('python3 scripts/kakao-key-hashes.py') < build.indexOf('./gradlew'));
  assert.match(build, /vars.PLAY_APP_SIGNING_CERTIFICATE_BASE64/);
  assert.match(build, /--max-workers=2/);
  assert.match(build, /-Xmx4g -XX:MaxMetaspaceSize=1g/);
  assert.doesNotMatch(build, /reactNativeArchitectures|genkey/);
});

test('signing is fail closed, secrets cleaned and only exact AAB evidence retained', () => {
  assert.match(step('Fail if release configuration is missing'), /check-signing/);
  assert.doesNotMatch(workflow, /eas-cli|EXPO_TOKEN|--latest|set -x/);
  assert.match(step('Build Play production AAB directly'), /release-signing.gradle/);
  assert.match(step('Validate exact signed AAB'), /sha256sum --check/);
  assert.match(step('Validate exact signed AAB'), /node scripts\/validate-merged-android-manifest\.mjs "\$EVIDENCE_DIR\/merged-manifest\.xml"/);
  assert.match(step('Submit exact validated artifact to Play'), /direct-play-release.py upload/);
  assert.match(step('Upload release evidence'), /retention-days: 30/);
  assert.match(step('Remove temporary release configuration'), /always\(\)/);
  assert.match(step('Remove temporary release configuration'), /upload.keystore/);
  assert.match(step('Remove temporary release configuration'), /senior-club-play-service-account.json/);
});
