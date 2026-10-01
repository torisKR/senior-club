import { Image, type ImageProps } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Spacing } from '@/constants/theme';
import type { CoverImageSelection } from '@/data/image-assets';
import { useTheme } from '@/hooks/use-theme';

import { AppText } from './app-text';

export interface CoverImageProps {
  image: CoverImageSelection;
  accessibilityLabel: string;
  recyclingKey: string;
  aspectRatio?: number;
  style?: StyleProp<ViewStyle>;
  transition?: ImageProps['transition'];
}

export const CoverImageRatios = { hero: 16 / 9, card: 16 / 9, detail: 3 / 2 } as const;

export function CoverImage(props: CoverImageProps) {
  // Remount failure state for every item/source change, including A -> B -> A.
  // Delayed errors from an unmounted request cannot mark the new cover as failed.
  const identity = JSON.stringify([props.recyclingKey, props.image.sourceKey]);
  return <ResolvedCoverImage key={identity} {...props} recyclingKey={identity} />;
}

function ResolvedCoverImage({
  image,
  accessibilityLabel,
  recyclingKey,
  aspectRatio = CoverImageRatios.card,
  style,
  transition = 180,
}: CoverImageProps) {
  const theme = useTheme();
  const [failed, setFailed] = useState(false);
  const isReference = image.isReference || failed;

  return (
    <View style={{ width: '100%', minWidth: 0 }}>
      <View style={[
        { width: '100%', minWidth: 0, backgroundColor: theme.backgroundElement },
        style,
        // The slot owns its height. A caller's legacy height cannot stretch it.
        { aspectRatio, height: undefined, overflow: 'hidden' },
      ]}>
        <Image
          source={failed ? image.fallbackSource : image.source}
          accessible
          accessibilityRole="image"
          accessibilityLabel={isReference ? '시니어클럽 공용 주제 참고 이미지' : accessibilityLabel}
          cachePolicy="memory-disk"
          contentFit="cover"
          recyclingKey={`${recyclingKey}:${isReference ? 'reference' : 'supplied'}`}
          transition={transition}
          onError={isReference ? undefined : () => setFailed(true)}
          contentPosition="center"
          style={StyleSheet.absoluteFill}
        />
      </View>
      {isReference ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs }}>
          <AppText variant="caption" color="textSecondary" selectable={false} style={{ flexShrink: 1 }}>
            주제 참고 이미지
          </AppText>
        </View>
      ) : null}
    </View>
  );
}
