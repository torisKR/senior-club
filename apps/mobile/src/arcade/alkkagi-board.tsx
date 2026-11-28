import { Image } from 'expo-image';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Pressable, StyleSheet, View } from 'react-native';

import { PixelRadius } from '@/components/game/pixel-theme';
import { AppText } from '@/components/ui';
import { FontWeights } from '@/constants/theme';
import { FX_MANIFEST } from '@/fx/fx-manifest';
import { PixelFx } from '@/fx/pixel-fx';

import type { AlkkagiStone } from './arcade-logic';
import {
  ALKKAGI_BOARD_SIZE, ALKKAGI_FRAME_MS, ALKKAGI_MAX_PULL, ALKKAGI_MIN_POWER, ALKKAGI_RADIUS, pullPower, shotFromPull,
  type AlkkagiHit, type AlkkagiShot,
} from './alkkagi-physics';

const MIN_TOUCH = 48;
/** 돌 근처 이만큼(판 단위) 안을 누르면 그 돌을 잡습니다 — 손가락이 커도 잡히도록 넉넉하게. */
const GRAB_RADIUS = ALKKAGI_RADIUS * 1.9;
/** 힘 100%일 때 조준 점선 길이 (판 단위) */
const AIM_LENGTH = 46;
const AIM_DOTS = 7;
const FADE_FRAMES = 6;
const IMPACT_SCALE = 0.85;
const MAX_IMPACTS = 4;

export interface AlkkagiPlayback {
  key: number;
  frames: AlkkagiStone[][];
  hits: AlkkagiHit[];
  aiStartFrame: number | null;
}

/** 화면(alkkagi-screen)이 정적 require 로 넘겨 주는 기존 픽셀 에셋 */
export interface AlkkagiBoardArt { board: number; blackStone: number; whiteStone: number }

export interface AlkkagiBoardProps {
  art: AlkkagiBoardArt;
  /** 판 한 변의 길이(dp) */
  size: number;
  /** 멈춰 있는 판의 상태 */
  stones: readonly AlkkagiStone[];
  /** 재생할 움직임. null 이면 stones 를 그대로 보여 줍니다. */
  playback: AlkkagiPlayback | null;
  /** true: 끌어서 튕기기 · false: 돌을 눌러 고르기(버튼으로 튕기기) */
  dragEnabled: boolean;
  locked: boolean;
  shooterId?: string;
  targetId?: string;
  /** 버튼 조작에서 고른 힘(0~1) — 조준 점선 길이 */
  buttonPower: number;
  celadon: boolean;
  onSelectStone: (stone: AlkkagiStone) => void;
  onFlick: (shot: AlkkagiShot) => void;
  onHit: () => void;
  onOpponentStart: () => void;
  onPlaybackDone: () => void;
}

interface Drag { id: string; x: number; y: number; pullX: number; pullY: number }
interface Aim { x: number; y: number; dirX: number; dirY: number; power: number }

function aimDots(aim: Aim, unit: number) {
  const length = Math.max(ALKKAGI_RADIUS + 3, aim.power * AIM_LENGTH);
  return Array.from({ length: AIM_DOTS }, (_, index) => {
    const along = ALKKAGI_RADIUS + ((length - ALKKAGI_RADIUS) * (index + 1)) / AIM_DOTS;
    return { key: index, left: (aim.x + aim.dirX * along) * unit, top: (aim.y + aim.dirY * along) * unit };
  });
}

/** 재생 프레임을 돌마다 네이티브 드라이버용 보간 트랙으로 바꿉니다. */
function buildTracks(playback: AlkkagiPlayback, progress: Animated.Value, unit: number) {
  const inputRange = playback.frames.map((_, index) => index);
  return playback.frames[0].map((stone, index) => {
    const outAt = playback.frames.findIndex((frame) => !frame[index].alive);
    return {
      stone,
      x: progress.interpolate({ inputRange, outputRange: playback.frames.map((frame) => frame[index].x * unit) }),
      y: progress.interpolate({ inputRange, outputRange: playback.frames.map((frame) => frame[index].y * unit) }),
      opacity: progress.interpolate({
        inputRange,
        outputRange: inputRange.map((frame) => (outAt < 0 || frame < outAt ? 1 : Math.max(0, 1 - (frame - outAt + 1) / FADE_FRAMES))),
      }),
    };
  }).filter((track) => track.stone.alive);
}

