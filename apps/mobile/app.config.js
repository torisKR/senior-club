module.exports = ({ config }) => {
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON?.trim();
  const kakaoNativeAppKey = process.env.KAKAO_NATIVE_APP_KEY?.trim();
  if (googleServicesFile?.includes('\0')) {
    throw new Error('GOOGLE_SERVICES_JSON 경로가 유효하지 않습니다.');
  }
  if (!kakaoNativeAppKey || !/^[a-f0-9]{32}$/i.test(kakaoNativeAppKey)) {
    throw new Error('KAKAO_NATIVE_APP_KEY는 Kakao Developers의 32자리 네이티브 앱 키여야 합니다.');
  }

  return {
    ...config,
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
    plugins: [
      ...(config.plugins ?? []),
      [
        '@react-native-kakao/core',
        {
          nativeAppKey: kakaoNativeAppKey,
          android: { authCodeHandlerActivity: true },
        },
      ],
    ],
  };
};
