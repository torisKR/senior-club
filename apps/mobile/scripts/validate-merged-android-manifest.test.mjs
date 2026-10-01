import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { validateMergedAndroidManifest } from './validate-merged-android-manifest.mjs';

const config = {
  android: { package: 'com.toris.seniorclub' },
  scheme: 'clubsenior',
  extra: { kakaoNativeAppKey: 'a'.repeat(32) },
};
const validate = (xml) => validateMergedAndroidManifest(xml, { expoConfig: config });
const validManifest = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.toris.seniorclub">
  <uses-sdk android:minSdkVersion="24" android:targetSdkVersion="36" />
  <uses-permission android:name="android.permission.INTERNET" />
  <uses-permission android:name="android.permission.VIBRATE" />
  <uses-permission android:name="com.android.vending.BILLING" />
  <uses-permission android:name="com.toris.seniorclub.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION" />
  <permission android:name="com.toris.seniorclub.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION" android:protectionLevel="signature" />
  <application android:allowBackup="false">
    <activity android:name=".MainActivity" android:exported="true" android:launchMode="singleTask">
      <intent-filter><action android:name="android.intent.action.MAIN" /><category android:name="android.intent.category.LAUNCHER" /></intent-filter>
      <intent-filter><action android:name="android.intent.action.VIEW" /><category android:name="android.intent.category.DEFAULT" /><category android:name="android.intent.category.BROWSABLE" /><data android:scheme="clubsenior" /></intent-filter>
    </activity>
    <activity android:name="com.kakao.sdk.auth.AuthCodeHandlerActivity" android:exported="true" android:launchMode="singleTask">
      <intent-filter><action android:name="android.intent.action.VIEW" /><category android:name="android.intent.category.DEFAULT" /><category android:name="android.intent.category.BROWSABLE" /><data android:scheme="kakao${'a'.repeat(32)}" android:host="oauth" /></intent-filter>
    </activity>
    <activity android:name="com.google.firebase.auth.internal.GenericIdpActivity" android:exported="true" android:launchMode="singleTask">
      <intent-filter><action android:name="android.intent.action.VIEW" /><category android:name="android.intent.category.DEFAULT" /><category android:name="android.intent.category.BROWSABLE" /><data android:scheme="genericidp" android:host="firebase.auth" android:path="/" /></intent-filter>
    </activity>
    <activity android:name="com.google.firebase.auth.internal.RecaptchaActivity" android:exported="true" android:launchMode="singleTask">
      <intent-filter><action android:name="android.intent.action.VIEW" /><category android:name="android.intent.category.DEFAULT" /><category android:name="android.intent.category.BROWSABLE" /><data android:scheme="recaptcha" android:host="firebase.auth" android:path="/" /></intent-filter>
    </activity>
    <service android:name="com.google.android.gms.auth.api.signin.RevocationBoundService" android:exported="true" android:permission="com.google.android.gms.auth.api.signin.permission.REVOCATION_NOTIFICATION" />
    <service android:name="androidx.work.impl.background.systemjob.SystemJobService" android:exported="true" android:permission="android.permission.BIND_JOB_SERVICE" />
    <receiver android:name="com.amazon.device.iap.ResponseReceiver" android:exported="true" android:permission="com.amazon.inapp.purchasing.Permission.NOTIFY">
      <intent-filter><action android:name="com.amazon.inapp.purchasing.NOTIFY" /></intent-filter>
    </receiver>
    <receiver android:name="com.google.firebase.iid.FirebaseInstanceIdReceiver" android:exported="true" android:permission="com.google.android.c2dm.permission.SEND">
      <intent-filter><action android:name="com.google.android.c2dm.intent.RECEIVE" /></intent-filter>
    </receiver>
    <receiver android:name="androidx.work.impl.diagnostics.DiagnosticsReceiver" android:exported="true" android:permission="android.permission.DUMP">
      <intent-filter><action android:name="androidx.work.diagnostics.REQUEST_DIAGNOSTICS" /></intent-filter>
    </receiver>
    <receiver android:name="androidx.profileinstaller.ProfileInstallReceiver" android:exported="true" android:permission="android.permission.DUMP">
      <intent-filter><action android:name="androidx.profileinstaller.action.INSTALL_PROFILE" /></intent-filter>
      <intent-filter><action android:name="androidx.profileinstaller.action.SKIP_FILE" /></intent-filter>
      <intent-filter><action android:name="androidx.profileinstaller.action.SAVE_PROFILE" /></intent-filter>
      <intent-filter><action android:name="androidx.profileinstaller.action.BENCHMARK_OPERATION" /></intent-filter>
    </receiver>
    <provider android:name="com.example.InternalProvider" android:authorities="com.toris.seniorclub.internal" />
    <service android:name="com.example.InternalService" android:exported="false" />
  </application>
