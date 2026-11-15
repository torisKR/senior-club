import { Image } from 'expo-image';
import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

import { PixelBorder, PixelPalette } from './pixel-theme';

const CORNER = require('../../../assets/game/rpg/pixel/gameui/frame_corner.png');

/** 왼쪽 위 장식 한 장을 뒤집어 네 모서리에 씁니다. */
const CORNERS = [
  { key: 'tl', place: { top: -7, left: -7 }, transform: [] },
  { key: 'tr', place: { top: -7, right: -7 }, transform: [{ scaleX: -1 }] },
  { key: 'bl', place: { bottom: -7, left: -7 }, transform: [{ scaleY: -1 }] },
  { key: 'br', place: { bottom: -7, right: -7 }, transform: [{ scaleX: -1 }, { scaleY: -1 }] },
] as const;

/**
 * 호두나무 바깥선 + 안쪽 밝은 나무 테 + 한지 바탕. 한 겹 View라서
 * 호출하는 쪽의 gap·flexDirection 같은 레이아웃 스타일이 그대로 적용됩니다.
 */
export const pixelFrameStyle: ViewStyle = {
  backgroundColor: PixelPalette.hanji,
  borderWidth: PixelBorder.frame,
  borderColor: PixelPalette.outline,
  borderRadius: 2,
  boxShadow: `inset 0 0 0 3px ${PixelPalette.woodLight}, 0 4px 0 ${PixelPalette.outline}55`,
};

/** 프레임 네 모서리 장식. 절대 위치라 레이아웃 간격에 끼지 않습니다. */
export function PixelCorners() {
  return CORNERS.map((corner) => (
    <Image
      key={corner.key}
      source={CORNER}
      contentFit="contain"
      accessible={false}
      pointerEvents="none"
      style={[styles.corner, corner.place, { transform: [...corner.transform] }]}
    />
  ));
}

export interface PixelPanelProps extends PropsWithChildren {
  style?: StyleProp<ViewStyle>;
  decorated?: boolean;
  testID?: string;
}

/** RPG 창(프레임 + 모서리 장식). */
export function PixelPanel({ children, style, decorated = true, testID }: PixelPanelProps) {
  return (
    <View testID={testID} style={[pixelFrameStyle, styles.padded, style]}>
      {children}
      {decorated ? <PixelCorners /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  padded: { padding: 16 },
  corner: { position: 'absolute', width: PixelBorder.corner, height: PixelBorder.corner },
});
