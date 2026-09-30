import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
export const defaultMergedManifestPath = path.join(
  root, 'android/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml',
);
const checkedInConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;

// Reuse Expo's installed XML parser; no dependency or lockfile changes are needed.
const require = createRequire(import.meta.url);
const expoRequire = createRequire(require.resolve('expo/package.json'));
const pluginsRequire = createRequire(expoRequire.resolve('@expo/config-plugins/package.json'));
const { parseStringPromise } = pluginsRequire('xml2js');
const xmlRequire = createRequire(pluginsRequire.resolve('xml2js'));
const sax = xmlRequire('sax');
const androidNamespace = 'http://schemas.android.com/apk/res/android';
const expectedPackage = 'com.toris.seniorclub';
const dynamicReceiverPermission = `${expectedPackage}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`;

// Exact merged permission allowlist, including dependencies absent from Expo introspection.
// New SDK permissions require explicit review here, even if Android calls them "normal".
export const allowedMergedPermissions = new Set([
  // App network access, haptics, and Play Billing.
  'android.permission.INTERNET',
  'android.permission.VIBRATE',
  'com.android.vending.BILLING',
  // Firebase/Expo notifications and WorkManager scheduling.
  'android.permission.WAKE_LOCK',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.POST_NOTIFICATIONS',
  'com.google.android.c2dm.permission.RECEIVE',
  'com.google.android.providers.gsf.permission.READ_GSERVICES',
  'android.permission.FOREGROUND_SERVICE',
  // Expo SecureStore biometric authentication and AndroidX private receivers.
  'android.permission.USE_BIOMETRIC',
  'android.permission.USE_FINGERPRINT',
  dynamicReceiverPermission,
  // Mobile Ads identifiers/attribution and Play install referrer.
  'com.google.android.gms.permission.AD_ID',
  'android.permission.ACCESS_ADSERVICES_AD_ID',
  'android.permission.ACCESS_ADSERVICES_ATTRIBUTION',
  'android.permission.ACCESS_ADSERVICES_TOPICS',
  'com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE',
  // Exact launcher badge permissions supplied by Expo notifications' badge SDK.
  'com.sec.android.provider.badge.permission.READ',
  'com.sec.android.provider.badge.permission.WRITE',
  'com.htc.launcher.permission.READ_SETTINGS',
  'com.htc.launcher.permission.UPDATE_SHORTCUT',
  'com.sonyericsson.home.permission.BROADCAST_BADGE',
  'com.sonymobile.home.permission.PROVIDER_INSERT_BADGE',
  'com.anddoes.launcher.permission.UPDATE_COUNT',
  'com.majeur.launcher.permission.UPDATE_BADGE',
  'com.huawei.android.launcher.permission.CHANGE_BADGE',
  'com.huawei.android.launcher.permission.READ_SETTINGS',
  'com.huawei.android.launcher.permission.WRITE_SETTINGS',
  'android.permission.READ_APP_BADGE',
  'com.oppo.launcher.permission.READ_SETTINGS',
  'com.oppo.launcher.permission.WRITE_SETTINGS',
  'me.everything.badger.permission.BADGE_COUNT_READ',
  'me.everything.badger.permission.BADGE_COUNT_WRITE',
]);

const requiredPermissions = ['android.permission.INTERNET', 'android.permission.VIBRATE', 'com.android.vending.BILLING'];
const viewAction = 'android.intent.action.VIEW';
const browserCategories = ['android.intent.category.DEFAULT', 'android.intent.category.BROWSABLE'];
const filter = (actions, categories = [], data = []) => ({ actions, categories, data });
const callback = (scheme, host, callbackPath) => filter([viewAction], browserCategories, [{
  scheme, ...(host ? { host } : {}), ...(callbackPath ? { path: callbackPath } : {}),
}]);

