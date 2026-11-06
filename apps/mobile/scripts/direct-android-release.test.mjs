import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { getExpoExportViolation } from './validate-android-exports.mjs';

for (const track of ['production', 'internal']) {
  test(`${track} uses a direct signed Gradle build, never EAS`, () => {
    const entry = fs.readFileSync(new URL(`../../../.github/workflows/android-play-${track}.yml`, import.meta.url), 'utf8');
    assert.doesNotMatch(entry, /eas-cli|EXPO_TOKEN/);
    const workflow = fs.readFileSync(new URL('../../../.github/workflows/android-play-production.yml', import.meta.url), 'utf8');
    assert.doesNotMatch(workflow, /eas-cli|EXPO_TOKEN|EAS_BUILD_ID/);
    assert.match(workflow, /expo prebuild --platform android --clean --no-install/);
    assert.match(workflow, /\.\/gradlew :app:bundleRelease --no-daemon/);
    assert.match(workflow, /ANDROID_UPLOAD_KEYSTORE_BASE64/);
    assert.match(workflow, /ANDROID_UPLOAD_CERT_SHA256/);
    assert.match(workflow, /direct-play-release.py validate/);
    assert.match(workflow, /direct-play-release.py upload/);
    assert.match(workflow, /group: android-play-release/);
    assert.match(workflow, /GITHUB_RUN_ATTEMPT.*1/);
  });
}

test('Expo manifest requires the launcher but not the retired Kakao callback', () => {
  const main = 'activity:.MainActivity';
  const legacy = 'activity:com.kakao.sdk.auth.AuthCodeHandlerActivity';
  assert.equal(getExpoExportViolation([main]), null);
  assert.equal(getExpoExportViolation([main, legacy]), null);
  assert.match(getExpoExportViolation([legacy]), /MainActivity/);
  assert.match(getExpoExportViolation([main, main]), /중복/);
  assert.match(getExpoExportViolation([main, 'activity:com.example.Unreviewed']), /예상하지 않은/);
});

test('production manifest does not depend on unused community origins and keeps native checks', () => {
  const mobileRoot = path.resolve(import.meta.dirname, '..');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'senior-club-manifest-test-'));
  const servicesFile = path.join(directory, 'google-services.json');
  const env = {
    ...process.env,
    CI: '1',
    EXPO_NO_DOTENV: '1',
    EXPO_PUBLIC_APP_ENV: 'production',
    KAKAO_NATIVE_APP_KEY: '0'.repeat(32), // Test fixture only; never an actual key.
    GOOGLE_SERVICES_JSON: servicesFile,
  };
  delete env.EXPO_PUBLIC_API_URL;
  delete env.EXPO_PUBLIC_WEB_URL;
  const run = (overrides = {}) => spawnSync(process.execPath, ['scripts/validate-android-manifest.mjs'], {
    cwd: mobileRoot,
    env: { ...env, ...overrides },
    encoding: 'utf8',
    timeout: 60_000,
  });

  try {
    fs.writeFileSync(servicesFile, JSON.stringify({
      project_info: { project_number: '123456789' },
      client: [{ client_info: { mobilesdk_app_id: 'fixture-app-id', android_client_info: { package_name: 'com.toris.seniorclub' } } }],
    }));
    for (const overrides of [{}, { EXPO_PUBLIC_API_URL: 'not-a-url', EXPO_PUBLIC_WEB_URL: 'not-a-url' }]) {
      const result = run(overrides);
      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
      assert.match(result.stdout, /production Firebase Android client=com\.toris\.seniorclub/);
      assert.match(result.stdout, /android:allowBackup=false/);
      assert.match(result.stdout, /활성 Android 권한/);
    }

    const linkedServices = path.join(directory, 'linked-services.json');
    fs.symlinkSync(servicesFile, linkedServices);
    const symlinkResult = run({ GOOGLE_SERVICES_JSON: linkedServices });
    assert.notEqual(symlinkResult.status, 0);
    assert.match(symlinkResult.stderr, /GOOGLE_SERVICES_JSON 파일을 읽거나 JSON으로 해석할 수 없습니다/);

    fs.writeFileSync(servicesFile, JSON.stringify({ type: 'service_account', private_key: 'fixture' }));
    const invalidServices = run();
    assert.notEqual(invalidServices.status, 0);
    assert.match(invalidServices.stderr, /서비스 계정/);

  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
