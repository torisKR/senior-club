import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const workflowPath = path.join(
  repositoryRoot,
  '.github',
  'workflows',
  'android-play-production.yml',
);
const deployWorkflowPath = path.join(repositoryRoot, '.github', 'workflows', 'deploy-main.yml');
const easConfigPath = path.join(repositoryRoot, 'apps', 'mobile', 'eas.json');
const workflow = fs.readFileSync(workflowPath, 'utf8');
const deployWorkflow = fs.readFileSync(deployWorkflowPath, 'utf8');
const easConfig = JSON.parse(fs.readFileSync(easConfigPath, 'utf8'));

function getStep(name) {
  const marker = `      - name: ${name}`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `workflow step not found: ${name}`);
  const next = workflow.indexOf('\n      - name:', start + marker.length);
  return workflow.slice(start, next === -1 ? workflow.length : next);
}

test('production workflow is callable by main deployment and manually dispatchable', () => {
  const triggerBlock = workflow.slice(workflow.indexOf('\non:\n'), workflow.indexOf('\npermissions:\n'));

  assert.match(triggerBlock, /\n  workflow_call:\n/);
  assert.match(triggerBlock, /\n  workflow_dispatch:\n/);
  assert.match(deployWorkflow, /\n  push:\n[\s\S]*branches:\s*\[main\]/);
  assert.match(deployWorkflow, /uses:\s+\.\/\.github\/workflows\/android-play-production\.yml/);
  assert.doesNotMatch(triggerBlock, /\n  (?:pull_request|schedule):/);
  assert.match(workflow, /environment: play-store-production/);
  assert.doesNotMatch(workflow, /--latest(?:\s|$)/);
});

test('EAS CLI and the production draft profiles are pinned fail-closed', () => {
  assert.equal(easConfig.cli.version, '21.3.0');
  assert.equal(easConfig.build.production.android.buildType, 'app-bundle');
  assert.equal(easConfig.build.production.environment, 'production');
  assert.equal(easConfig.submit.production.android.track, 'production');
  assert.equal(easConfig.submit.production.android.releaseStatus, 'draft');
  assert.equal(
    easConfig.submit.production.android.serviceAccountKeyPath,
    '/tmp/senior-club-play-service-account.json',
  );
  assert.doesNotMatch(workflow, /eas-cli@(?:latest|\^|~|>=)/);
  assert.match(workflow, /eas-cli@21\.3\.0 build/);
  assert.match(workflow, /eas-cli@21\.3\.0 submit/);
  assert.match(workflow, /--profile production/);
});

test('strict production preflight happens before the paid EAS build', () => {
  const preflightIndex = workflow.indexOf('pnpm release:android:preflight');
  const buildIndex = workflow.indexOf('eas-cli@21.3.0 build');

  assert.ok(preflightIndex > -1);
  assert.ok(buildIndex > preflightIndex);
  assert.match(
    workflow,
    /FINAL_SCREENSHOT_MANIFEST: store-listing\/screenshots\/final\/ko-KR\/manifest\.json/,
  );
  assert.match(workflow, /--screenshot-manifest "\$FINAL_SCREENSHOT_MANIFEST"/);
  assert.match(workflow, /--profile production[\s\S]*--non-interactive[\s\S]*--wait[\s\S]*--json/);
});