function exportContracts(config) {
  if (config?.android?.package !== expectedPackage || config.scheme !== 'clubsenior' ||
      !/^[a-f0-9]{32}$/i.test(config.extra?.kakaoNativeAppKey ?? '')) {
    throw new Error('Checked-in Expo package/scheme/Kakao callback configuration is invalid.');
  }
  // These are required exact components, not SDK package-prefix exemptions.
  return new Map([
    [`activity:${expectedPackage}.MainActivity`, {
      permission: undefined, launchMode: 'singleTask',
      filters: [filter(['android.intent.action.MAIN'], ['android.intent.category.LAUNCHER']), callback(config.scheme)],
    }],
    ['activity:com.kakao.sdk.auth.AuthCodeHandlerActivity', {
      permission: undefined, launchMode: 'singleTask',
      filters: [callback(`kakao${config.extra.kakaoNativeAppKey}`, 'oauth')],
    }],
    // Firebase Auth web redirects are necessary for IDP and phone reCAPTCHA callbacks.
    // They are intentionally unprotected activities with narrowly defined intent contracts.
    ['activity:com.google.firebase.auth.internal.GenericIdpActivity', {
      permission: undefined, launchMode: 'singleTask', filters: [callback('genericidp', 'firebase.auth', '/')],
    }],
    ['activity:com.google.firebase.auth.internal.RecaptchaActivity', {
      permission: undefined, launchMode: 'singleTask', filters: [callback('recaptcha', 'firebase.auth', '/')],
    }],
    // Only Play services may deliver account revocation notifications.
    ['service:com.google.android.gms.auth.api.signin.RevocationBoundService', {
      permission: 'com.google.android.gms.auth.api.signin.permission.REVOCATION_NOTIFICATION', filters: [],
    }],
    // Android's scheduler binds WorkManager jobs under a system-only permission.
    ['service:androidx.work.impl.background.systemjob.SystemJobService', {
      permission: 'android.permission.BIND_JOB_SERVICE', filters: [],
    }],
    // RevenueCat brings the Amazon billing receiver; only Amazon's notifier may call it.
    ['receiver:com.amazon.device.iap.ResponseReceiver', {
      permission: 'com.amazon.inapp.purchasing.Permission.NOTIFY',
      filters: [filter(['com.amazon.inapp.purchasing.NOTIFY'])],
    }],
    // Firebase's FCM receiver accepts messages only from the protected Google sender.
    ['receiver:com.google.firebase.iid.FirebaseInstanceIdReceiver', {
      permission: 'com.google.android.c2dm.permission.SEND',
      filters: [filter(['com.google.android.c2dm.intent.RECEIVE'])],
    }],
    // AndroidX diagnostic/profile broadcasts require the shell/system DUMP permission.
    ['receiver:androidx.work.impl.diagnostics.DiagnosticsReceiver', {
      permission: 'android.permission.DUMP', filters: [filter(['androidx.work.diagnostics.REQUEST_DIAGNOSTICS'])],
    }],
    ['receiver:androidx.profileinstaller.ProfileInstallReceiver', {
      permission: 'android.permission.DUMP',
      filters: ['INSTALL_PROFILE', 'SKIP_FILE', 'SAVE_PROFILE', 'BENCHMARK_OPERATION']
        .map((action) => filter([`androidx.profileinstaller.action.${action}`])),
    }],
  ]);
}

// Normalize by namespace URI, so a renamed XML prefix cannot hide Android attributes.
function normalizeNode(node) {
  if (node.$ns?.uri) throw new Error(`Unexpected element namespace: ${node.$ns.uri}`);
  const normalized = { $: {} };
  for (const attribute of Object.values(node.$ ?? {})) {
    if (attribute.uri === 'http://www.w3.org/2000/xmlns/') continue;
    if (attribute.uri && attribute.uri !== androidNamespace) {
      throw new Error(`Unexpected attribute namespace: ${attribute.name}`);
    }
    const name = attribute.uri === androidNamespace ? `android:${attribute.local}` : attribute.local;
    if (Object.hasOwn(normalized.$, name)) throw new Error(`Duplicate attribute: ${name}`);
    normalized.$[name] = attribute.value;
  }
  for (const [name, children] of Object.entries(node)) {
    if (name === '$' || name === '$ns' || name === '_') continue;
    normalized[name] = children.map(normalizeNode);
  }
  return normalized;
}

const attributes = (node) => node?.$ ?? {};
const sorted = (values) => [...values].sort();
const canonical = (value) => JSON.stringify(value, Object.keys(value).sort());

function filterSignature(intentFilter) {
  const unexpectedChildren = Object.keys(intentFilter).filter((name) => !['$', 'action', 'category', 'data'].includes(name));
  if (unexpectedChildren.length || Object.keys(attributes(intentFilter)).length) {
    throw new Error('Unreviewed intent-filter attributes or elements');
  }
  const names = (kind) => (intentFilter[kind] ?? []).map((node) => {
    const attrs = attributes(node);
    if (Object.keys(attrs).length !== 1 || !attrs['android:name']) throw new Error(`Invalid intent ${kind}`);
    return attrs['android:name'];
  });
  const data = (intentFilter.data ?? []).map((node) => {
    if (Object.keys(node).some((name) => !['$'].includes(name))) throw new Error('Unreviewed intent data elements');
    if (Object.keys(attributes(node)).some((name) => !name.startsWith('android:'))) throw new Error('Intent data requires Android namespaced attributes');
    return Object.fromEntries(Object.entries(attributes(node)).map(([name, value]) => [name.replace(/^android:/, ''), value]));
  });
  return JSON.stringify({ actions: sorted(names('action')), categories: sorted(names('category')), data: sorted(data.map(canonical)) });
}

