import type { ConfigContext, ExpoConfig } from 'expo/config';

const GOOGLE_ANDROID_TEST_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const GOOGLE_IOS_TEST_APP_ID = 'ca-app-pub-3940256099942544~1458002511';
const PRODUCTION_ADMOB_ANDROID_APP_ID = 'ca-app-pub-5744832247312120~3966489068';
const ADMOB_APP_ID = /^ca-app-pub-\d{16}~\d{10}$/;

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

function kakaoNativeAppKey(): string {
  const nativeAppKey = process.env.KAKAO_NATIVE_APP_KEY?.trim();
  if (!nativeAppKey || !/^[a-f0-9]{32}$/i.test(nativeAppKey)) {
    throw new Error('KAKAO_NATIVE_APP_KEY는 Kakao Developers의 32자리 네이티브 앱 키여야 합니다.');
  }
  return nativeAppKey;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const servicesFile = googleServicesFile();
  const nativeAppKey = kakaoNativeAppKey();
  const versionCode = process.env.ANDROID_VERSION_CODE;
  if (versionCode !== undefined && (!/^[1-9][0-9]*$/.test(versionCode) || Number(versionCode) > 2100000000)) {
    throw new Error('ANDROID_VERSION_CODE must be a positive Android version code.');
  }

  return {
    ...config,
    extra: {
      ...config.extra,
      kakaoNativeAppKey: nativeAppKey,
    },
    android: {
      ...config.android,
      ...(versionCode ? { versionCode: Number(versionCode) } : {}),
      ...(servicesFile ? { googleServicesFile: servicesFile } : {}),
    },
    plugins: [
      ...(config.plugins ?? []),
      [
        '@react-native-kakao/core',
        {
          nativeAppKey,
          android: {
            authCodeHandlerActivity: true,
          },
        },
      ],
      'expo-iap',
      [
        'react-native-google-mobile-ads',
        {
          androidAppId: configuredAndroidAppId(),
          delayAppMeasurementInit: true,
          iosAppId: GOOGLE_IOS_TEST_APP_ID,
        },
      ],
    ],
  } as ExpoConfig;
};
