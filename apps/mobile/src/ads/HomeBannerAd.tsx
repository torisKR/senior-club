import { useIsFocused } from 'expo-router';
import { useState } from 'react';
import { Platform, View, useWindowDimensions } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAdsAllowed } from '@/billing/BillingProvider';
import { AppText } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { useAds } from './AdsProvider';
import { resolveAndroidBannerId } from './config';

export function HomeBannerAd(): React.ReactElement | null {
  const { canRequestAds } = useAds();
  const adsAllowed = useAdsAllowed();
  const { width, height } = useWindowDimensions();
  const { left, right } = useSafeAreaInsets();
  const focused = useIsFocused();
  const unitId = resolveAndroidBannerId({
    configuredId: process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID,
    isDevelopment: __DEV__,
  });

  if (Platform.OS !== 'android' || !focused || !adsAllowed || !canRequestAds || unitId === null) {
    return null;
  }

  return (
    <MeasuredBanner
      // Re-measure before requesting after rotation, even if the content's max width is unchanged.
      key={`${unitId}:${width}:${height}:${left}:${right}`}
      unitId={unitId}
      viewportWidth={width}
      leftInset={left}
      rightInset={right}
    />
  );
}

function MeasuredBanner({
  unitId,
  viewportWidth,
  leftInset,
  rightInset,
}: {
  unitId: string;
  viewportWidth: number;
  leftInset: number;
  rightInset: number;
}): React.ReactElement {
  const [containerWidth, setContainerWidth] = useState(0);
  // Layout widths and the SDK's adaptive width prop both use density-independent units.
  const bannerWidth = Math.floor(Math.min(containerWidth, viewportWidth) - leftInset - rightInset);

  return (
    <View
      accessible={false}
      testID="home-banner-ad-container"
      onLayout={({ nativeEvent }) => setContainerWidth(nativeEvent.layout.width)}
      style={{ width: '100%', minWidth: 0, paddingLeft: leftInset, paddingRight: rightInset }}>
      {bannerWidth > 0 ? (
        <BannerContent key={`${unitId}:${bannerWidth}`} unitId={unitId} width={bannerWidth} />
      ) : null}
    </View>
  );
}

function BannerContent({ unitId, width }: { unitId: string; width: number }): React.ReactElement | null {
  const theme = useTheme();
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <View
      accessible={false}
      testID="home-banner-ad"
      style={{
        alignItems: 'center',
        gap: Spacing.sm,
        paddingVertical: Spacing.md,
        borderRadius: Radius.md,
        backgroundColor: theme.backgroundElement,
      }}>
      <AppText variant="caption" color="textSecondary" align="center" selectable={false}>
        광고
      </AppText>
      <BannerAd
        unitId={unitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        width={width}
        onAdFailedToLoad={() => setFailed(true)}
      />
    </View>
  );
}
