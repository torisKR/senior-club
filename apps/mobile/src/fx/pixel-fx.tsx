import { Image } from 'expo-image';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { FX_MANIFEST, type FxName } from './fx-manifest';
import { frameAt, frameCell } from './fx-timing';

/**
 * pixelfx로 구운 스프라이트시트 (tools/pixel-art/render-fx.mjs 산출물).
 * Metro가 정적 require만 인식하므로 경로를 그대로 적습니다.
 */
const SHEETS: Record<FxName, number> = {
  promotion: require('../../assets/game/rpg/fx/promotion.png'),
  holein: require('../../assets/game/rpg/fx/holein.png'),
  impact: require('../../assets/game/rpg/fx/impact.png'),
  match: require('../../assets/game/rpg/fx/match.png'),
  heal: require('../../assets/game/rpg/fx/heal.png'),
};

export interface PixelFxProps {
  name: FxName;
  /** 아트 픽셀 1개를 몇 dp로 그릴지. 기본 1 (마을 타일과 같은 밀도) */
  scale?: number;
  /** 매니페스트의 loop 값을 덮어쓸 때 */
  loop?: boolean;
  /** 일회 재생이 끝나면 호출 */
  onDone?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * 픽셀 아트 이펙트 재생기.
 *
 * 시트 전체를 한 장의 이미지로 올리고, 프레임 크기만큼 잘라 보여주며
 * translate로 다음 칸으로 넘깁니다. 프레임 전환은 setInterval 기반이라
 * 네이티브 드라이버 없이도 모든 기기에서 동일하게 동작합니다.
 * (이펙트는 8~14fps라 초당 리렌더가 적습니다.)
 */
export function PixelFx({ name, scale = 1, loop, onDone, style }: PixelFxProps) {
  const meta = FX_MANIFEST[name];
  const shouldLoop = loop ?? meta.loop;
  const [frame, setFrame] = useState(0);
  const doneRef = useRef(false);

  const frameWidth = meta.frameWidth * scale;
  const frameHeight = meta.frameHeight * scale;

  useEffect(() => {
    doneRef.current = false;
    if (meta.frames <= 1) return;

    const startedAt = Date.now();
    const timer = setInterval(() => {
      const next = frameAt(Date.now() - startedAt, meta.fps, meta.frames, shouldLoop);
      setFrame(next);
      if (!shouldLoop && next >= meta.frames - 1) {
        clearInterval(timer);
      }
    }, Math.max(16, Math.round(1000 / meta.fps)));

    return () => clearInterval(timer);
  }, [meta, shouldLoop]);

  useEffect(() => {
    if (shouldLoop || doneRef.current) return;
    if (frame < meta.frames - 1) return;
    doneRef.current = true;
    onDone?.();
  }, [frame, meta.frames, shouldLoop, onDone]);

  const cell = useMemo(() => frameCell(frame, meta.columns), [frame, meta.columns]);

  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.window, { width: frameWidth, height: frameHeight }, style]}>
      <Image
        source={SHEETS[name]}
        contentFit="fill"
        style={{
          position: 'absolute',
          width: meta.frameWidth * meta.columns * scale,
          height: meta.frameHeight * meta.rows * scale,
          transform: [
            { translateX: -cell.column * frameWidth },
            { translateY: -cell.row * frameHeight },
          ],
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  window: {
    overflow: 'hidden',
  },
});
