import { Image } from 'expo-image';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, View, type PanResponderGestureState } from 'react-native';

import { PixelRadius } from '@/components/game/pixel-theme';
import { AppText } from '@/components/ui';
import { PixelFx } from '@/fx/pixel-fx';

import { PARK_GOLF_BOUNDS, type ParkGolfHoleSpec } from './arcade-logic';
import { previewParkGolfPath, shotFromDrag, type ParkGolfShot, type Point } from './park-golf-physics';

const PUTTER_HEAD = require('../../assets/game/rpg/pixel/arcade/equip_putter.png');
const BALL_WHITE = require('../../assets/game/rpg/pixel/arcade/equip_ball.png');
// sprite-gen(codex gpt-6.2-sol) → pixelize arcadeart: 코스·벙커·홀컵·범퍼 픽셀 아트
const COURSE_GREEN = require('../../assets/game/rpg/pixel/arcadeart/course_green.png');
const BUNKER_SAND = require('../../assets/game/rpg/pixel/arcadeart/bunker.png');
const CUP_HOLE = require('../../assets/game/rpg/pixel/arcadeart/cup.png');
const BUMPER_LOG = require('../../assets/game/rpg/pixel/arcadeart/bumper.png');
const HOLE_FLAG = require('../../assets/game/rpg/pixel/arcade/equip_flag.png');

/** 퍼터가 공 뒤에 놓이는 거리(보드 %). 당길수록 PUTTER_PULL만큼 더 물러납니다. */
const PUTTER_REST = 8.5;
const PUTTER_PULL = 7;
/** 버튼 모드의 전체 예상 경로는 프레임마다 점이 있어 일부만 찍습니다. */
const PATH_DOT_EVERY = 6;
/** 당기는 동안 힘이 이 칸을 넘을 때마다 짧게 진동합니다. */
const POWER_TICKS = 4;
/** 공에서 이 거리(보드 %) 안을 눌러야 조준이 시작됩니다. 그 밖을 쓸면 화면이 평소처럼 스크롤됩니다. */
export const PARK_GOLF_GRAB_RADIUS = 20;

export type ParkGolfMode = 'drag' | 'button';
export const powerLabel = (power: number) => (power < 0.4 ? '약하게' : power < 0.75 ? '알맞게' : '세게');

export interface ParkGolfBoardProps {
  hole: ParkGolfHoleSpec;
  ballPos: Point;
  ballX: Animated.Value;
  ballY: Animated.Value;
  mode: ParkGolfMode;
  /** 버튼 모드에서 고른 샷과 그 전체 예상 경로. */
  buttonShot: ParkGolfShot;
  buttonPath: readonly Point[];
  canAim: boolean;
  rolling: boolean;
  holed: boolean;
  nacrePutter: boolean;
  onSize: (size: { width: number; height: number }) => void;
  /** 손을 뗐을 때. 너무 짧게 당겼으면 null. */
  onShot: (shot: ParkGolfShot | null) => void;
  onPowerTick: () => void;
  /** 당기기 시작/끝. 화면이 그동안 스크롤을 잠급니다. */
  onAimingChange: (aiming: boolean) => void;
}

