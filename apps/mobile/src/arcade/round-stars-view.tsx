import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { playSfx } from '@/audio/sound-manager';
import { AppText } from '@/components/ui';
import { PixelPalette } from '@/components/game/pixel-theme';
import { useReduceMotion } from '@/fx/use-reduce-motion';
import { askForReviewAt } from '@/rpg/review-prompt';

import { useArcade } from './arcade-store';
import type { Stars } from './round-stars';

const STAR_FULL = require('../../assets/game/rpg/pixel/gameui/star_full.png');
const STAR_EMPTY = require('../../assets/game/rpg/pixel/gameui/star_empty.png');
const RIBBON = require('../../assets/game/rpg/pixel/gameui/ribbon.png');
const CONFETTI = require('../../assets/game/rpg/pixel/gameui/confetti.png');

/** 별 하나가 켜지는 간격(ms). */
const STAR_STEP_MS = 380;
const STAR_SIZE = 56;
/** 별 연출이 끝나고 잠시 뒤에 평가 창을 띄웁니다. */
const REVIEW_DELAY_MS = 2500;
const STAR_INDEXES = [0, 1, 2] as const;

/**
 * 한 판 결과 별점. 별이 하나씩 켜지며 효과음·진동이 따라오고, 동작 줄이기면 한 번에 보입니다.
 * 별 개수는 글자로도 읽어 주므로 색이나 모양만으로 뜻을 전하지 않습니다.
 */
export function RoundStarsView({ stars, title }: { stars: Stars; title: string }) {
  const reduceMotion = useReduceMotion() !== false;
  const { state, triggerHaptic } = useArcade();
  const [lit, setLit] = useState(reduceMotion ? stars : 0);
  const [scales] = useState(() => STAR_INDEXES.map(() => new Animated.Value(reduceMotion ? 1 : 0)));

  useEffect(() => {
    // 별 3개를 받은 기분 좋은 순간에만, 별이 다 켜진 뒤 평가를 부탁합니다(횟수 제한은 review-prompt).
    if (stars !== 3) return undefined;
    const timer = setTimeout(() => { void askForReviewAt('three_stars'); }, REVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [stars]);

  useEffect(() => {
    if (reduceMotion) return undefined;
    const timers = STAR_INDEXES.map((index) => setTimeout(() => {
      if (index < stars) {
        setLit(index + 1);
        playSfx('chime', state.soundEnabled);
        triggerHaptic('light');
      }
      Animated.spring(scales[index], { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }).start();
    }, STAR_STEP_MS * (index + 1)));
    return () => timers.forEach(clearTimeout);
    // 한 번 보여 준 결과는 다시 재생하지 않습니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.wrap} accessible accessibilityRole="summary" accessibilityLabel={`${title}. 별 3개 중 ${stars}개`}>
      {stars === 3 && lit === 3 ? (
        <Image source={CONFETTI} style={styles.confetti} contentFit="contain" accessible={false} pointerEvents="none" />
      ) : null}
      <View style={styles.ribbon}>
        <Image source={RIBBON} style={StyleSheet.absoluteFill} contentFit="fill" accessible={false} />
        <AppText variant="key" style={styles.ribbonText} numberOfLines={1}>{title}</AppText>
      </View>
      <View style={styles.row}>
        {scales.map((scale, index) => (
          <Animated.View key={index} style={{ transform: [{ scale }] }}>
            <Image source={index < lit ? STAR_FULL : STAR_EMPTY} style={styles.star} contentFit="contain" accessible={false} />
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8, paddingTop: 4 },
  confetti: { position: 'absolute', top: -40, width: 260, height: 200, opacity: 0.95 },
  ribbon: { minWidth: 220, maxWidth: '100%', height: 56, paddingHorizontal: 36, alignItems: 'center', justifyContent: 'center' },
  ribbonText: { color: PixelPalette.dialogueText, textShadowColor: PixelPalette.outline, textShadowRadius: 2, textShadowOffset: { width: 0, height: 2 } },
  row: { flexDirection: 'row', gap: 10 },
  star: { width: STAR_SIZE, height: STAR_SIZE },
});
