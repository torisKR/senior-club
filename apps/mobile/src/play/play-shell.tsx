/**
 * 마을 놀이 화면 공용 틀: 점수판, 3:4 놀이판(누르기·끌기), 느린 모드·행동 버튼, 결과 창.
 * 놀이판 안 좌표는 배경 원화 픽셀(180×240)이고, 화면 크기에 맞춘 배율(scale)을 자식에게 넘깁니다.
 */
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';

import { RoundStarsView } from '@/arcade/round-stars-view';
import { GameIcon } from '@/components/game/game-icon';
import { PixelPanel } from '@/components/game/pixel-panel';
import { PixelBorder, PixelPalette } from '@/components/game/pixel-theme';
import { AppText, Screen, SeniorButton } from '@/components/ui';
import { useReduceMotion } from '@/fx/use-reduce-motion';
import { todayKey } from '@/rpg/daily-reset';
import { useRpg } from '@/rpg/rpg-store';
import { storage } from '@/utils/storage';

import {
  MIN_REWARD_SCORE, PLAY_RECORDS_KEY, normalizePlayRecords, settlePlayRound, withoutReward, type PlayGameId, type PlayRoundResult,
} from './play-rewards';

export const FIELD = { width: 180, height: 240 } as const;
const EASY_MODE_KEY = 'senior_club_play_easy_v1';
const MAX_FRAME_MS = 50;
const SPARK = require('../../assets/game/rpg/pixel/play/spark_good.png');
const FLASH = { width: 80, spark: 32, ms: 420 } as const;

export interface PlayOutcome extends PlayRoundResult {
  score: number;
  /** 이번 판까지의 최고 기록 */
  best: number;
  /** 보상이나 기록을 저장하지 못함 */
  saveFailed: boolean;
}