function expectedFilterSignature(contract) {
  return JSON.stringify({ actions: sorted(contract.actions), categories: sorted(contract.categories), data: sorted(contract.data.map(canonical)) });
}

function qualifiedName(name, packageName) {
  if (!name) throw new Error('Component or permission has no android:name');
  return name.startsWith('.') ? `${packageName}${name}` : name.includes('.') ? name : `${packageName}.${name}`;
}

function assertWellFormedDocument(xml) {
  // xml2js resolves at the first root's closing tag and may ignore trailing errors.
  // Consume the entire document and reject duplicate expanded attribute names too.
  const parser = sax.parser(true, { xmlns: true });
  let depth = 0;
  let roots = 0;
  let attributeNames;
  parser.onerror = (error) => { throw error; };
  parser.onopentagstart = () => { attributeNames = new Set(); };
  parser.onattribute = (attribute) => {
    const name = `${attribute.uri}:${attribute.local}`;
    if (attributeNames.has(name)) throw new Error(`Duplicate XML attribute: ${attribute.name}`);
    attributeNames.add(name);
  };
  parser.onopentag = () => {
    if (depth === 0 && ++roots > 1) throw new Error('Expected exactly one XML root');
    depth += 1;
  };
  parser.onclosetag = () => { depth -= 1; };
  const checkText = (value) => { if (value.trim()) throw new Error('Unexpected text in manifest XML'); };
  parser.ontext = checkText;
  parser.oncdata = checkText;
  parser.write(xml).close();
  if (roots !== 1 || depth !== 0) throw new Error('Expected one complete XML document');
}

// bundletool's compiled AAB dump renders these Android enums as integers.
// Accept only the exact constant, including its hexadecimal representation;
// flags such as signature|privileged must not inherit the plain-signature gate.
// https://developer.android.com/reference/android/content/pm/PermissionInfo#PROTECTION_SIGNATURE
// https://developer.android.com/reference/android/content/pm/ActivityInfo#LAUNCH_SINGLE_TASK
function exactEnum(value, literal, numeric) {
  if (value === literal) return true;
  if (typeof value !== 'string' || !/^(?:\d+|0x[0-9a-fA-F]+)$/.test(value)) return false;
  return BigInt(value) === BigInt(numeric);
}

