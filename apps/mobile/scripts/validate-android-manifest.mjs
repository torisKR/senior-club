import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import releaseApiUrl from '../src/config/release-api-url.js';

const { getReleaseApiUrlViolation } = releaseApiUrl;

const root = path.resolve(import.meta.dirname, '..');
const expoCli = path.join(root, 'node_modules', 'expo', 'bin', 'cli');
const expectedPackage = 'com.toris.seniorclub';
const expectedActivePermissions = new Set([
  'android.permission.INTERNET',
  'android.permission.VIBRATE',
]);
const expectedExportedComponents = new Set([
  'activity:.MainActivity',
  'activity:com.kakao.sdk.auth.AuthCodeHandlerActivity',
]);

let failureCount = 0;

function fail(message) {
  failureCount += 1;
  console.error(`FAIL ${message}`);
}

function pass(message) {
  console.log(`PASS ${message}`);
}

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function attributes(node) {
  return node?.$ ?? {};
}

function childAttributeValues(node, childName, attributeName) {
  return asArray(node?.[childName])
    .map((child) => attributes(child)[attributeName])
    .filter((value) => typeof value === 'string');
}

function isViewBrowsableFilter(intentFilter) {
  const actions = childAttributeValues(intentFilter, 'action', 'android:name');
  const categories = childAttributeValues(intentFilter, 'category', 'android:name');
  return (
    actions.includes('android.intent.action.VIEW') &&
    categories.includes('android.intent.category.DEFAULT') &&
    categories.includes('android.intent.category.BROWSABLE')
  );
}