export function ParkGolfBoard(props: ParkGolfBoardProps) {
  const { hole, ballPos, mode, canAim, rolling, holed } = props;
  const [drag, setDrag] = useState<Point | null>(null);
  const size = useRef({ width: 0, height: 0 });
  const tick = useRef(0);
  const canDrag = canAim && mode === 'drag';
  const handlers = { canDrag, ballPos, onShot: props.onShot, onPowerTick: props.onPowerTick, onAimingChange: props.onAimingChange };
  const live = useRef(handlers);
  useEffect(() => { live.current = handlers; });

  // eslint-disable-next-line react-hooks/refs -- 렌더 중이 아니라 PanResponder 콜백에서만 ref를 읽습니다.
  const [responder] = useState(() => {
    const toBoard = (gesture: PanResponderGestureState): Point => ({
      x: size.current.width > 0 ? (gesture.dx / size.current.width) * 100 : 0,
      y: size.current.height > 0 ? (gesture.dy / size.current.height) * 100 : 0,
    });
    return PanResponder.create({
      // 공 근처에서 누르기 시작했을 때만 조준합니다. 움직이는 도중에는 가로채지 않습니다.
      onStartShouldSetPanResponder: ({ nativeEvent }) => {
        const { width, height } = size.current;
        if (!live.current.canDrag || width <= 0 || height <= 0) return false;
        const ball = live.current.ballPos;
        return Math.hypot((nativeEvent.locationX / width) * 100 - ball.x, (nativeEvent.locationY / height) * 100 - ball.y) <= PARK_GOLF_GRAB_RADIUS;
      },
      // 당기는 동안 화면 스크롤이 손가락을 가져가지 않게 합니다.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        tick.current = 0;
        setDrag({ x: 0, y: 0 });
        live.current.onAimingChange(true);
      },
      onPanResponderMove: (_, gesture) => {
        const next = toBoard(gesture);
        setDrag(next);
        const step = Math.floor((shotFromDrag(next)?.power ?? 0) * POWER_TICKS);
        if (step !== tick.current) { tick.current = step; live.current.onPowerTick(); }
      },
      onPanResponderRelease: (_, gesture) => {
        setDrag(null);
        live.current.onAimingChange(false);
        if (live.current.canDrag) live.current.onShot(shotFromDrag(toBoard(gesture)));
      },
      onPanResponderTerminate: () => { setDrag(null); live.current.onAimingChange(false); },
    });
  });

  const dragShot = canDrag && drag ? shotFromDrag(drag) : null;
  const toCupDeg = (Math.atan2(hole.cup.x - ballPos.x, ballPos.y - hole.cup.y) * 180) / Math.PI;
  const shown: ParkGolfShot = mode === 'button' ? props.buttonShot : dragShot ?? { angleDeg: toCupDeg, power: 0 };
  const dots = mode === 'button'
    ? props.buttonPath.filter((_, i) => i > 0 && i % PATH_DOT_EVERY === 0)
    : dragShot ? previewParkGolfPath(hole, ballPos, dragShot) : [];
  const aimRad = (shown.angleDeg * Math.PI) / 180;
  const putterBack = PUTTER_REST + (mode === 'drag' ? shown.power * PUTTER_PULL : 0);
  const showAim = !holed && !rolling;
  const percent = Math.round((dragShot?.power ?? 0) * 100);

  return (
    <View
      style={styles.boardFrame}
      accessible
      // 누른 좌표를 항상 코스 기준으로 받기 위해 안쪽 그림은 터치를 받지 않습니다.
      pointerEvents="box-only"
      accessibilityLabel={`${hole.title} 코스. ${mode === 'drag' ? '공 주변을 누른 채 뒤로 당겼다 놓으면 공을 칩니다. 끌기가 어려우면 아래의 버튼으로 치기를 사용하세요.' : '아래 버튼으로 방향과 힘을 골라 칩니다.'}`}
      onLayout={({ nativeEvent }) => {
        const { width, height } = nativeEvent.layout;
        size.current = { width, height };
        props.onSize({ width, height });
      }}
      {...responder.panHandlers}>
      <Image source={COURSE_GREEN} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />
      <View pointerEvents="none" style={[styles.courseBoundary, {
        left: `${PARK_GOLF_BOUNDS.left}%`, top: `${PARK_GOLF_BOUNDS.top}%`,
        width: `${PARK_GOLF_BOUNDS.right - PARK_GOLF_BOUNDS.left}%`, height: `${PARK_GOLF_BOUNDS.bottom - PARK_GOLF_BOUNDS.top}%`,
      }]} />
      <View testID="parkgolf-bunker" pointerEvents="none" style={[styles.bunker, {
        left: `${hole.bunker.x - hole.bunker.rx}%`, top: `${hole.bunker.y - hole.bunker.ry}%`,
        width: `${hole.bunker.rx * 2}%`, height: `${hole.bunker.ry * 2}%`,
      }]}>
        <Image source={BUNKER_SAND} style={StyleSheet.absoluteFill} contentFit="fill" accessible={false} />
      </View>

      {/* 홀 데이터의 선분을 범퍼 충돌선과 같은 좌표에 그립니다. */}
      {hole.bumper ? (
        <View
          testID="parkgolf-bumper"
          style={[styles.bumperLine, { left: `${hole.bumper.x1}%`, top: `${hole.bumper.y1}%`, width: `${hole.bumper.x2 - hole.bumper.x1}%` }]}
          pointerEvents="none">
          <Image source={BUMPER_LOG} style={StyleSheet.absoluteFill} contentFit="fill" accessible={false} />
        </View>
      ) : null}

      {/* 점선 조준 궤적 (Art Bible §4 Colorblind Safety Rule 3: 상아 외곽선 + 주황/금빛 점) */}
      {showAim ? dots.map((pt, i) => (
        <View
          key={`traj-${i}`}
          testID="parkgolf-aim-dot"
          pointerEvents="none"
          style={[styles.trajectoryDot, { left: `${pt.x}%`, top: `${pt.y}%`, backgroundColor: i % 2 === 0 ? '#F0BF4F' : '#C2410C' }]}
        />
      )) : null}

      {/* 컵의 색칠된 영역이 실제 홀인 판정 범위입니다. */}
      <View
        testID="parkgolf-cup"
        pointerEvents="none"
        style={[
          styles.cupRing,
          { left: `${hole.cup.x - hole.cup.radius}%`, top: `${hole.cup.y - hole.cup.radius}%`, width: `${hole.cup.radius * 2}%`, height: `${hole.cup.radius * 2}%` },
        ]}>
        <Image source={CUP_HOLE} style={StyleSheet.absoluteFill} contentFit="contain" accessible={false} />
      </View>
      <Image
        source={HOLE_FLAG}
        pointerEvents="none"
        accessible={false}
        contentFit="contain"
        style={[styles.holeFlag, { left: `${hole.cup.x}%`, top: `${hole.cup.y}%` }]}
      />

      {/* 누를 자리 표시: 공 주변의 점선 원 */}
      {showAim && canDrag ? (
        <View testID="parkgolf-grab-ring" pointerEvents="none" style={[styles.grabRing, { left: `${ballPos.x}%`, top: `${ballPos.y}%` }]} />
      ) : null}

      {/* 공 뒤의 퍼터: 조준 방향을 따라 돌고, 당기는 만큼 뒤로 물러납니다. */}
      {showAim ? (
        <View
          pointerEvents="none"
          style={[
            styles.putterGuide,
            {
              left: `${ballPos.x - Math.sin(aimRad) * putterBack}%`,
              top: `${ballPos.y + Math.cos(aimRad) * putterBack}%`,
              transform: [{ rotate: `${shown.angleDeg - 90}deg` }],
            },
          ]}>
          <Image source={PUTTER_HEAD} style={styles.fill} contentFit="contain" accessible={false} />
          {props.nacrePutter ? <View testID="nacre-putter-decoration" style={styles.nacrePutterDecoration} /> : null}
        </View>
      ) : null}

      {/* 현재 파크골프 볼 (고시인성 상아백색 볼 + 두꺼운 다크 베벨) */}
      <Animated.View
        testID="parkgolf-ball"
        pointerEvents="none"
        style={[styles.golfBall, { left: 0, top: 0, transform: [{ translateX: props.ballX }, { translateY: props.ballY }] }]}>
        <Image source={BALL_WHITE} style={styles.fill} contentFit="contain" accessible={false} />
      </Animated.View>

      {/* 당기는 동안의 힘 게이지: 막대 길이 + 숫자 + 말로 함께 알려 줍니다. */}
      {canDrag && drag ? (
        <View testID="parkgolf-power-gauge" pointerEvents="none" style={styles.gauge}>
          <AppText variant="bodyStrong" style={styles.gaugeText}>
            {dragShot ? `힘 ${percent}% · ${powerLabel(dragShot.power)}` : '여기서 놓으면 취소 · 더 길게 당기면 칩니다'}
          </AppText>
          <View style={styles.gaugeTrack}>
            <View style={[styles.gaugeFill, { width: `${percent}%` }]} />
          </View>
        </View>
      ) : null}

      {/* 홀인 성공 VFX — pixelfx `pickups/collect-burst`를 금빛 팔레트로 구운 시트 */}
      {holed && !rolling ? (
        <View style={styles.holeInVfxLayer} pointerEvents="none">
          <PixelFx name="holein" scale={1.3} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  boardFrame: {
    width: '100%',
    height: 330,
    borderRadius: PixelRadius,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#6E4228',
    backgroundColor: '#0E5142',
    position: 'relative',
  },
  // 코스 그림 위에 실제 충돌 경계만 옅은 나무 테로 보여 줍니다.
  courseBoundary: { position: 'absolute', borderWidth: 3, borderColor: 'rgba(110, 66, 40, 0.55)' },
  bunker: { position: 'absolute' },
  bumperLine: { position: 'absolute', zIndex: 1, height: 14, marginTop: -7 },
  holeFlag: { position: 'absolute', zIndex: 3, width: 40, height: 40, marginLeft: -6, marginTop: -38 },
  trajectoryDot: {
    position: 'absolute', zIndex: 2, width: 10, height: 10, marginLeft: -5, marginTop: -5,
    borderRadius: 5, borderWidth: 2, borderColor: '#FCF9F2',
  },
  cupRing: { position: 'absolute', zIndex: 2 },
  grabRing: {
    position: 'absolute', zIndex: 1, width: 96, height: 96, marginLeft: -48, marginTop: -48,
    borderRadius: 48, borderWidth: 2, borderStyle: 'dashed', borderColor: '#FCF9F2',
  },
  putterGuide: {
    position: 'absolute', zIndex: 2, width: 58, height: 52, marginLeft: -29, marginTop: -26,
    alignItems: 'center', justifyContent: 'center', opacity: 0.94,
  },
  fill: { width: '100%', height: '100%' },
  nacrePutterDecoration: {
    position: 'absolute', right: 4, top: 9, width: 13, height: 13,
    backgroundColor: '#D55D79', borderWidth: 2, borderColor: '#FCF9F2',
    transform: [{ rotate: '45deg' }],
  },
  golfBall: {
    position: 'absolute', zIndex: 2, width: 32, height: 32, marginLeft: -16, marginTop: -16,
    alignItems: 'center', justifyContent: 'center',
  },
  gauge: {
    position: 'absolute', zIndex: 4, left: 8, right: 8, top: 8, gap: 4,
    backgroundColor: '#24382B', borderRadius: PixelRadius, borderWidth: 2, borderColor: '#F0BF4F',
    paddingHorizontal: 10, paddingVertical: 6,
  },
  gaugeText: { color: '#FCF9F2' },
  gaugeTrack: { height: 14, backgroundColor: '#18312B', borderWidth: 2, borderColor: '#FCF9F2' },
  gaugeFill: { height: '100%', backgroundColor: '#F0BF4F' },
  holeInVfxLayer: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 1,
    alignItems: 'center', justifyContent: 'center',
  },
});
