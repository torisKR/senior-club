/** 돌탑 쌓는 계곡(솔숲 산길). 균형·판정은 stones-logic의 순수 함수가 하고, 여기서는 프레임마다 그립니다. */
import { Image } from 'expo-image';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { useArcade } from '@/arcade/arcade-store';
import { playSfx } from '@/audio/sound-manager';
import { PixelPalette } from '@/components/game/pixel-theme';
import { AppText } from '@/components/ui';
import { useReduceMotion } from '@/fx/use-reduce-motion';

import { FIELD, PlayFlash, PlayShell, useEasyMode, useFrameLoop, usePlayRecords, type PlayOutcome } from './play-shell';
import {
  STONES, STONE_SHAPES, createStones, dropStone, hoverX, isWindyFloor, stepStones, towerHeight,
  type PlacedStone, type StoneKind, type StonesState,
} from './stones-logic';

const BACKGROUND = require('../../assets/game/rpg/pixel/play/stones_bg.png');
const SPRITES: Record<StoneKind, number> = {
  a: require('../../assets/game/rpg/pixel/play/stone_a.png'),
  b: require('../../assets/game/rpg/pixel/play/stone_b.png'),
  c: require('../../assets/game/rpg/pixel/play/stone_c.png'),
  d: require('../../assets/game/rpg/pixel/play/stone_d.png'),
  e: require('../../assets/game/rpg/pixel/play/stone_e.png'),
};
/** 그림 크기(원화 픽셀). 몸통 바닥은 그림 위에서 23픽셀 지점입니다. */
const SPRITE_WIDTH: Record<StoneKind, number> = { a: 48, b: 44, c: 38, d: 46, e: 34 };
const ART = { spriteHeight: 24, bodyBottom: 23, ground: 206, cameraStart: 118, maxTiltDeg: 3, skyColor: '#2F5D3A' } as const;
const LEAN_WARNING = 0.7;
const CAMERA_MS = 300;
const CUE_RANGE = STONES.perfect * 1.5;

type TowerView = Pick<StonesState, 'phase' | 'tower' | 'current' | 'next' | 'score' | 'lastGrade' | 'landSeq' | 'lean' | 'collapse'>;
const toView = (state: StonesState): TowerView => state;
const sameView = (a: TowerView, b: TowerView) => a.phase === b.phase && a.tower === b.tower && a.landSeq === b.landSeq;
const newSeed = () => Date.now() >>> 0;
const topX = ({ tower }: Pick<StonesState, 'tower'>) => tower[tower.length - 1].x;
const cameraFor = (tower: readonly PlacedStone[]) => Math.max(0, towerHeight(tower) - ART.cameraStart);

/** 각 돌 몸통 바닥의 높이(받침돌 바닥 기준) */
function stoneBottoms(tower: readonly PlacedStone[]): number[] {
  return tower.reduce<number[]>((bottoms, stone, index) => (
    index === 0 ? [0] : [...bottoms, bottoms[index - 1] + STONE_SHAPES[tower[index - 1].kind].height - STONES.sink]
  ), []);
}

function statusText(view: TowerView, slow: boolean): string {
  if (view.phase === 'over' || view.phase === 'collapsing') return view.score > 0 ? '탑이 기울어 무너졌어요.' : '돌이 떨어졌어요.';
  if (isWindyFloor(view.score, slow)) return '바람이 붑니다. 돌이 흔들려요.';
  if (Math.abs(view.lean) >= LEAN_WARNING) return `탑이 ${view.lean > 0 ? '오른쪽' : '왼쪽'}으로 기울었어요. 가운데에 올리세요.`;
  if (view.lastGrade === 'perfect') return '딱 맞았어요!';
  if (view.score > 0) return '잘 올렸어요. 다음 돌도 탑 위에서 놓으세요.';
  return '돌이 탑 위에 왔을 때 놀이판을 눌러 놓으세요.';
}

interface StonesMotion {
  stoneX: SharedValue<number>;
  gap: SharedValue<number>;
  fall: SharedValue<number>;
  lean: SharedValue<number>;
  camera: SharedValue<number>;
}

function useStonesMotion(initial: StonesState): StonesMotion {
  const stoneX = useSharedValue(hoverX(initial));
  const gap = useSharedValue(initial.dropGap);
  const fall = useSharedValue(0);
  const lean = useSharedValue(0);
  const camera = useSharedValue(0);
  return { stoneX, gap, fall, lean, camera };
}

