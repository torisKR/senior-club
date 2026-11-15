import type { ConfigContext, ExpoConfig } from 'expo/config';
import { AndroidConfig, withAndroidManifest, withDangerousMod } from 'expo/config-plugins';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const GOOGLE_ANDROID_TEST_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const PRODUCTION_ADMOB_ANDROID_APP_ID = 'ca-app-pub-3004906966180197~9575830978';
const ADMOB_APP_ID = /^ca-app-pub-\d{16}~\d{10}$/;
const WORK_DATABASE_KEEP_RULE = '-keep class androidx.work.impl.WorkDatabase_Impl { public <init>(); }';

// Room creates this generated database through reflection during Android startup.
const withWorkDatabaseKeepRule = (config: ExpoConfig) => withDangerousMod(config, ['android', async (mod) => {
  const path = join(mod.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
  const contents = await readFile(path, 'utf8');
  if (!contents.includes(WORK_DATABASE_KEEP_RULE)) {
    await writeFile(path, `${contents.trimEnd()}\n\n${WORK_DATABASE_KEEP_RULE}\n`);
  }
  return mod;
}]);

// A Play purchase may open a banking app; singleTask can cancel that flow.
const withBillingSafeActivity = (config: ExpoConfig) => withAndroidManifest(config, (mod) => {
  const activity = AndroidConfig.Manifest.getMainActivityOrThrow(mod.modResults);
  activity.$['android:launchMode'] = 'singleTop';
  return mod;
});

function configuredAndroidAppId(): string {
  const candidate = process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID?.trim() || PRODUCTION_ADMOB_ANDROID_APP_ID;
  const isProduction = process.env.EXPO_PUBLIC_APP_ENV === 'production';

  if (candidate && ADMOB_APP_ID.test(candidate)) {
    return candidate;
  }

  if (isProduction) {
    throw new Error(
      'A production build requires EXPO_PUBLIC_ADMOB_ANDROID_APP_ID in ca-app-pub-…~… format.',
    );
  }

  return GOOGLE_ANDROID_TEST_APP_ID;
}

function googleServicesFile(): string | undefined {
  const path = process.env.GOOGLE_SERVICES_JSON?.trim();
  if (path?.includes('\0')) {
    throw new Error('GOOGLE_SERVICES_JSON 경로가 유효하지 않습니다.');
  }
  return path || undefined;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const servicesFile = googleServicesFile();
  const versionCode = process.env.ANDROID_VERSION_CODE;
  if (versionCode !== undefined && (!/^[1-9][0-9]*$/.test(versionCode) || Number(versionCode) > 2100000000)) {
    throw new Error('ANDROID_VERSION_CODE must be a positive Android version code.');
  }

  return {
    ...config,
    android: {
      ...config.android,
      ...(versionCode ? { versionCode: Number(versionCode) } : {}),
      ...(servicesFile ? { googleServicesFile: servicesFile } : {}),
    },
    plugins: [
      ...(config.plugins ?? []),
      withBillingSafeActivity,
      withWorkDatabaseKeepRule,
      '@react-native-firebase/app',
      'expo-iap',
      [
        'react-native-google-mobile-ads',
        {
          androidAppId: configuredAndroidAppId(),
          delayAppMeasurementInit: true,
        },
      ],
    ],
  } as ExpoConfig;
};