function readIntrospectedConfig() {
  if (!fs.existsSync(expoCli)) {
    throw new Error('Expo CLI가 없습니다. apps/mobile에서 의존성을 먼저 설치하세요.');
  }

  const result = spawnSync(process.execPath, [expoCli, 'config', '--type', 'introspect', '--json'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, CI: '1' },
    maxBuffer: 20 * 1024 * 1024,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Expo Android manifest 생성에 실패했습니다.\n${result.stderr.trim() || result.stdout.trim()}`,
    );
  }

  try {
    return JSON.parse(result.stdout.trim());
  } catch {
    throw new Error('Expo introspection 결과를 JSON으로 해석할 수 없습니다.');
  }
}

function validateProductionFcmClient(config) {
  if (process.env.EXPO_PUBLIC_APP_ENV !== 'production') {
    pass('개발 검증에서는 Firebase Android client file 검사를 건너뜁니다.');
    return;
  }

  const configuredPath = config.android?.googleServicesFile;
  if (typeof configuredPath !== 'string' || configuredPath.trim().length === 0) {
    fail('production 빌드에는 EAS file secret GOOGLE_SERVICES_JSON이 필요합니다.');
    return;
  }

  const absolutePath = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(root, configuredPath);
  let document;
  try {
    const stats = fs.statSync(absolutePath);
    if (!stats.isFile() || stats.size === 0 || stats.size > 1_048_576) {
      fail('GOOGLE_SERVICES_JSON은 1MB 이하의 비어 있지 않은 파일이어야 합니다.');
      return;
    }
    document = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  } catch {
    fail('GOOGLE_SERVICES_JSON 파일을 읽거나 JSON으로 해석할 수 없습니다.');
    return;
  }

  if (document?.type === 'service_account' || typeof document?.private_key === 'string') {
    fail('Firebase Admin 서비스 계정이 아니라 Android client google-services.json을 사용해야 합니다.');
    return;
  }

  const androidClients = asArray(document?.client).filter(
    (client) =>
      client?.client_info?.android_client_info?.package_name === expectedPackage &&
      typeof client?.client_info?.mobilesdk_app_id === 'string' &&
      client.client_info.mobilesdk_app_id.length > 0,
  );
  if (
    typeof document?.project_info?.project_number !== 'string' ||
    document.project_info.project_number.length === 0 ||
    androidClients.length === 0
  ) {
    fail(`GOOGLE_SERVICES_JSON에 ${expectedPackage} Android client가 없습니다.`);
    return;
  }

  pass(`production Firebase Android client=${expectedPackage}`);
}

function validateReleaseApiUrl() {
  const appEnvironment = process.env.EXPO_PUBLIC_APP_ENV;
  if (appEnvironment !== 'preview' && appEnvironment !== 'production') {
    pass('개발 검증에서는 release API URL 검사를 건너뜁니다.');
    return;
  }

  const candidate = process.env.EXPO_PUBLIC_API_URL?.trim();
  let apiUrl;
  try {
    apiUrl = candidate ? new URL(candidate) : null;
  } catch {
    apiUrl = null;
  }
  const releaseUrlViolation = apiUrl ? getReleaseApiUrlViolation(apiUrl) : null;
  if (!apiUrl || releaseUrlViolation) {
    fail(
      `${appEnvironment} 빌드에는 공개 HTTPS EXPO_PUBLIC_API_URL이 필요합니다.${
        releaseUrlViolation ? ` (${releaseUrlViolation})` : ''
      }`,
    );
    return;
  }

  pass(`${appEnvironment} API origin=${apiUrl.origin}`);
}

let config;
try {
  config = readIntrospectedConfig();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const manifest = config?._internal?.modResults?.android?.manifest?.manifest;
if (!manifest) {
  fail('Expo introspection 결과에 AndroidManifest가 없습니다.');
  process.exit(1);
}

validateReleaseApiUrl();
validateProductionFcmClient(config);

const manifestAttributes = attributes(manifest);
const configuredPackage = config.android?.package;
const manifestPackage = manifestAttributes.package;
if (configuredPackage !== expectedPackage) {
  fail(
    `Android package가 일치하지 않습니다: config=${String(configuredPackage)}, expected=${expectedPackage}`,
  );
} else if (typeof manifestPackage === 'string' && manifestPackage !== expectedPackage) {
  fail(`Android manifest package가 일치하지 않습니다: ${manifestPackage}`);
} else {
  pass(
    manifestPackage
      ? `Android package=${expectedPackage}`
      : `Android package=${expectedPackage} (Expo config; modern Gradle namespace)`,
  );
}

const permissionNodes = asArray(manifest['uses-permission']);
const activePermissions = permissionNodes
  .filter((permission) => attributes(permission)['tools:node'] !== 'remove')
  .map((permission) => attributes(permission)['android:name'])
  .filter((permission) => typeof permission === 'string')
  .sort();
const unexpectedPermissions = activePermissions.filter(
  (permission) => !expectedActivePermissions.has(permission),
);
const missingPermissions = [...expectedActivePermissions].filter(
  (permission) => !activePermissions.includes(permission),
);

if (unexpectedPermissions.length === 0 && missingPermissions.length === 0) {
  pass(`활성 Android 권한: ${activePermissions.join(', ')}`);
} else {
  if (unexpectedPermissions.length > 0) {
    fail(`검토되지 않은 활성 Android 권한: ${unexpectedPermissions.join(', ')}`);
  }
  if (missingPermissions.length > 0) {
    fail(`예상 Android 권한 누락: ${missingPermissions.join(', ')}`);
  }
}

const blockedPermissions = asArray(config.android?.blockedPermissions);
const removeMarkedPermissions = new Set(
  permissionNodes
    .filter((permission) => attributes(permission)['tools:node'] === 'remove')
    .map((permission) => attributes(permission)['android:name']),
);
const blockedPermissionsWithoutRemoveMarker = blockedPermissions.filter(
  (permission) => !removeMarkedPermissions.has(permission),
);
if (blockedPermissionsWithoutRemoveMarker.length === 0) {
  pass(`차단 Android 권한 remove marker: ${blockedPermissions.length}개`);
} else {
  fail(
    `차단 권한의 manifest remove marker 누락: ${blockedPermissionsWithoutRemoveMarker.join(', ')}`,
  );
}

const applicationNodes = asArray(manifest.application);
if (applicationNodes.length !== 1) {
  fail(`application 노드는 1개여야 합니다: ${applicationNodes.length}개`);
}
const application = applicationNodes[0];
const applicationAttributes = attributes(application);

if (applicationAttributes['android:allowBackup'] === 'false') {
  pass('android:allowBackup=false');
} else {
  fail('android:allowBackup는 false여야 합니다.');
}
if (applicationAttributes['android:debuggable'] === 'true') {
  fail('릴리스 manifest에 android:debuggable=true를 허용할 수 없습니다.');
} else {
  pass('android:debuggable=true 없음');
}
if (applicationAttributes['android:usesCleartextTraffic'] === 'true') {
  fail('릴리스 manifest에 평문 HTTP 트래픽 허용을 둘 수 없습니다.');
} else {
  pass('android:usesCleartextTraffic=true 없음');
}

const exportedComponents = [];
for (const componentType of ['activity', 'activity-alias', 'service', 'receiver', 'provider']) {
  for (const component of asArray(application?.[componentType])) {
    const componentAttributes = attributes(component);
    if (componentAttributes['android:exported'] === 'true') {
      exportedComponents.push({
        type: componentType,
        name: componentAttributes['android:name'],
      });
    }
  }
}

const exportedComponentKeys = exportedComponents.map(
  ({ type, name }) => `${type}:${String(name)}`,
);
if (
  exportedComponentKeys.length === expectedExportedComponents.size &&
  exportedComponentKeys.every((component) => expectedExportedComponents.has(component))
) {
  pass('외부 공개 컴포넌트: MainActivity와 Kakao 인증 콜백만 허용');
} else {
  fail(
    `예상하지 않은 외부 공개 컴포넌트: ${exportedComponentKeys.join(', ') || '없음'}`,
  );
}

const mainActivity = asArray(application?.activity).find(
  (activity) => attributes(activity)['android:name'] === '.MainActivity',
);
if (!mainActivity) {
  fail('.MainActivity를 찾을 수 없습니다.');
} else {
  const mainAttributes = attributes(mainActivity);
  if (mainAttributes['android:launchMode'] === 'singleTask') {
    pass('.MainActivity launchMode=singleTask');
  } else {
    fail('.MainActivity는 deep link 중복 인스턴스를 막기 위해 launchMode=singleTask여야 합니다.');
  }
  if (mainAttributes['android:screenOrientation'] === 'portrait') {
    pass('.MainActivity screenOrientation=portrait');
  } else {
    fail('.MainActivity screenOrientation가 app.json 설정과 일치하지 않습니다.');
  }
}

const intentFilters = asArray(mainActivity?.['intent-filter']);
const launcherFilters = intentFilters.filter((intentFilter) => {
  const actions = childAttributeValues(intentFilter, 'action', 'android:name');
  const categories = childAttributeValues(intentFilter, 'category', 'android:name');
  return (
    actions.includes('android.intent.action.MAIN') &&
    categories.includes('android.intent.category.LAUNCHER')
  );
});
const deepLinkFilters = intentFilters.filter(isViewBrowsableFilter);
const expectedScheme = config.scheme;

if (launcherFilters.length === 1) {
  pass('MAIN/LAUNCHER intent-filter 1개');
} else {
  fail(`MAIN/LAUNCHER intent-filter는 정확히 1개여야 합니다: ${launcherFilters.length}개`);
}

if (typeof expectedScheme !== 'string' || !/^[a-z][a-z0-9+.-]*$/.test(expectedScheme)) {
  fail(`app.json scheme이 유효하지 않습니다: ${String(expectedScheme)}`);
} else if (['http', 'https', 'exp', 'exps'].includes(expectedScheme)) {
  fail(`예약되거나 안전하지 않은 app scheme입니다: ${expectedScheme}`);
} else {
  pass(`app scheme=${expectedScheme}`);
}

if (deepLinkFilters.length !== 1) {
  fail(`BROWSABLE VIEW deep link intent-filter는 정확히 1개여야 합니다: ${deepLinkFilters.length}개`);
} else {
  const deepLinkFilter = deepLinkFilters[0];
  const dataNodes = asArray(deepLinkFilter.data);
  const schemes = dataNodes
    .map((data) => attributes(data)['android:scheme'])
    .filter((scheme) => typeof scheme === 'string');
  const unexpectedDataAttributes = dataNodes.flatMap((data) =>
    Object.keys(attributes(data)).filter((key) => key !== 'android:scheme'),
  );

  if (schemes.length === 1 && schemes[0] === expectedScheme) {
    pass(`deep link intent-filter=${expectedScheme}://`);
  } else {
    fail(`deep link scheme이 app.json과 일치하지 않습니다: ${schemes.join(', ') || '없음'}`);
  }
  if (schemes.some((scheme) => scheme === 'http' || scheme === 'https')) {
    fail('검증되지 않은 HTTP(S) App Link intent-filter를 허용할 수 없습니다.');
  }
  if (unexpectedDataAttributes.length > 0) {
    fail(`검토되지 않은 deep link data 속성: ${[...new Set(unexpectedDataAttributes)].join(', ')}`);
  }
  if (attributes(deepLinkFilter)['android:autoVerify'] === 'true') {
    fail('assetlinks.json 검증 없이 android:autoVerify=true를 사용할 수 없습니다.');
  } else {
    pass('검증되지 않은 autoVerify App Link 없음');
  }
}

if (failureCount > 0) {
  console.error(`\nExpo Android manifest 검증 실패 (${failureCount}건).`);
  process.exitCode = 1;
} else {
  console.log('\nExpo Android manifest 검증 통과.');
  console.log('최종 AAB 업로드 전에는 Play App Bundle Explorer의 병합 manifest도 다시 확인하세요.');
}