test('credentials and both production endpoint URLs are required and passed to gates', () => {
  const configurationStep = getStep('Fail if release configuration is missing');
  const preflightStep = getStep(
    'Run production release preflight with final screenshot evidence',
  );
  const buildStep = getStep('Build Play production AAB with EAS CLI 21.3.0');

  assert.match(configurationStep, /secrets\.EXPO_TOKEN/);
  assert.match(configurationStep, /secrets\.GOOGLE_SERVICES_JSON_BASE64/);
  assert.match(configurationStep, /REQUIRED_EXPO_PUBLIC_API_URL: \$\{\{ vars\.EXPO_PUBLIC_API_URL \}\}/);
  assert.match(configurationStep, /REQUIRED_EXPO_PUBLIC_WEB_URL: \$\{\{ vars\.EXPO_PUBLIC_WEB_URL \}\}/);
  assert.match(configurationStep, /-z "\$REQUIRED_EXPO_PUBLIC_API_URL"/);
  assert.match(configurationStep, /-z "\$REQUIRED_EXPO_PUBLIC_WEB_URL"/);

  for (const step of [preflightStep, buildStep]) {
    assert.match(step, /EXPO_PUBLIC_API_URL: \$\{\{ vars\.EXPO_PUBLIC_API_URL \}\}/);
    assert.match(step, /EXPO_PUBLIC_WEB_URL: \$\{\{ vars\.EXPO_PUBLIC_WEB_URL \}\}/);
  }

  assert.match(workflow, /base64 --decode > "\$google_services_path"/);
  assert.match(workflow, /umask 077/);
  assert.match(workflow, /rm -f -- "\$google_services_path"/);
  assert.doesNotMatch(workflow, /set -x/);
  assert.doesNotMatch(workflow, /echo "\$GOOGLE_SERVICES_JSON_BASE64"/);
});

test('mobile quality checks run after install and before preflight or paid build', () => {
  const installIndex = workflow.indexOf('pnpm install --frozen-lockfile');
  const qualityStep = getStep('Run mobile release quality checks');
  const qualityIndex = workflow.indexOf('      - name: Run mobile release quality checks');
  const preflightIndex = workflow.indexOf('pnpm release:android:preflight');
  const buildIndex = workflow.indexOf('eas-cli@21.3.0 build');

  assert.ok(qualityIndex > installIndex);
  assert.ok(preflightIndex > qualityIndex);
  assert.ok(buildIndex > qualityIndex);
  assert.match(qualityStep, /pnpm lint/);
  assert.match(qualityStep, /pnpm typecheck/);
  assert.match(qualityStep, /pnpm test(?:\s|$)/);
  assert.match(qualityStep, /pnpm test:release-validators/);
  assert.match(qualityStep, /pnpm validate:play-production-workflow/);
  assert.match(qualityStep, /npx --yes expo-doctor@1\.20\.1/);
  assert.doesNotMatch(qualityStep, /expo-doctor@latest/);
});

