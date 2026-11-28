/** 제기차기 마당(오일장터). 물리·판정은 jegi-logic의 순수 함수가 하고, 여기서는 프레임마다 그립니다. */
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';

import { useArcade } from '@/arcade/arcade-store';
import { playSfx } from '@/audio/sound-manager';
import { PixelPalette } from '@/components/game/pixel-theme';
import { useReduceMotion } from '@/fx/use-reduce-motion';

import { JEGI, createJegi, inKickWindow, kickJegi, moveFoot, stepJegi, type JegiGrade, type JegiState } from './jegi-logic';
import { PlayFlash, PlayShell, useEasyMode, useFrameLoop, usePlayRecords, type PlayOutcome } from './play-shell';

const BACKGROUND = require('../../assets/game/rpg/pixel/play/jegi_bg.png');
const JEGI_SPRITE = require('../../assets/game/rpg/pixel/play/jegi.png');
const FOOT_SPRITE = require('../../assets/game/rpg/pixel/play/jegi_foot.png');

/** 그림 배치(원화 픽셀). 발등 선은 놀이판 위에서부터 잰 높이입니다. */
const ART = { footLine: 192, jegiSize: 32, jegiBase: 29, footSize: 48, footInstepX: 31, footInstepY: 26 } as const;
const GRADE_LABEL: Record<JegiGrade, string> = { perfect: '완벽!', good: '좋아요', close: '아슬아슬' };
const FOOT_LIFT_MS = 90;
const FOOT_LIFT = 6;
const MAX_TILT_DEG = 24;
const ANNOUNCE_EVERY = 5;

interface JegiView {
  phase: JegiState['phase'];
  count: number;
  grade: JegiGrade | null;
  kickSeq: number;
  whiffSeq: number;
  /** 마지막으로 값이 바뀐 순간의 발 자리(판정 글자를 띄울 곳) */
  footX: number;
}

const toView = (state: JegiState): JegiView => ({
  phase: state.phase, count: state.count, grade: state.lastGrade, kickSeq: state.kickSeq, whiffSeq: state.whiffSeq, footX: state.footX,
});
const sameView = (a: JegiView, b: JegiView) =>
  a.phase === b.phase && a.count === b.count && a.kickSeq === b.kickSeq && a.whiffSeq === b.whiffSeq;
const newSeed = () => Date.now() >>> 0;

function statusText(view: JegiView, missed: boolean): string {
  if (view.phase === 'ready') return '놀이판을 누르면 제기를 띄웁니다. 떨어지는 제기 밑을 눌러 차 올리세요.';
  if (view.phase === 'over') return '제기가 땅에 떨어졌어요.';
  if (missed) return '헛발! 제기가 발 가까이 왔을 때 누르세요.';
  return view.grade ? GRADE_LABEL[view.grade] : '제기가 내려오면 그 밑을 누르세요.';
}

interface JegiMotion {
  x: SharedValue<number>;
  h: SharedValue<number>;
  footX: SharedValue<number>;
  footLift: SharedValue<number>;
  tilt: SharedValue<number>;
}

function useJegiMotion(initial: JegiState): JegiMotion {
  const x = useSharedValue(initial.x);
  const h = useSharedValue(initial.h);
  const footX = useSharedValue(initial.footX);
  const footLift = useSharedValue(0);
  const tilt = useSharedValue(0);
  return { x, h, footX, footLift, tilt };
}

function moveSprites(motion: JegiMotion, next: JegiState, reduceMotion: boolean) {
  motion.x.set(next.x);
  motion.h.set(next.h);
  motion.footX.set(next.footX);
  motion.tilt.set(reduceMotion ? 0 : Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, next.vx)));
}

/** 찬 순간: 발이 살짝 들리고, 다섯 번마다 낭독기에 횟수를 알립니다. */
function kickFeedback(motion: JegiMotion, count: number, reduceMotion: boolean) {
  if (!reduceMotion) motion.footLift.set(withSequence(withTiming(FOOT_LIFT, { duration: FOOT_LIFT_MS }), withTiming(0, { duration: FOOT_LIFT_MS })));
  if (count % ANNOUNCE_EVERY === 0) AccessibilityInfo.announceForAccessibility(`${count}번`);
}

