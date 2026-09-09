import { useState } from 'react';
import { Platform, View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';

import { useAdsAllowed } from '@/billing/BillingProvider';
import { AppText } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { useAds } from './AdsProvider';
import { resolveAndroidBannerId } from './config';

export function HomeBannerAd(): React.ReactElement | null {
  const theme = useTheme();
  const { canRequestAds } = useAds();
  const adsAllowed = useAdsAllowed();
  const [failed, setFailed] = useState(false);
  const unitId = resolveAndroidBannerId({
    configuredId: process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID,
    isDevelopment: __DEV__,
  });

  if (Platform.OS !== 'android' || !adsAllowed || !canRequestAds || failed || unitId === null) {
    return null;
  }

  return (
    <View
      accessible
      accessibilityLabel="광고"
      testID="home-banner-ad"
      style={{
        alignItems: 'center',
        gap: Spacing.xs,
        paddingVertical: Spacing.sm,
        borderRadius: Radius.md,
        backgroundColor: theme.backgroundElement,
      }}>
      <AppText variant="caption" color="textMuted" accessibilityElementsHidden selectable={false}>
        광고
      </AppText>
      <BannerAd
        unitId={unitId}
        size={BannerAdSize.LARGE_ANCHORED_ADAPTIVE_BANNER}
        onAdFailedToLoad={() => setFailed(true)}
      />
    </View>
  );
}