/** 화면이 그려질 때마다 한 번씩 부릅니다(requestAnimationFrame). 멈춰 있던 시간은 한 프레임으로 칩니다. */
export function useFrameLoop(active: boolean, onFrame: (dtMs: number) => void) {
  const handler = useRef(onFrame);
  useEffect(() => {
    handler.current = onFrame;
  });
  useEffect(() => {
    if (!active) return undefined;
    let last: number | null = null;
    let frame = requestAnimationFrame(function tick(now: number) {
      const dtMs = last === null ? 16 : Math.min(MAX_FRAME_MS, now - last);
      last = now;
      handler.current(dtMs);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);
}

function readRecords() {
  return normalizePlayRecords(storage.get<unknown>(PLAY_RECORDS_KEY, null));
}

/** 최고 기록과 한 판 정산(하루 상한 안에서 도토리·마음 온도 지급). */
export function usePlayRecords(game: PlayGameId) {
  const { applyLife } = useRpg();
  const [best, setBest] = useState(() => readRecords().best[game]);

  const finish = useCallback((score: number): PlayOutcome => {
    const previous = readRecords();
    const result = settlePlayRound(previous, game, score, todayKey());
    const hasReward = result.acorns > 0 || result.warmth > 0;
    const paid = !hasReward || applyLife(({ life }) => ({ life, acorns: result.acorns, warmth: result.warmth }));
    const next = paid ? result.records : withoutReward(result, previous);
    let stored = true;
    try {
      storage.set(PLAY_RECORDS_KEY, next);
    } catch {
      stored = false;
    }
    setBest(next.best[game]);
    return {
      ...result, score, best: next.best[game],
      acorns: paid ? result.acorns : 0, warmth: paid ? result.warmth : 0, saveFailed: !paid || !stored,
    };
  }, [applyLife, game]);

  return { best, finish };
}

/** 느린 모드. 고른 적이 없으면 낭독기·동작 줄이기 사용자에게는 켠 채로 시작합니다. */
export function useEasyMode(): [boolean, () => void] {
  const reduceMotion = useReduceMotion();
  const [screenReader, setScreenReader] = useState(false);
  const [choice, setChoice] = useState<boolean | null>(() => storage.get<boolean | null>(EASY_MODE_KEY, null));

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isScreenReaderEnabled().then((enabled) => { if (active) setScreenReader(enabled); }, () => undefined);
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);

  const easy = typeof choice === 'boolean' ? choice : screenReader || reduceMotion === true;
  const toggle = useCallback(() => {
    setChoice(!easy);
    try {
      storage.set(EASY_MODE_KEY, !easy);
    } catch {
      // 설정 저장에 실패해도 이번 놀이에는 그대로 적용됩니다.
    }
  }, [easy]);
  return [easy, toggle];
}

export interface PlayShellProps {
  testID: string;
  scoreLabel: string;
  bestLabel: string;
  /** 지금 할 일이나 방금 판정을 알려 주는 한 줄 */
  status: string;
  /** 점수판 오른쪽에 붙는 작은 정보(다음 돌 등) */
  aside?: ReactNode;
  easy: boolean;
  onToggleEasy: () => void;
  actionLabel: string;
  actionHint: string;
  onAction: () => void;
  /** 놀이판을 누른 자리(원화 픽셀 x) */
  onFieldPress: (x: number) => void;
  onFieldMove?: (x: number) => void;
  outcome: PlayOutcome | null;
  resultTitle: string;
  unit: string;
  onRetry: () => void;
  fieldColor?: string;
  children: (scale: number) => ReactNode;
}

function PlayHud(props: Pick<PlayShellProps, 'scoreLabel' | 'bestLabel' | 'status' | 'aside'>) {
  return (
    <PixelPanel decorated={false} style={styles.hud}>
      <View style={styles.hudRow}>
        <View style={styles.hudScore} accessible accessibilityLabel={`${props.scoreLabel}, ${props.bestLabel}`}>
          <AppText variant="title" color={PixelPalette.ink} style={styles.tabular} numberOfLines={1}>{props.scoreLabel}</AppText>
          <AppText variant="caption" color={PixelPalette.inkSoft}>{props.bestLabel}</AppText>
        </View>
        {props.aside}
      </View>
      <AppText variant="body" color={PixelPalette.ink} accessibilityLiveRegion="polite">{props.status}</AppText>
    </PixelPanel>
  );
}

/** 느린 모드 스위치와, 놀이판을 누르기 어려운 분을 위한 큰 행동 버튼(72dp). */
function PlayControls(props: Pick<PlayShellProps, 'testID' | 'easy' | 'onToggleEasy' | 'actionLabel' | 'actionHint' | 'onAction' | 'outcome'>) {
  return (
    <View style={styles.controls}>
      <SeniorButton
        testID={`${props.testID}-easy`}
        label={props.easy ? '느린 모드 켜짐' : '느린 모드 꺼짐'}
        variant="secondary"
        fullWidth={false}
        accessibilityRole="switch"
        accessibilityLabel="느린 모드"
        accessibilityHint="천천히 움직이고, 맞출 때를 진동과 소리로 알려 줍니다"
        accessibilityState={{ checked: props.easy }}
        onPress={props.onToggleEasy}
        style={styles.easyButton}
      />
      <SeniorButton
        testID={`${props.testID}-action`}
        label={props.actionLabel}
        variant="accent"
        fullWidth={false}
        accessibilityHint={props.actionHint}
        disabled={props.outcome !== null}
        onPress={props.onAction}
        style={styles.actionButton}
      />
    </View>
  );
}

export function PlayShell(props: PlayShellProps) {
  const [area, setArea] = useState({ width: 0, height: 0 });
  const scale = Math.min(area.width / FIELD.width, area.height / FIELD.height);
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setArea({ width, height });
  };
  const toX = (event: GestureResponderEvent) => event.nativeEvent.locationX / scale;
  const playing = props.outcome === null;

  return (
    <Screen testID={props.testID} scroll={false} contentContainerStyle={styles.screen}>
      <PlayHud {...props} />

      <View style={styles.area} onLayout={onLayout}>
        {scale > 0 ? (
          <View style={[styles.field, { width: FIELD.width * scale, height: FIELD.height * scale, backgroundColor: props.fieldColor ?? PixelPalette.hanjiShade }]}>
            <View style={StyleSheet.absoluteFill} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants">
              {props.children(scale)}
            </View>
            {/* 맨 위 투명 판이 터치를 받아, 누른 자리가 늘 놀이판 기준 좌표가 됩니다. */}
            <View
              testID={`${props.testID}-field`}
              style={StyleSheet.absoluteFill}
              accessible={false}
              onStartShouldSetResponder={() => playing}
              onResponderGrant={(event) => props.onFieldPress(toX(event))}
              onResponderMove={(event) => props.onFieldMove?.(toX(event))}
            />
          </View>
        ) : null}
      </View>

      <PlayControls {...props} />

      {props.outcome ? <PlayResult outcome={props.outcome} title={props.resultTitle} unit={props.unit} onRetry={props.onRetry} testID={props.testID} /> : null}
    </Screen>
  );
}

/** 잘 맞은 순간 그 자리에 잠깐 뜨는 판정 글자와 반짝임. 판정은 늘 글자로도 알려 줍니다. x·y는 원화 픽셀. */
export function PlayFlash({ label, sparkle, x, y, scale }: { label: string; sparkle: boolean; x: number; y: number; scale: number }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), FLASH.ms);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  const centre = Math.max(FLASH.width / 2, Math.min(FIELD.width - FLASH.width / 2, x));
  return (
    <View style={[styles.flash, { left: (centre - FLASH.width / 2) * scale, top: y * scale, width: FLASH.width * scale }]}>
      {sparkle ? <Image source={SPARK} style={{ width: FLASH.spark * scale, height: FLASH.spark * scale }} contentFit="fill" /> : null}
      <View style={styles.flashLabel}>
        <AppText variant="bodyStrong" color={PixelPalette.dialogueText}>{label}</AppText>
      </View>
    </View>
  );
}