/** 놀이 상태를 쥐고, 한 걸음마다 그림 값·효과음·진동·결과를 맞춥니다. */
function useJegiGame(easy: boolean, reduceMotion: boolean) {
  const { state: arcade, triggerHaptic } = useArcade();
  const { best, finish } = usePlayRecords('jegi');
  const [initial] = useState(() => createJegi(newSeed(), { slow: easy, assist: easy }));
  const game = useRef(initial);
  const motion = useJegiMotion(initial);
  const [view, setView] = useState(() => toView(initial));
  const [missed, setMissed] = useState(false);
  const [outcome, setOutcome] = useState<PlayOutcome | null>(null);

  useEffect(() => {
    // 느린 모드를 바꾸면 지금 판에도 바로 적용합니다.
    game.current = { ...game.current, options: { slow: easy, assist: easy } };
  }, [easy]);

  const sync = (next: JegiState) => {
    const previous = game.current;
    if (next === previous) return;
    game.current = next;
    moveSprites(motion, next, reduceMotion);
    const kicked = next.kickSeq !== previous.kickSeq;
    const whiffed = next.whiffSeq !== previous.whiffSeq;
    if (kicked) {
      playSfx('putt', arcade.soundEnabled);
      triggerHaptic(next.lastGrade === 'perfect' ? 'medium' : 'light');
      kickFeedback(motion, next.count, reduceMotion);
    }
    if (kicked || whiffed || next.phase === 'ready') setMissed(whiffed);
    if (next.phase === 'over' && previous.phase !== 'over') setOutcome(finish(next.count));
    if (next.phase === 'ready') setOutcome(null);
    const nextView = toView(next);
    setView((current) => (sameView(current, nextView) ? current : nextView));
  };

  useFrameLoop(view.phase === 'playing', (dtMs) => {
    const previous = game.current;
    const next = stepJegi(previous, dtMs);
    if (easy && !inKickWindow(previous) && inKickWindow(next)) {
      // 느린 모드: 지금 차면 맞는다는 신호를 진동과 소리로 줍니다.
      triggerHaptic('light');
      playSfx('tileMatch', arcade.soundEnabled);
    }
    sync(next);
  });

  /** 지금 상태에 순수 함수 하나를 적용합니다(발 옮기기·차기). */
  const act = (change: (state: JegiState) => JegiState) => sync(change(game.current));
  const retry = () => sync(createJegi(newSeed(), { slow: easy, assist: easy }));
  return { view, missed, outcome, best, motion, act, retry };
}

export function JegiScreen() {
  const reduceMotion = useReduceMotion() !== false;
  const [easy, toggleEasy] = useEasyMode();
  const { view, missed, outcome, best, motion, act, retry } = useJegiGame(easy, reduceMotion);

  return (
    <PlayShell
      testID="jegi-screen"
      scoreLabel={`연속 ${view.count}번`}
      bestLabel={`최고 기록 ${Math.max(best, view.count)}번`}
      status={statusText(view, missed)}
      easy={easy}
      onToggleEasy={toggleEasy}
      actionLabel={view.phase === 'ready' ? '제기 띄우기' : '차기'}
      actionHint={easy ? '발이 제기 밑을 따라갑니다. 신호가 울릴 때 누르세요' : '발이 있는 자리에서 찹니다. 놀이판을 누르면 누른 자리로 발이 옮겨 갑니다'}
      onAction={() => act(kickJegi)}
      onFieldPress={(touchX) => act((state) => kickJegi(moveFoot(state, touchX)))}
      onFieldMove={(touchX) => act((state) => moveFoot(state, touchX))}
      outcome={outcome}
      resultTitle={`제기차기 ${view.count}번`}
      unit="번"
      onRetry={retry}>
      {(scale) => (
        <>
          <Image source={BACKGROUND} style={StyleSheet.absoluteFill} contentFit="fill" />
          <JegiSprites scale={scale} motion={motion} />
          {view.grade && view.phase === 'playing' && !missed ? (
            <PlayFlash key={view.kickSeq} label={GRADE_LABEL[view.grade]} sparkle={!reduceMotion && view.grade !== 'close'} x={view.footX} y={ART.footLine - 78} scale={scale} />
          ) : null}
        </>
      )}
    </PlayShell>
  );
}

function JegiSprites({ scale, motion: { x, h, footX, footLift, tilt } }: { scale: number; motion: JegiMotion }) {
  const jegiStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: (x.get() - ART.jegiSize / 2) * scale },
      { translateY: (ART.footLine - h.get() - ART.jegiBase) * scale },
      { rotate: `${tilt.get()}deg` },
    ],
  }));
  // 그림자가 제기 바로 아래 땅에 드리워, 발을 어디에 둘지 알려 줍니다.
  const shadowStyle = useAnimatedStyle(() => {
    const near = 1 - Math.min(1, Math.max(0, h.get()) / JEGI.top);
    return { opacity: 0.18 + near * 0.3, transform: [{ translateX: (x.get() - 10) * scale }, { scaleX: 0.6 + near * 0.4 }] };
  });
  const footStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: (footX.get() - ART.footInstepX) * scale },
      { translateY: (ART.footLine - ART.footInstepY - footLift.get()) * scale },
    ],
  }));
  return (
    <>
      <Animated.View style={[styles.shadow, { top: (ART.footLine + 12) * scale, width: 20 * scale, height: 5 * scale }, shadowStyle]} />
      <Animated.View style={[styles.sprite, { width: ART.footSize * scale, height: ART.footSize * scale }, footStyle]}>
        <Image source={FOOT_SPRITE} style={StyleSheet.absoluteFill} contentFit="fill" />
      </Animated.View>
      <Animated.View style={[styles.sprite, { width: ART.jegiSize * scale, height: ART.jegiSize * scale }, jegiStyle]}>
        <Image source={JEGI_SPRITE} style={StyleSheet.absoluteFill} contentFit="fill" />
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  sprite: { position: 'absolute', left: 0, top: 0 },
  shadow: { position: 'absolute', left: 0, borderRadius: 999, backgroundColor: PixelPalette.outline },
});
