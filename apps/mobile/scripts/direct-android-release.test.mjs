import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

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