test('release endpoints and Play service account are verified without EAS env pull', () => {
  const syncStep = getStep('Verify release endpoints and Play service account');
  const syncIndex = workflow.indexOf(
    '      - name: Verify release endpoints and Play service account',
  );
  const buildIndex = workflow.indexOf('eas-cli@21.3.0 build');

  assert.ok(syncIndex > -1);
  assert.ok(buildIndex > syncIndex);
  assert.doesNotMatch(syncStep, /eas-cli@21\.3\.0 env:pull/);
  assert.match(syncStep, /GOOGLE_PLAY_SERVICE_ACCOUNT_JSON/);
  assert.match(syncStep, /toris-play-uploader@toris-play-uploader\.iam\.gserviceaccount\.com/);
  assert.match(syncStep, /senior\.toris\.kr/);
  assert.match(syncStep, /umask 077/);
  assert.match(syncStep, /EXPECTED_EXPO_PUBLIC_API_URL: \$\{\{ vars\.EXPO_PUBLIC_API_URL \}\}/);
  assert.match(syncStep, /EXPECTED_EXPO_PUBLIC_WEB_URL: \$\{\{ vars\.EXPO_PUBLIC_WEB_URL \}\}/);
  assert.match(syncStep, /EXPECTED_EXPO_PUBLIC_API_URL/);
  assert.match(syncStep, /EXPECTED_EXPO_PUBLIC_WEB_URL/);
  assert.doesNotMatch(
    syncStep,
    /console\.(?:log|error)\([^\n]*(?:values\[|process\.env\[`EXPECTED_)/,
  );
});

test('final screenshot manifest is bound to the full exact GITHUB_SHA before preflight', () => {
  const commitStep = getStep('Bind final screenshot evidence to checked-out commit');
  const commitIndex = workflow.indexOf(
    '      - name: Bind final screenshot evidence to checked-out commit',
  );
  const preflightIndex = workflow.indexOf('pnpm release:android:preflight');

  assert.ok(commitIndex > -1);
  assert.ok(preflightIndex > commitIndex);
  assert.match(commitStep, /\^\[0-9a-f\]\{40\}\$/);
  assert.ok(commitStep.includes('manifest?.capture?.commit !== process.env.GITHUB_SHA'));
  assert.doesNotMatch(commitStep, /toLowerCase\(|slice\(/);
});

test('main push always submits the validated exact build ID to production draft', () => {
  assert.match(workflow, /SUBMIT_TO_PLAY: \$\{\{ github\.event_name == 'push' \|\| inputs\.submit_to_play \}\}/);
  assert.match(getStep('Submit the exact build to Play production draft'), /if: \$\{\{ success\(\) && env\.SUBMIT_TO_PLAY == 'true' && !inputs\.binary_update \}\}/);
  assert.match(
    workflow,
    /EAS_BUILD_ID: \$\{\{ steps\.build_id\.outputs\.build_id \}\}/,
  );
  assert.match(workflow, /--profile production[\s\S]*--id "\$EAS_BUILD_ID"/);
  assert.match(workflow, /extract-eas-build-id\.mjs/);
});

test('published binary updates retain quality gates and use explicit production credentials', () => {
  assert.match(deployWorkflow, /needs: quality/);
  assert.match(deployWorkflow, /uses: \.\/\.github\/workflows\/ci\.yml/);
  assert.match(deployWorkflow, /binary_update: true/);
  assert.match(getStep('Bind final screenshot evidence to checked-out commit'), /if: \$\{\{ !inputs\.binary_update \}\}/);
  const update = getStep('Verify release endpoints and Play service account');
  assert.match(update, /GOOGLE_PLAY_SERVICE_ACCOUNT_JSON/);
  assert.match(update, /toris-play-uploader@toris-play-uploader\.iam\.gserviceaccount\.com/);
  assert.doesNotMatch(update, /senior-club-play-uploader@clubsenior-app\.iam\.gserviceaccount\.com/);
  assert.ok(workflow.indexOf(update) < workflow.indexOf('      - name: Build Play production AAB'));
  const submit = getStep('Submit the exact published app update');
  assert.match(submit, /success\(\).*inputs\.binary_update/);
  assert.match(submit, /--id "\$EAS_BUILD_ID"/);
  assert.match(submit, /--profile productionUpdate/);
  assert.equal(easConfig.submit.productionUpdate.android.releaseStatus, 'completed');
  assert.equal(easConfig.submit.productionUpdate.android.track, 'production');
  assert.equal(easConfig.submit.productionUpdate.android.serviceAccountKeyPath, '/tmp/senior-club-play-service-account.json');
  assert.match(getStep('Remove temporary release configuration'), /rm -f -- \/tmp\/senior-club-play-service-account\.json/);
});

test('raw build JSON and validated evidence are retained as a workflow artifact', () => {
  assert.match(workflow, /eas-build-result\.json/);
  assert.match(workflow, /validated-build\.json/);
  // The gate is that evidence is uploaded and retained, not which major of
  // upload-artifact does it; pinning the major here only breaks action bumps.
  assert.match(workflow, /actions\/upload-artifact@v\d+/);
  assert.match(workflow, /retention-days: 30/);
  assert.equal(workflow.includes('\t'), false);
});

test('binary updates validate live endpoints and create evidence before building', () => {
  const validation = getStep('Validate published app update');
  assert.match(validation, /if: \$\{\{ inputs\.binary_update \}\}/);
  assert.match(validation, /mkdir -p "\$EVIDENCE_DIR"/);
  assert.match(validation, /pnpm validate:play/);
  assert.match(validation, /pnpm validate:manifest/);
  assert.match(validation, /node scripts\/validate-release-endpoints\.mjs/);
  assert.match(validation, /source-commit\.txt/);
  assert.ok(workflow.indexOf(validation) < workflow.indexOf('      - name: Build Play production AAB'));
});