/** 돌이 내려앉은 뒤 탑의 기울기와 화면 높이를 맞춥니다. */
function settleTower(motion: StonesMotion, next: StonesState, reduceMotion: boolean) {
  const tiltDeg = next.tower.length > 1 ? next.lean * ART.maxTiltDeg : 0;
  const cameraY = cameraFor(next.tower);
  const animate = !reduceMotion && next.tower.length > 1;
  motion.lean.set(animate ? withTiming(tiltDeg, { duration: CAMERA_MS }) : tiltDeg);
  motion.camera.set(animate ? withTiming(cameraY, { duration: CAMERA_MS }) : cameraY);
}

/** 놀이 상태를 쥐고, 한 걸음마다 그림 값·효과음·진동·결과를 맞춥니다. */
function useStonesGame(easy: boolean, reduceMotion: boolean) {
  const { state: arcade, triggerHaptic } = useArcade();
  const { best, finish } = usePlayRecords('stones');
  const [initial] = useState(() => createStones(newSeed(), { slow: easy }));
  const game = useRef(initial);
  const motion = useStonesMotion(initial);
  const [view, setView] = useState(() => toView(initial));
  const [outcome, setOutcome] = useState<PlayOutcome | null>(null);

  useEffect(() => {
    // 느린 모드를 바꾸면 지금 판에도 바로 적용합니다.
    game.current = { ...game.current, slow: easy };
  }, [easy]);

  const sync = (next: StonesState) => {
    const previous = game.current;
    if (next === previous) return;
    game.current = next;
    motion.stoneX.set(hoverX(next));
    motion.gap.set(next.dropGap);
    motion.fall.set(next.collapse ? (reduceMotion ? 1 : next.collapse.ms / STONES.collapseMs) : 0);
    if (next.tower !== previous.tower) settleTower(motion, next, reduceMotion);
    if (next.tower.length > previous.tower.length) {
      playSfx(next.lastGrade === 'perfect' && next.phase === 'aiming' ? 'tileMatch' : 'stoneClack', arcade.soundEnabled);
      triggerHaptic(next.phase === 'collapsing' ? 'medium' : 'light');
      if (next.phase === 'aiming') AccessibilityInfo.announceForAccessibility(`${next.score}층. 다음은 ${STONE_SHAPES[next.current].name}`);
    }
    if (next.phase === 'over' && previous.phase !== 'over') setOutcome(finish(next.score));
    if (next.phase === 'aiming' && previous.phase === 'over') setOutcome(null);
    const nextView = toView(next);
    setView((current) => (sameView(current, nextView) ? current : nextView));
  };

  useFrameLoop(view.phase !== 'over', (dtMs) => {
    const previous = game.current;
    const next = stepStones(previous, dtMs);
    const wasOver = Math.abs(hoverX(previous) - topX(previous)) <= CUE_RANGE;
    if (easy && next.phase === 'aiming' && !wasOver && Math.abs(hoverX(next) - topX(next)) <= CUE_RANGE) {
      // 느린 모드: 돌이 탑 바로 위에 왔다는 신호를 진동과 소리로 줍니다.
      triggerHaptic('light');
      playSfx('tileMatch', arcade.soundEnabled);
    }
    sync(next);
  });

  const drop = () => sync(dropStone(game.current));
  const retry = () => sync(createStones(newSeed(), { slow: easy }));
  return { view, outcome, best, motion, drop, retry };
}

export function StonesScreen() {
  const reduceMotion = useReduceMotion() !== false;
  const [easy, toggleEasy] = useEasyMode();
  const { view, outcome, best, motion, drop, retry } = useStonesGame(easy, reduceMotion);

  return (
    <PlayShell
      testID="stones-screen"
      scoreLabel={`돌탑 ${view.score}층`}
      bestLabel={`최고 기록 ${Math.max(best, view.score)}층`}
      status={statusText(view, easy)}
      aside={<NextStone kind={view.next} />}
      easy={easy}
      onToggleEasy={toggleEasy}
      actionLabel="놓기"
      actionHint={easy ? '돌이 탑 위에 오면 신호가 울립니다. 그때 누르세요' : '좌우로 오가는 돌을 지금 자리에서 떨어뜨립니다'}
      onAction={drop}
      onFieldPress={drop}
      outcome={outcome}
      resultTitle={`돌탑 ${view.score}층`}
      unit="층"
      onRetry={retry}
      fieldColor={ART.skyColor}>
      {(scale) => <StoneField view={view} scale={scale} motion={motion} sparkle={!reduceMotion} />}
    </PlayShell>
  );
}