</manifest>`;

function changeComponent(name, rewrite, xml = validManifest) {
  const nameIndex = xml.indexOf(`android:name="${name}"`);
  assert.ok(nameIndex >= 0);
  const start = xml.lastIndexOf('<', nameIndex);
  const tag = xml.slice(start).match(/^<([\w-]+)/)[1];
  const openingEnd = xml.indexOf('>', nameIndex) + 1;
  const end = xml[openingEnd - 2] === '/' ? openingEnd : xml.indexOf(`</${tag}>`, openingEnd) + tag.length + 3;
  return xml.slice(0, start) + rewrite(xml.slice(start, end)) + xml.slice(end);
}

test('merged contracts accept the necessary Firebase callbacks and protected SDK components', async () => {
  const result = await validate(validManifest);
  assert.equal(result.permissions.length, 4);
  assert.equal(result.exportedComponents.length, 10);
  assert.ok(result.exportedComponents.includes('activity:com.google.firebase.auth.internal.RecaptchaActivity'));
  assert.ok(result.exportedComponents.includes('activity:com.google.firebase.auth.internal.GenericIdpActivity'));
});

test('actual AAB enum encodings preserve the exact signature and singleTask contracts', async () => {
  for (const numeric of ['2', '0x00000002']) {
    const xml = validManifest.replace('android:protectionLevel="signature"', `android:protectionLevel="${numeric}"`)
      .replaceAll('android:launchMode="singleTask"', `android:launchMode="${numeric}"`);
    const result = await validate(xml);
    assert.equal(result.exportedComponents.length, 10);
  }
});

test('numeric aliases cannot weaken signature permissions or activity launch contracts', async () => {
  for (const numeric of ['0', '1', '3', '0x00000012', '4294967298', '-2', '2x', '2.0']) {
    await assert.rejects(validate(validManifest.replace('android:protectionLevel="signature"', `android:protectionLevel="${numeric}"`)), /weakened permission/);
    await assert.rejects(validate(changeComponent('.MainActivity', (node) => node.replace('android:launchMode="singleTask"', `android:launchMode="${numeric}"`))), /Launch mode contract mismatch/);
  }
});

test('an unmerged app-only manifest cannot pass as compiled SDK evidence', async () => {
  let appOnly = validManifest;
  for (const name of [
    'com.google.firebase.auth.internal.GenericIdpActivity',
    'com.google.firebase.auth.internal.RecaptchaActivity',
    'com.google.android.gms.auth.api.signin.RevocationBoundService',
    'androidx.work.impl.background.systemjob.SystemJobService',
    'com.amazon.device.iap.ResponseReceiver',
    'com.google.firebase.iid.FirebaseInstanceIdReceiver',
    'androidx.work.impl.diagnostics.DiagnosticsReceiver',
    'androidx.profileinstaller.ProfileInstallReceiver',
  ]) appOnly = changeComponent(name, () => '', appOnly);
  await assert.rejects(validate(appOnly), /Required merged SDK\/app component missing/);
});

const forbiddenFamilies = {
  camera: ['CAMERA'],
  contacts: ['READ_CONTACTS', 'WRITE_CONTACTS', 'GET_ACCOUNTS'],
  location: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'ACCESS_BACKGROUND_LOCATION', 'ACCESS_LOCATION_EXTRA_COMMANDS'],
  storage: ['READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'MANAGE_EXTERNAL_STORAGE', 'MANAGE_MEDIA', 'READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO', 'READ_MEDIA_VISUAL_USER_SELECTED'],
  sms: ['READ_SMS', 'SEND_SMS', 'RECEIVE_SMS', 'RECEIVE_MMS', 'RECEIVE_WAP_PUSH'],
  audio: ['RECORD_AUDIO', 'READ_MEDIA_AUDIO', 'CAPTURE_AUDIO_OUTPUT'],
};
for (const [family, permissions] of Object.entries(forbiddenFamilies)) {
  test(`rejects ${family} permissions, including SDK-conditional and maxSdk declarations`, async () => {
    for (const permission of permissions) {
      for (const tag of ['uses-permission', 'uses-permission-sdk-23', 'uses-permission-sdk-m']) {
        const xml = validManifest.replace('<application ', `<${tag} android:name="android.permission.${permission}" android:maxSdkVersion="32" /><application `);
        await assert.rejects(validate(xml), /Unreviewed or prohibited permission/);
      }
    }
  });
}

test('rejects unknown permissions, including familiar SDK and badge prefixes', async () => {
  for (const name of ['android.permission.QUERY_ALL_PACKAGES', 'com.google.android.gms.permission.UNKNOWN', 'com.huawei.android.launcher.permission.UNKNOWN']) {
    await assert.rejects(validate(validManifest.replace('<application ', `<uses-permission android:name="${name}" /><application `)), /Unreviewed or prohibited permission/);
  }
});

for (const name of ['.MainActivity', 'com.kakao.sdk.auth.AuthCodeHandlerActivity', 'com.google.firebase.auth.internal.GenericIdpActivity', 'com.google.firebase.auth.internal.RecaptchaActivity']) {
  test(`${name} requires its exact browser callback or launcher contract`, async () => {
    const mutations = [
      (node) => node.replace('android.intent.action.VIEW', 'android.intent.action.SEND'),
      (node) => node.replace('<category android:name="android.intent.category.BROWSABLE" />', ''),
      (node) => node.replace(/android:scheme="[^"]+"/, 'android:scheme="http"'),
      (node) => node.replace('<data ', '<data android:pathPrefix="/" '),
      (node) => node.replace('</activity>', '<intent-filter><action android:name="unreviewed" /></intent-filter></activity>'),
      (node) => node.replace('android:launchMode="singleTask"', 'android:launchMode="standard"'),
      (node) => node.replace('android:exported="true"', ''),
      (node) => node.replace('android:exported="true"', 'android:exported="false"'),
    ];
    if (name !== '.MainActivity') mutations.push((node) => node.replace(/android:host="[^"]+"/, 'android:host="*"'));
    if (name.includes('firebase')) mutations.push((node) => node.replace('android:path="/"', ''));
    for (const mutate of mutations) await assert.rejects(validate(changeComponent(name, mutate)), /contract mismatch|Required.*export/i);
  });
}

for (const name of [
  'com.google.android.gms.auth.api.signin.RevocationBoundService',
  'androidx.work.impl.background.systemjob.SystemJobService',
  'com.amazon.device.iap.ResponseReceiver',
  'com.google.firebase.iid.FirebaseInstanceIdReceiver',
  'androidx.work.impl.diagnostics.DiagnosticsReceiver',
  'androidx.profileinstaller.ProfileInstallReceiver',
]) {
  test(`${name} cannot lose or substitute its protecting permission`, async () => {
    for (const permission of ['', 'android.permission.INTERNET', 'com.example.permission.PRIVATE']) {
      const xml = changeComponent(name, (node) => node.replace(/android:permission="[^"]+"/, permission ? `android:permission="${permission}"` : ''));
      await assert.rejects(validate(xml), /Export permission contract mismatch/);
    }
    const extraIntent = changeComponent(name, (node) => node.endsWith('/>')
      ? node.replace('/>', '><intent-filter><action android:name="unreviewed" /></intent-filter></service>')
      : node.replace('</receiver>', '<intent-filter><action android:name="unreviewed" /></intent-filter></receiver>'));
    await assert.rejects(validate(extraIntent), /Intent contract mismatch/);
  });
}

test('rejects any unknown explicit export, even with a familiar SDK prefix or permission', async () => {
  for (const tag of ['activity', 'activity-alias', 'service', 'receiver', 'provider']) {
    for (const permission of ['', 'android:permission="android.permission.DUMP"']) {
      await assert.rejects(validate(validManifest.replace('</application>', `<${tag} android:name="com.google.firebase.Unreviewed" android:exported="true" ${permission} /></application>`)), /Unreviewed exported component/);
    }
  }
});

test('rejects implicit exports through filters when android:exported is omitted', async () => {
  for (const tag of ['activity', 'activity-alias', 'service', 'receiver']) {
    await assert.rejects(validate(validManifest.replace('</application>', `<${tag} android:name=".ImplicitExport"><intent-filter><action android:name="unreviewed" /></intent-filter></${tag}></application>`)), /Unreviewed exported component/);
  }
});

for (const name of ['allowBackup', 'debuggable', 'usesCleartextTraffic', 'testOnly']) {
  test(`rejects enabled or unresolved android:${name}`, async () => {
    for (const value of ['true', '@bool/unsafe']) {
      const appAttributes = name === 'allowBackup' ? `android:allowBackup="${value}"` : `android:allowBackup="false" android:${name}="${value}"`;
      await assert.rejects(validate(validManifest.replace('android:allowBackup="false"', appAttributes)), new RegExp(`android:${name}`));
    }
    if (name === 'allowBackup') await assert.rejects(validate(validManifest.replace('android:allowBackup="false"', '')), /android:allowBackup/);
  });
}

test('network security resources cannot silently override the manifest cleartext policy', async () => {
  await assert.rejects(validate(validManifest.replace('android:allowBackup="false"', 'android:allowBackup="false" android:networkSecurityConfig="@xml/network_security_config"')), /networkSecurityConfig/);
});

test('the AndroidX private receiver permission must stay signature protected', async () => {
  for (const level of ['normal', 'dangerous', '@string/protection']) {
    await assert.rejects(validate(validManifest.replace('android:protectionLevel="signature"', `android:protectionLevel="${level}"`)), /weakened permission declaration/);
  }
  await assert.rejects(validate(validManifest.replace(/<permission [^>]+\/>/, '')), /Missing signature permission/);
});

test('checks package identity, modern platform defaults, and singular application', async () => {
  await assert.rejects(validate(validManifest.replace('package="com.toris.seniorclub"', 'package="com.example.other"')), /Manifest package/);
  await assert.rejects(validate(validManifest.replace('android:targetSdkVersion="36"', 'android:targetSdkVersion="27"')), /uses-sdk/);
  await assert.rejects(validate(validManifest.replace('android:minSdkVersion="24"', 'android:minSdkVersion="16"')), /uses-sdk/);
  await assert.rejects(validate(validManifest.replace('</manifest>', '<application android:allowBackup="false" /></manifest>')), /exactly one application/);
});

test('parses Android attributes by namespace and rejects unnamespaced callback lookalikes', async () => {
  assert.equal((await validate(validManifest.replaceAll('android:', 'a:').replace('xmlns:android=', 'xmlns:a='))).exportedComponents.length, 10);
  await assert.rejects(validate(validManifest.replace('http://schemas.android.com/apk/res/android', 'https://example.com/fake')), /Unexpected attribute namespace/);
  await assert.rejects(validate(changeComponent('com.google.firebase.auth.internal.RecaptchaActivity', (node) => node.replace('android:scheme=', 'scheme='))), /Intent contract mismatch/);
});

test('malformed XML, entities, missing roots and duplicate components fail closed', async () => {
  for (const xml of ['{ "manifest": {} }', '<manifest>', '', validManifest.replace('<manifest ', '<!DOCTYPE manifest [<!ENTITY x "unsafe">]><manifest '), validManifest.replace('</application>', '<service android:name="com.example.InternalService" android:exported="false" /></application>')]) {
    await assert.rejects(validate(xml));
  }
});

test('does not accept the first valid root while ignoring trailing XML or text', async () => {
  for (const suffix of ['<other />', 'trailing text', '<!-- unclosed']) {
    await assert.rejects(validate(validManifest + suffix));
  }
});

test('duplicate attributes cannot hide a weaker flag or callback contract', async () => {
  await assert.rejects(validate(validManifest.replace('android:allowBackup="false"', 'android:allowBackup="false" android:allowBackup="true"')), /Duplicate XML attribute/);
  const aliased = validManifest.replace('xmlns:android=', 'xmlns:a="http://schemas.android.com/apk/res/android" xmlns:android=');
  await assert.rejects(validate(aliased.replace('android:allowBackup="false"', 'android:allowBackup="false" a:allowBackup="true"')), /Duplicate XML attribute/);
});

test('CLI requires a real merged file, reports actual counts, and fails when it is missing', () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'seniorclub-merged-manifest-'));
  try {
    const script = path.join(import.meta.dirname, 'validate-merged-android-manifest.mjs');
    const missing = spawnSync(process.execPath, [script, path.join(temporaryDirectory, 'missing.xml')], { encoding: 'utf8' });
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /Merged release manifest missing/);
    const currentConfig = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../app.json'), 'utf8')).expo;
    const manifestPath = path.join(temporaryDirectory, 'AndroidManifest.xml');
    fs.writeFileSync(manifestPath, validManifest.replace(`kakao${config.extra.kakaoNativeAppKey}`, `kakao${currentConfig.extra.kakaoNativeAppKey}`));
    const passed = spawnSync(process.execPath, [script, manifestPath], { encoding: 'utf8' });
    assert.equal(passed.status, 0, passed.stderr);
    assert.match(passed.stdout, /4 allowlisted permissions/);
    assert.match(passed.stdout, /10 exact exports/);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