function StoneFace({ stone, diameter, celadon, art }: { stone: AlkkagiStone; diameter: number; celadon: boolean; art: AlkkagiBoardArt }) {
  const mine = stone.owner === 'player';
  return (
    <>
      <Image source={mine ? art.blackStone : art.whiteStone} style={{ width: diameter, height: diameter }} contentFit="contain" />
      <AppText style={[styles.stoneLabel, mine ? styles.playerStoneLabel : styles.enemyStoneLabel]}>
        {mine ? '★' : '◎'}{stone.id.slice(1)}
      </AppText>
      {mine && celadon ? <View testID={`celadon-stone-decoration-${stone.id}`} style={styles.celadonStoneMark} /> : null}
    </>
  );
}

export function AlkkagiBoard(props: AlkkagiBoardProps) {
  const { art, size, stones, playback, dragEnabled, locked, shooterId, targetId, buttonPower, celadon } = props;
  const unit = size / ALKKAGI_BOARD_SIZE;
  const diameter = ALKKAGI_RADIUS * 2 * unit;
  const touch = Math.max(MIN_TOUCH, diameter);
  const latest = useRef(props);
  useEffect(() => { latest.current = props; });
  const [progress] = useState(() => new Animated.Value(0));
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [impact, setImpact] = useState<{ key: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!playback) return undefined;
    const last = playback.frames.length - 1;
    progress.setValue(0);
    const timers = playback.hits.slice(0, MAX_IMPACTS * 2).map((hit, index) => setTimeout(() => {
      latest.current.onHit();
      if (index < MAX_IMPACTS) setImpact({ key: playback.key * 100 + index, x: hit.x, y: hit.y });
    }, hit.frame * ALKKAGI_FRAME_MS));
    if (playback.aiStartFrame !== null) {
      timers.push(setTimeout(() => latest.current.onOpponentStart(), playback.aiStartFrame * ALKKAGI_FRAME_MS));
    }
    const animation = Animated.timing(progress, {
      toValue: last, duration: last * ALKKAGI_FRAME_MS, easing: Easing.linear, useNativeDriver: true,
    });
    animation.start(({ finished }) => { if (finished) latest.current.onPlaybackDone(); });
    return () => {
      animation.stop();
      timers.forEach(clearTimeout);
    };
  }, [playback, progress]);

  const tracks = useMemo(() => (playback ? buildTracks(playback, progress, unit) : null), [playback, progress, unit]);

  // eslint-disable-next-line react-hooks/refs -- 렌더 중이 아니라 PanResponder 콜백에서만 ref를 읽습니다.
  const [responder] = useState(() => {
    const grab = (event: { nativeEvent: { locationX: number; locationY: number } }) => {
      const current = latest.current;
      if (!current.dragEnabled || current.locked || current.playback) return null;
      const scale = current.size / ALKKAGI_BOARD_SIZE;
      const x = event.nativeEvent.locationX / scale;
      const y = event.nativeEvent.locationY / scale;
      const near = current.stones
        .filter((stone) => stone.alive && stone.owner === 'player')
        .map((stone) => ({ stone, distance: Math.hypot(stone.x - x, stone.y - y) }))
        .filter((item) => item.distance <= GRAB_RADIUS)
        .sort((a, b) => a.distance - b.distance)[0];
      return near?.stone ?? null;
    };
    const update = (next: Drag | null) => { dragRef.current = next; setDrag(next); };
    return PanResponder.create({
      onStartShouldSetPanResponder: (event) => grab(event) !== null,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        const stone = grab(event);
        if (!stone) return;
        latest.current.onSelectStone(stone);
        update({ id: stone.id, x: stone.x, y: stone.y, pullX: 0, pullY: 0 });
      },
      onPanResponderMove: (_, gesture) => {
        const current = dragRef.current;
        if (!current) return;
        const scale = latest.current.size / ALKKAGI_BOARD_SIZE;
        update({ ...current, pullX: gesture.dx / scale, pullY: gesture.dy / scale });
      },
      onPanResponderRelease: () => {
        const current = dragRef.current;
        update(null);
        const shot = current ? shotFromPull(current.id, current.pullX, current.pullY) : null;
        if (shot) latest.current.onFlick(shot);
      },
      onPanResponderTerminate: () => update(null),
    });
  });

  const shooter = stones.find((stone) => stone.id === shooterId && stone.alive);
  const target = stones.find((stone) => stone.id === targetId && stone.alive);
  const dragPower = drag ? pullPower(drag.pullX, drag.pullY) : 0;
  const pullLength = drag ? Math.hypot(drag.pullX, drag.pullY) : 0;
  let aim: Aim | null = null;
  if (drag && pullLength > 0) {
    aim = { x: drag.x, y: drag.y, dirX: -drag.pullX / pullLength, dirY: -drag.pullY / pullLength, power: dragPower };
  } else if (!dragEnabled && !playback && !locked && shooter && target) {
    const distance = Math.hypot(target.x - shooter.x, target.y - shooter.y) || 1;
    aim = { x: shooter.x, y: shooter.y, dirX: (target.x - shooter.x) / distance, dirY: (target.y - shooter.y) / distance, power: buttonPower };
  }
  const pullScale = pullLength > ALKKAGI_MAX_PULL ? ALKKAGI_MAX_PULL / pullLength : 1;

  const stoneStyle = (stone: AlkkagiStone) => [
    { width: touch, height: touch, borderRadius: touch / 2 },
    styles.stoneBase,
    stone.owner === 'player' && celadon && styles.celadonStone,
    (drag ? drag.id === stone.id : !dragEnabled && shooterId === stone.id) && styles.selectedShooterRing,
    !dragEnabled && !drag && targetId === stone.id && styles.selectedTargetRing,
  ];
  const stoneLabel = (stone: AlkkagiStone) => `${stone.owner === 'player' ? '내 흑석' : '상대 백석'} ${stone.id.slice(1)}번`;

  return (
    <View
      testID="alkkagi-board"
      {...responder.panHandlers}
      accessibilityLabel={dragEnabled ? '알까기 바둑판. 내 흑석을 누른 채 뒤로 당겼다 놓으면 튕겨 나갑니다.' : '알까기 바둑판'}
      style={[styles.boardFrame, { width: size, height: size }]}>
      <View pointerEvents={dragEnabled ? 'none' : 'box-none'} style={StyleSheet.absoluteFill}>
        <Image source={art.board} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />
        {Array.from({ length: 9 }, (_, index) => (
          <React.Fragment key={`grid-${index}`}>
            <View pointerEvents="none" style={[styles.gridVertical, { left: `${10 + index * 10}%` }]} />
            <View pointerEvents="none" style={[styles.gridHorizontal, { top: `${10 + index * 10}%` }]} />
          </React.Fragment>
        ))}

        {aim ? aimDots(aim, unit).map((dot) => (
          <View key={`aim-${dot.key}`} testID={`alkkagi-aim-dot-${dot.key}`} pointerEvents="none" style={[styles.aimDot, { left: dot.left, top: dot.top }]} />
        )) : null}
        {drag && pullLength > 0 ? (
          <View
            testID="alkkagi-pull-handle"
            pointerEvents="none"
            style={[styles.pullHandle, { left: (drag.x + drag.pullX * pullScale) * unit, top: (drag.y + drag.pullY * pullScale) * unit }]}
          />
        ) : null}

        {tracks ? tracks.map((track) => (
          <Animated.View
            key={track.stone.id}
            pointerEvents="none"
            style={[styles.stoneAnchor, { opacity: track.opacity, transform: [{ translateX: track.x }, { translateY: track.y }] }]}>
            <View style={[stoneStyle(track.stone), { marginLeft: -touch / 2, marginTop: -touch / 2 }]}>
              <StoneFace stone={track.stone} diameter={diameter} celadon={celadon} art={art} />
            </View>
          </Animated.View>
        )) : stones.filter((stone) => stone.alive).map((stone) => (
          <Pressable
            key={stone.id}
            testID={`alkkagi-stone-${stone.id}`}
            accessibilityRole="button"
            accessibilityLabel={stoneLabel(stone)}
            accessibilityState={{ selected: !dragEnabled && (shooterId === stone.id || targetId === stone.id) }}
            onPress={() => props.onSelectStone(stone)}
            style={[...stoneStyle(stone), { left: stone.x * unit - touch / 2, top: stone.y * unit - touch / 2 }]}>
            <StoneFace stone={stone} diameter={diameter} celadon={celadon} art={art} />
          </Pressable>
        ))}

        {impact ? (
          <PixelFx
            key={impact.key}
            name="impact"
            scale={IMPACT_SCALE}
            onDone={() => setImpact(null)}
            style={{
              position: 'absolute',
              left: impact.x * unit - (FX_MANIFEST.impact.frameWidth * IMPACT_SCALE) / 2,
              top: impact.y * unit - (FX_MANIFEST.impact.frameHeight * IMPACT_SCALE) / 2,
            }}
          />
        ) : null}

        {drag ? (
          <View testID="alkkagi-drag-power" style={styles.powerBadge} pointerEvents="none">
            <AppText variant="bodyStrong" style={styles.powerBadgeText}>
              {dragPower < ALKKAGI_MIN_POWER ? '조금 더 당기세요' : `힘 ${Math.round(dragPower * 100)}% · 놓으면 튕겨요`}
            </AppText>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  boardFrame: {
    alignSelf: 'center',
    borderRadius: PixelRadius,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#6E4228',
    backgroundColor: '#D8B384',
    position: 'relative',
  },
  gridVertical: { position: 'absolute', top: '10%', bottom: '10%', width: 1, backgroundColor: '#86552F' },
  gridHorizontal: { position: 'absolute', left: '10%', right: '10%', height: 1, backgroundColor: '#86552F' },
  stoneAnchor: { position: 'absolute', left: 0, top: 0, width: 0, height: 0 },
  stoneBase: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  stoneLabel: { position: 'absolute', fontSize: 12, lineHeight: 17, fontFamily: FontWeights.strong },
  playerStoneLabel: { color: '#FFF1C7' },
  enemyStoneLabel: { color: '#182620' },
  celadonStone: { borderWidth: 2, borderColor: '#87CFB9' },
  celadonStoneMark: {
    position: 'absolute', right: 6, top: 5, width: 8, height: 8,
    backgroundColor: '#DDF7EC', borderColor: '#176C62', borderWidth: 1,
    transform: [{ rotate: '45deg' }],
  },
  selectedShooterRing: { borderWidth: 3.5, borderColor: '#F0BF4F' },
  selectedTargetRing: { borderWidth: 3.5, borderColor: '#C2410C', borderStyle: 'dashed' },
  aimDot: {
    position: 'absolute', width: 10, height: 10, marginLeft: -5, marginTop: -5, borderRadius: 5,
    backgroundColor: '#F0BF4F', borderWidth: 2, borderColor: '#182620',
  },
  pullHandle: {
    position: 'absolute', width: 22, height: 22, marginLeft: -11, marginTop: -11, borderRadius: 11,
    borderWidth: 3, borderColor: '#182620', backgroundColor: 'rgba(252, 249, 242, 0.7)',
  },
  powerBadge: {
    position: 'absolute', top: 6, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: PixelRadius, backgroundColor: '#182620', borderWidth: 2, borderColor: '#F0BF4F',
  },
  powerBadgeText: { color: '#FCF9F2' },
});