function StoneField({ view, scale, motion, sparkle }: { view: TowerView; scale: number; motion: StonesMotion; sparkle: boolean }) {
  const bottoms = stoneBottoms(view.tower);
  const top = towerHeight(view.tower);
  const holding = view.phase === 'aiming' || view.phase === 'falling';
  return (
    <World scale={scale} camera={motion.camera}>
      <Image source={BACKGROUND} style={StyleSheet.absoluteFill} contentFit="fill" />
      <Tower scale={scale} lean={motion.lean}>
        {view.tower.map((stone, index) => (
          <TowerStone
            key={index}
            stone={stone}
            bottom={bottoms[index]}
            scale={scale}
            fall={motion.fall}
            tumble={view.collapse && index >= view.collapse.from ? { dir: view.collapse.dir, order: index - view.collapse.from } : null}
          />
        ))}
        {view.lastGrade === 'perfect' && view.phase === 'aiming' ? (
          <PlayFlash key={view.landSeq} label="딱 맞음!" sparkle={sparkle} x={topX(view)} y={ART.ground - top - 44} scale={scale} />
        ) : null}
      </Tower>
      {holding ? (
        <HeldStone kind={view.current} scale={scale} restTop={ART.ground - (top - STONES.sink) - ART.bodyBottom} x={motion.stoneX} gap={motion.gap} />
      ) : null}
    </World>
  );
}

function NextStone({ kind }: { kind: StoneKind }) {
  return (
    <View style={styles.next} accessible accessibilityLabel={`다음 돌: ${STONE_SHAPES[kind].name}`}>
      <AppText variant="caption" color={PixelPalette.inkSoft}>다음 돌</AppText>
      <Image source={SPRITES[kind]} style={{ width: SPRITE_WIDTH[kind], height: ART.spriteHeight }} contentFit="fill" />
    </View>
  );
}

/** 탑이 높아지면 배경째 아래로 내려 꼭대기가 늘 보이게 합니다. */
function World({ scale, camera, children }: { scale: number; camera: SharedValue<number>; children: ReactNode }) {
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: camera.get() * scale }] }));
  return <Animated.View style={[StyleSheet.absoluteFill, style]}>{children}</Animated.View>;
}

/** 탑 전체가 받침돌 바닥을 축으로 기웁니다. */
function Tower({ scale, lean, children }: { scale: number; lean: SharedValue<number>; children: ReactNode }) {
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${lean.get()}deg` }] }));
  return (
    <Animated.View style={[styles.tower, { width: FIELD.width * scale, height: ART.ground * scale }, style]}>{children}</Animated.View>
  );
}

interface TowerStoneProps {
  stone: PlacedStone;
  bottom: number;
  scale: number;
  fall: SharedValue<number>;
  /** 무너질 때 굴러떨어지는 돌이면 방향과 순서 */
  tumble: { dir: -1 | 1; order: number } | null;
}

function TowerStone({ stone, bottom, scale, fall, tumble }: TowerStoneProps) {
  const dir = tumble?.dir ?? 0;
  const order = tumble?.order ?? 0;
  const style = useAnimatedStyle(() => {
    const t = dir === 0 ? 0 : fall.get();
    return {
      transform: [
        { translateX: dir * (30 + order * 8) * t * scale },
        { translateY: t * t * (120 + order * 20) * scale },
        { rotate: `${dir * t * (60 + order * 15)}deg` },
      ],
    };
  });
  const width = SPRITE_WIDTH[stone.kind];
  return (
    <Animated.View
      style={[styles.stone, {
        left: (stone.x - width / 2) * scale, top: (ART.ground - bottom - ART.bodyBottom) * scale,
        width: width * scale, height: ART.spriteHeight * scale,
      }, style]}>
      <Image source={SPRITES[stone.kind]} style={StyleSheet.absoluteFill} contentFit="fill" />
    </Animated.View>
  );
}

/** 좌우로 오가다 떨어지는, 손에 든 돌. gap은 탑 꼭대기까지 남은 거리입니다. */
function HeldStone({ kind, scale, restTop, x, gap }: { kind: StoneKind; scale: number; restTop: number; x: SharedValue<number>; gap: SharedValue<number> }) {
  const width = SPRITE_WIDTH[kind];
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: (x.get() - width / 2) * scale }, { translateY: (restTop - gap.get()) * scale }],
  }));
  return (
    <Animated.View style={[styles.stone, { left: 0, top: 0, width: width * scale, height: ART.spriteHeight * scale }, style]}>
      <Image source={SPRITES[kind]} style={StyleSheet.absoluteFill} contentFit="fill" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tower: { position: 'absolute', left: 0, top: 0, transformOrigin: 'bottom' },
  stone: { position: 'absolute' },
  next: { alignItems: 'center', gap: 2, minWidth: 64 },
});
