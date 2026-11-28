import { Image } from 'expo-image';
import React, { useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { pixelFrameStyle } from '@/components/game/pixel-panel';
import { PixelPalette } from '@/components/game/pixel-theme';
import { AppText, SeniorButton } from '@/components/ui';
import { FontWeights, Spacing } from '@/constants/theme';
import { FISH_SPRITES } from '@/rpg/rpg-sprites';

import { withObjectParticle } from '../josa';
import { FISH, type FishId } from '../life';
import { reelSignal, shadowPositions, type FishingOutcome, type FishingState, type Point, type ReelSignal } from './fishing';
import { PLAY_SPRITES } from './play-sprites';
import { useFishingGame, type CatchResult } from './use-fishing-game';

const BOBBER_DP = 48;
const SHADOW_W = 72;
const SHADOW_H = 36;
const WATER_ASPECT = 3 / 2;
const WATER_MAX_HEIGHT_RATIO = 0.26;
/** gauge_frame.png(96×16)의 속 빈 자리: 가로 8~88, 세로 6~10 */
const GAUGE_INSET = { left: '8.33%', top: '37.5%', width: '83.34%', height: '25%' } as const;

const REEL_TEXT: Record<ReelSignal, string> = {
  struggle: '물고기가 버텨요! 손을 떼고 기다리세요',
  tight: '줄이 팽팽해요! 손을 살짝 떼세요',
  slack: '줄이 느슨해요! 꾹 눌러 감으세요',
  steady: '좋아요. 꾹 눌러 감으세요',
};
const LOST_TEXT: Record<Exclude<FishingOutcome, 'landed'>, string> = {
  missed: '아깝게 놓쳤어요. 물고기는 또 옵니다.',
  snapped: '줄이 끊어졌어요. 물고기가 버틸 때는 손을 떼 주세요.',
  escaped: '줄이 너무 풀려 달아났어요. 다음엔 꾹 눌러 감아 주세요.',
};

export interface FishingPanelProps {
  active: boolean;
  /** 낭독기·동작 줄이기: 버튼 두 번(던지기 → 당기기)으로 낚습니다. */
  simple: boolean;
  onLand: (fishId: FishId) => CatchResult;
  onNotice: (text: string) => void;
  onClose: () => void;
}

function headline(game: FishingState, simple: boolean): string {
  switch (game.phase) {
    case 'aim': return simple ? '찌를 던져 볼까요?' : '물 위를 눌러 찌를 던지세요';
    case 'wait': return '찌를 지켜보는 중…';
    case 'bite': return '찌가 쏙 들어갔어요! 천천히 당겨 보세요.';
    case 'reel': return REEL_TEXT[reelSignal(game) ?? 'steady'];
    default: return '';
  }
}

function hint(game: FishingState, simple: boolean): string | null {
  if (game.phase === 'aim') return simple ? '찌가 움직이면 소리와 진동으로 알려 드려요.' : '물고기 그림자 가까이 던지면 입질이 빨리 와요.';
  if (game.phase === 'wait' || game.phase === 'bite') return '찌가 쏙 들어가면 당기세요. 소리와 진동으로도 알려 드려요. 서두르지 않아도 됩니다.';
  return null;
}

/** 낚시 전용 창: 물 위에 찌를 던지고, 입질에 챔질하고, 줄 힘을 보며 릴을 감습니다. */
export function FishingPanel({ active, simple, onLand, onNotice, onClose }: FishingPanelProps) {
  const { game, result, holding, hold, cast, pull, keep, again } = useFishingGame({ active, simple, onLand, onNotice });
  const tip = hint(game, simple);
  const endButton = <SeniorButton testID="btn-end-activity" label="그만하기" variant="secondary" onPress={onClose} />;

  return (
    <View testID="activity-fishing" style={[pixelFrameStyle, styles.panel]} onStartShouldSetResponder={() => true}>
      {game.phase === 'done' ? (
        <FishingResult outcome={game.outcome} fishId={game.fishId} result={result} onKeep={keep} onAgain={again} />
      ) : (
        <>
          <AppText variant="sectionTitle" accessibilityLiveRegion="polite" style={styles.title}>{headline(game, simple)}</AppText>
          <Water game={game} simple={simple} onSpot={game.phase === 'aim' ? cast : pull} />
          {tip ? <AppText variant="body" style={styles.body}>{tip}</AppText> : null}
          {game.phase === 'aim' && simple ? (
            <SeniorButton testID="btn-cast-line" label="찌 던지기" variant="accent" onPress={() => cast({ x: 0.5, y: 0.5 })} />
          ) : null}
          {game.phase === 'wait' || game.phase === 'bite' ? (
            <SeniorButton testID="btn-pull-line" label="낚싯대 당기기" variant={game.phase === 'bite' ? 'accent' : 'primary'} onPress={pull} />
          ) : null}
          {game.phase === 'reel' ? <ReelControls game={game} holding={holding} simple={simple} onHold={hold} /> : null}
        </>
      )}
      {endButton}
    </View>
  );
}

function Water({ game, simple, onSpot }: { game: Exclude<FishingState, { phase: 'done' }>; simple: boolean; onSpot: (spot: Point) => void }) {
  const { height: windowHeight } = useWindowDimensions();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const clock = simple ? 0 : game.clockMs;
  const pressable = game.phase !== 'reel';
  return (
    <Pressable
      testID="fishing-water"
      disabled={!pressable}
      accessibilityRole="button"
      accessibilityLabel={game.phase === 'aim' ? '연못. 누르면 그 자리에 찌를 던집니다' : '연못. 누르면 낚싯대를 당깁니다'}
      onLayout={(event) => setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}
      onPress={(event) => {
        if (size.width > 0) onSpot({ x: event.nativeEvent.locationX / size.width, y: event.nativeEvent.locationY / size.height });
      }}
      style={[styles.water, { maxHeight: windowHeight * WATER_MAX_HEIGHT_RATIO }]}>
      {/* 그림들이 손길을 가로채지 않게 한 겹으로 감싸, 누른 자리가 늘 연못 기준 좌표로 들어옵니다. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Image source={PLAY_SPRITES.water} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />
      {size.width > 0 && game.phase !== 'reel' ? shadowPositions(clock).map((shadow, index) => (
        <Image key={index} source={PLAY_SPRITES.shadow} contentFit="contain" pointerEvents="none" accessible={false}
          style={[styles.shadow, {
            left: shadow.x * size.width - SHADOW_W / 2, top: shadow.y * size.height - SHADOW_H / 2,
            transform: [{ scaleX: shadow.facingLeft ? 1 : -1 }],
          }]} />
      )) : null}
      {size.width > 0 && game.phase !== 'aim' ? <Bobber game={game} simple={simple} size={size} /> : null}
      </View>
    </Pressable>
  );
}

function Bobber({ game, simple, size }: { game: Exclude<FishingState, { phase: 'aim' | 'done' }>; simple: boolean; size: { width: number; height: number } }) {
  const reeling = game.phase === 'reel';
  // 릴을 감을수록 찌가 물가(아래쪽 가운데)로 끌려옵니다.
  const pull = reeling ? game.progress : 0;
  const x = game.cast.x + (0.5 - game.cast.x) * pull;
  const y = game.cast.y + (0.92 - game.cast.y) * pull;
  const wave = simple ? 0 : Math.sin(game.clockMs / (game.phase === 'wait' ? 420 : 70));
  const tugging = game.phase === 'bite' || (reeling && game.struggleLeftMs > 0);
  return (
    <>
      {reeling ? (
        <Image source={PLAY_SPRITES.shadow} contentFit="contain" pointerEvents="none" accessible={false}
          style={[styles.shadow, { left: x * size.width - SHADOW_W / 2 + (tugging ? wave * 6 : 0), top: y * size.height - SHADOW_H / 2 + 14 }]} />
      ) : null}
      <Image source={PLAY_SPRITES.bobber} contentFit="contain" pointerEvents="none" accessible={false}
        style={[styles.bobber, {
          left: x * size.width - BOBBER_DP / 2,
          top: y * size.height - BOBBER_DP / 2,
          transform: tugging
            ? [{ translateY: 10 + wave * 2 }, { rotate: `${-14 + wave * 6}deg` }]
            : [{ translateY: wave * 3 }],
        }]} />
    </>
  );
}

function ReelControls({ game, holding, simple, onHold }: {
  game: Extract<FishingState, { phase: 'reel' }>; holding: boolean; simple: boolean; onHold: (on: boolean) => void;
}) {
  const signal = reelSignal(game) ?? 'steady';
  const percent = Math.round(game.progress * 100);
  const fillColor = signal === 'struggle' || signal === 'tight' ? PixelPalette.persimmon : signal === 'slack' ? PixelPalette.gold : PixelPalette.pine;
  return (
    <>
      <View style={styles.gaugeRow}>
        <AppText variant="bodyStrong" style={styles.body}>줄 힘</AppText>
        <View style={styles.gauge} accessible accessibilityRole="progressbar" accessibilityLabel="줄 힘"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(game.tension * 100) }}>
          <View style={[styles.gaugeTrack, GAUGE_INSET]}>
            <View style={{ width: `${Math.round(game.tension * 100)}%`, height: '100%', backgroundColor: fillColor }} />
          </View>
          <Image source={PLAY_SPRITES.gauge} style={StyleSheet.absoluteFill} contentFit="fill" accessible={false} />
        </View>
      </View>
      <Pressable
        testID="btn-reel"
        accessibilityRole="button"
        accessibilityLabel={`릴 감기. 누르고 있으면 감깁니다. ${percent}퍼센트 끌어왔어요`}
        onPressIn={() => onHold(true)}
        onPressOut={() => onHold(false)}
        style={[styles.reelButton, holding && styles.reelButtonHeld]}>
        <Image source={PLAY_SPRITES.reel} contentFit="contain" accessible={false}
          style={[styles.reelIcon, !simple && { transform: [{ rotate: `${Math.round(game.progress * 1440)}deg` }] }]} />
        <AppText variant="button" style={styles.reelLabel}>{holding ? `감는 중… ${percent}%` : `꾹 눌러 감기 · ${percent}%`}</AppText>
      </Pressable>
    </>
  );
}

function FishingResult({ outcome, fishId, result, onKeep, onAgain }: {
  outcome: FishingOutcome; fishId: FishId | null; result: CatchResult | null; onKeep: () => void; onAgain: () => void;
}) {
  const fish = FISH.find((candidate) => candidate.id === fishId);
  if (!fish || outcome !== 'landed') {
    return (
      <>
        <AppText variant="sectionTitle" accessibilityLiveRegion="polite" style={styles.title}>{LOST_TEXT[outcome === 'landed' ? 'missed' : outcome]}</AppText>
        <SeniorButton testID="btn-cast-again" label="한 번 더 던지기" variant="primary" onPress={onAgain} />
      </>
    );
  }
  const saved = result?.saved === true;
  return (
    <>
      <View style={styles.resultRow}>
        <View style={styles.fishBox}>
          <Image source={FISH_SPRITES[fish.id]} style={styles.fish} contentFit="contain" accessible={false} />
          {saved ? <Image source={PLAY_SPRITES.spark} style={styles.spark} contentFit="contain" accessible={false} /> : null}
        </View>
        <AppText variant="sectionTitle" accessibilityLiveRegion="polite" style={styles.title}>
          {saved
            ? `${withObjectParticle(fish.name)} 낚았어요! 도토리 +${fish.acorns}${result?.isNew ? ' · 도감에 새로 등록!' : ''}`
            : `${withObjectParticle(fish.name)} 낚았지만 아직 담지 못했어요.`}
        </AppText>
      </View>
      {saved ? null : <SeniorButton testID="btn-keep-fish" label="다시 담기" variant="accent" onPress={onKeep} />}
      <SeniorButton testID="btn-cast-again" label="한 번 더 던지기" variant="primary" onPress={onAgain} />
    </>
  );
}

const styles = StyleSheet.create({
  panel: { gap: Spacing.sm, padding: Spacing.md },
  title: { flexShrink: 1, color: PixelPalette.ink, fontFamily: FontWeights.strong },
  body: { color: PixelPalette.ink },
  water: {
    width: '100%', aspectRatio: WATER_ASPECT, alignSelf: 'center', overflow: 'hidden',
    borderWidth: 3, borderColor: PixelPalette.outline, borderRadius: 2, backgroundColor: '#3F8F92',
  },
  shadow: { position: 'absolute', width: SHADOW_W, height: SHADOW_H, opacity: 0.8 },
  bobber: { position: 'absolute', width: BOBBER_DP, height: BOBBER_DP },
  gaugeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  gauge: { flex: 1, aspectRatio: 6, maxHeight: 56 },
  gaugeTrack: { position: 'absolute', backgroundColor: PixelPalette.hanjiShade },
  reelButton: {
    minHeight: 88, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.md, borderRadius: 2, borderWidth: 3, borderColor: PixelPalette.outline,
    backgroundColor: PixelPalette.persimmon, boxShadow: `inset 0 -5px 0 ${PixelPalette.persimmonDark}`,
  },
  reelButtonHeld: { boxShadow: `inset 0 -2px 0 ${PixelPalette.persimmonDark}`, transform: [{ translateY: 3 }] },
  reelIcon: { width: 56, height: 56 },
  reelLabel: { color: PixelPalette.dialogueText },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  fishBox: { width: 72, height: 72 },
  fish: { width: 72, height: 72 },
  spark: { position: 'absolute', right: -8, top: -8, width: 32, height: 32 },
});