/** Validate compiled, merged XML. Expo introspection cannot substitute for this release gate. */
export async function validateMergedAndroidManifest(xml, { expoConfig = checkedInConfig } = {}) {
  if (typeof xml !== 'string' || Buffer.byteLength(xml) > 5 * 1024 * 1024 || /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) {
    throw new Error('Merged manifest must be XML under 5 MiB without DTD/entity declarations.');
  }
  assertWellFormedDocument(xml);
  const document = await parseStringPromise(xml, { xmlns: true, strict: true });
  if (!document?.manifest || Object.keys(document).length !== 1) throw new Error('Expected one manifest XML root.');
  const manifest = normalizeNode(document.manifest);
  const violations = [];
  const check = (valid, message) => { if (!valid) violations.push(message); };
  const contracts = exportContracts(expoConfig);
  check(attributes(manifest).package === expectedPackage, `Manifest package must be ${expectedPackage}`);

  const sdk = attributes(manifest['uses-sdk']?.[0]);
  check(manifest['uses-sdk']?.length === 1 && /^\d+$/.test(sdk['android:targetSdkVersion'] ?? '') &&
    Number(sdk['android:targetSdkVersion']) >= 28 && /^\d+$/.test(sdk['android:minSdkVersion'] ?? '') &&
    Number(sdk['android:minSdkVersion']) >= 17,
  'uses-sdk must establish modern cleartext and provider export defaults (target >= 28, min >= 17)');

  const permissionNodes = ['uses-permission', 'uses-permission-sdk-23', 'uses-permission-sdk-m']
    .flatMap((kind) => manifest[kind] ?? []);
  const permissions = new Set();
  const blocked = new Set(expoConfig.android.blockedPermissions ?? []);
  for (const node of permissionNodes) {
    const name = attributes(node)['android:name'];
    check(allowedMergedPermissions.has(name) && !blocked.has(name), `Unreviewed or prohibited permission: ${name}`);
    permissions.add(name);
  }
  for (const name of requiredPermissions) check(permissions.has(name), `Missing required permission: ${name}`);
  const declaredPermissions = new Set();
  for (const node of manifest.permission ?? []) {
    const attrs = attributes(node);
    const name = attrs['android:name'];
    check(!declaredPermissions.has(name), `Duplicate permission declaration: ${name}`);
    declaredPermissions.add(name);
    check(name === dynamicReceiverPermission && exactEnum(attrs['android:protectionLevel'], 'signature', 2),
      `Unreviewed or weakened permission declaration: ${name}`);
  }
  check(declaredPermissions.has(dynamicReceiverPermission), 'Missing signature permission for AndroidX private receivers');

  check(manifest.application?.length === 1, 'Expected exactly one application');
  const application = manifest.application?.[0];
  const appAttrs = attributes(application);
  check(appAttrs['android:allowBackup'] === 'false', 'android:allowBackup must be false');
  for (const name of ['debuggable', 'usesCleartextTraffic', 'testOnly']) {
    check(appAttrs[`android:${name}`] === undefined || appAttrs[`android:${name}`] === 'false',
      `android:${name} must be absent or false`);
  }
  check(appAttrs['android:networkSecurityConfig'] === undefined,
    'networkSecurityConfig requires separate resource review before allowing a cleartext override');
  check(appAttrs['android:permission'] === undefined, 'Unreviewed application-wide component permission');

  const seen = new Set();
  const exportedComponents = [];
  for (const kind of ['activity', 'activity-alias', 'service', 'receiver', 'provider']) {
    for (const node of application?.[kind] ?? []) {
      const attrs = attributes(node);
      const name = qualifiedName(attrs['android:name'], expectedPackage);
      const key = `${kind}:${name}`;
      check(!seen.has(key), `Duplicate component: ${key}`);
      seen.add(key);
      const exported = attrs['android:exported'];
      check(exported === undefined || ['true', 'false'].includes(exported), `Unresolved exported flag: ${key}`);
      // Activity/service/receiver filters historically imply export when the flag is absent.
      const isExported = exported === 'true' ||
        (exported === undefined && kind !== 'provider' && (node['intent-filter']?.length ?? 0) > 0);
      const contract = contracts.get(key);
      if (!isExported) {
        check(!contract, `Required export missing: ${key}`);
        continue;
      }
      exportedComponents.push(key);
      if (!contract) {
        check(false, `Unreviewed exported component: ${key} (permission=${attrs['android:permission'] ?? 'none'})`);
        continue;
      }
      check(exported === 'true', `Required explicit android:exported=true: ${key}`);
      check(attrs['android:permission'] === contract.permission, `Export permission contract mismatch: ${key}`);
      if (contract.launchMode) check(exactEnum(attrs['android:launchMode'], contract.launchMode, 2), `Launch mode contract mismatch: ${key}`);
      try {
        const actual = sorted((node['intent-filter'] ?? []).map(filterSignature));
        const expected = sorted(contract.filters.map(expectedFilterSignature));
        check(JSON.stringify(actual) === JSON.stringify(expected), `Intent contract mismatch: ${key}`);
      } catch (error) {
        check(false, `Intent contract mismatch: ${key}: ${error.message}`);
      }
    }
  }
  for (const key of contracts.keys()) check(seen.has(key), `Required merged SDK/app component missing: ${key}`);
  if (violations.length) throw new Error(violations.join('\n'));
  return { permissions: sorted(permissions), exportedComponents: sorted(exportedComponents) };
}

async function main() {
  if (process.argv.length > 3) throw new Error('Usage: node scripts/validate-merged-android-manifest.mjs [merged-release-AndroidManifest.xml]');
  const manifestPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultMergedManifestPath;
  if (!fs.existsSync(manifestPath)) throw new Error(`Merged release manifest missing: ${manifestPath}. Build/process the release manifest first; Expo introspection is not merged XML.`);
  const result = await validateMergedAndroidManifest(fs.readFileSync(manifestPath, 'utf8'));
  console.log(`PASS compiled merged release manifest: ${manifestPath}`);
  console.log(`PASS ${result.permissions.length} allowlisted permissions; backup/debug/cleartext disabled`);
  console.log(`PASS ${result.exportedComponents.length} exact exports: 4 intent-constrained activities and 6 permission-protected SDK components`);
  for (const component of result.exportedComponents) console.log(`PASS export contract ${component}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(`FAIL merged Android manifest: ${error.message}`); process.exitCode = 1; });
}