function rewardNote(outcome: PlayOutcome, unit: string): string | null {
  if (outcome.saveFailed) return '이번 판 보상이나 기록을 저장하지 못했어요. 다시 해 보세요.';
  if (outcome.score < MIN_REWARD_SCORE) return `${MIN_REWARD_SCORE}${unit} 이상이면 도토리를 받아요.`;
  if (outcome.capReached) return '오늘 놀이 보상은 다 받았어요. 기록은 계속 남아요.';
  return null;
}

function PlayResult({ outcome, title, unit, onRetry, testID }: { outcome: PlayOutcome; title: string; unit: string; onRetry: () => void; testID: string }) {
  const note = rewardNote(outcome, unit);
  const hasReward = outcome.acorns > 0 || outcome.warmth > 0;
  return (
    <View style={styles.resultScrim} testID={`${testID}-result`} accessibilityViewIsModal>
      <ScrollView contentContainerStyle={styles.resultScroll} showsVerticalScrollIndicator={false}>
        <PixelPanel style={styles.result}>
          <RoundStarsView stars={outcome.stars} title={title} />
          <AppText variant="key" color={PixelPalette.ink} align="center">
            {outcome.isNewBest ? `새 최고 기록! ${outcome.score}${unit}` : `이번 판 ${outcome.score}${unit} · 최고 ${outcome.best}${unit}`}
          </AppText>
          {hasReward ? (
            <View style={styles.rewardRow} accessible accessibilityLabel={`도토리 ${outcome.acorns}개, 마음 온도 ${outcome.warmth}도 받음`}>
              <GameIcon name="acorn" size={28} />
              <AppText variant="bodyStrong" color={PixelPalette.ink}>도토리 +{outcome.acorns}</AppText>
              <GameIcon name="heart" size={28} />
              <AppText variant="bodyStrong" color={PixelPalette.ink}>마음 온도 +{outcome.warmth}</AppText>
            </View>
          ) : null}
          {note ? <AppText variant="body" color={PixelPalette.inkSoft} align="center">{note}</AppText> : null}
          <SeniorButton testID={`${testID}-retry`} label="다시 하기" onPress={onRetry} />
        </PixelPanel>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: 10, paddingTop: 10 },
  hud: { paddingVertical: 10, paddingHorizontal: 14, gap: 4 },
  hudRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  hudScore: { flexShrink: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
  area: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  field: { overflow: 'hidden', borderWidth: PixelBorder.frame, borderColor: PixelPalette.outline, borderRadius: 2 },
  controls: { flexDirection: 'row', gap: 10 },
  easyButton: { flex: 1, minHeight: 72 },
  actionButton: { flex: 1.3, minHeight: 72 },
  resultScrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: `${PixelPalette.outline}99` },
  resultScroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  result: { gap: 12, alignItems: 'stretch' },
  flash: { position: 'absolute', alignItems: 'center' },
  flashLabel: { backgroundColor: PixelPalette.dialogue, borderColor: PixelPalette.gold, borderWidth: 2, borderRadius: 2, paddingHorizontal: 8, paddingVertical: 2 },
  rewardRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
