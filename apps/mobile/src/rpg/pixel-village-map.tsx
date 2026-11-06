import { Image } from 'expo-image';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { WALK_LINES } from './companion-lines';
import type { NpcId } from './bond-logic';
import { getVillageTile, VILLAGE_BUILDINGS, VILLAGE_GRID_SIZE, VILLAGE_NPCS } from './rpg-logic';
import {
  BUILDING_SPRITES,
  npcSpriteFor,
  playerSpriteForTier,
  playerTierForCp,
  TILE_SPRITES,
} from './rpg-sprites';
import type { VillageTile } from './rpg-types';
import { useRpg } from './rpg-store';
import { useArcade } from '@/arcade/arcade-store';
import { useReduceMotion } from '@/fx/use-reduce-motion';

/** 타일 1칸의 논리 크기(dp) */
export const TILE_DP = 48;
/** 맵 전체 크기(dp) = 15 x 15 x 48 = 720 */
export const MAP_PIXEL_SIZE = TILE_DP * VILLAGE_GRID_SIZE;
/** 뷰포트 높이(dp). 화면 폭은 부모 폭을 그대로 사용합니다. */
export const MAP_VIEWPORT_HEIGHT = 440;

const PLAYER_SPRITE_DP = 88;
const NPC_SPRITE_DP = 80;

/** 스프라이트를 타일 아래쪽에 세워두기 위한 오프셋 */
const PLAYER_OFFSET_X = PLAYER_SPRITE_DP / 2 - TILE_DP / 2;
const PLAYER_OFFSET_Y = PLAYER_SPRITE_DP - TILE_DP - 6;
const NPC_OFFSET_X = NPC_SPRITE_DP / 2 - TILE_DP / 2;
const NPC_OFFSET_Y = NPC_SPRITE_DP - TILE_DP - 4;

const WALK_FRAME_MS = 130;
const IDLE_FRAME_MS = 260;

type FacingDirection = 'down' | 'side' | 'up';

interface FacingState {
  direction: FacingDirection;
  flipped: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function baseTileSprite(tile: VillageTile) {
  return tile.type === 'path' ? TILE_SPRITES.path : TILE_SPRITES.grass;
}

function decorSprite(tile: VillageTile) {
  switch (tile.type) {
    case 'water':
      return TILE_SPRITES.water;
    case 'fence':
      return TILE_SPRITES.fence;
    case 'tree':
      return tile.variant === 'cherry' ? TILE_SPRITES.cherry : TILE_SPRITES.pine;
    case 'flower':
      return TILE_SPRITES.flower;
    case 'lantern':
      return TILE_SPRITES.lantern;
    default:
      return null;
  }
}

function NpcSprite({
  npcId,
  x,
  y,
  delayMs,
  reduceMotion,
}: {
  npcId: string;
  x: number;
  y: number;
  delayMs: number;
  reduceMotion: boolean | null;
}) {
  const [bob] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion !== false) {
      bob.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(delayMs),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob, delayMs, reduceMotion]);

  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -3] });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.npcSprite,
        {
          left: x * TILE_DP - NPC_OFFSET_X,
          top: y * TILE_DP - NPC_OFFSET_Y,
          transform: [{ translateY }],
        },
      ]}>
      <Image source={npcSpriteFor(npcId)} style={styles.npcImage} contentFit="contain" />
    </Animated.View>
  );
}

/**
 * 15 x 15 청솔 시니어 마을 픽셀 타일 맵.
 * useRpg() 의 playerPos 를 읽어 카메라가 주인공을 따라가고,
 * 4방향 걷기 애니메이션 스프라이트로 주인공을 그립니다.
 */
export function PixelVillageMap() {
  const { state } = useRpg();
  const { state: arcadeState } = useArcade();
  const reduceMotion = useReduceMotion();
  const playerPos = state.playerPos;
  const companionId = state.companionId;

  // 동행 산책: NPC가 플레이어의 직전 타일을 따라옵니다 (경로 탐색 없이 한 칸 뒤).
  const lastPlayerPos = useRef(playerPos);
  const [companionPos, setCompanionPos] = useState<{
    npcId: NpcId;
    x: number;
    y: number;
  } | null>(null);
  const [walkLine, setWalkLine] = useState<{ npcId: NpcId; text: string } | null>(null);
  const walkSteps = useRef(0);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const previous = lastPlayerPos.current;
    if (previous.x === playerPos.x && previous.y === playerPos.y) return;
    lastPlayerPos.current = playerPos;
    if (!companionId) return;

    setCompanionPos({ npcId: companionId, x: previous.x, y: previous.y });
    walkSteps.current += 1;
    if (walkSteps.current % 3 === 0) {
      const lines = WALK_LINES[companionId];
      const text = lines[Math.floor(walkSteps.current / 3) % lines.length];
      setWalkLine({ npcId: companionId, text });
      if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
      bubbleTimer.current = setTimeout(() => setWalkLine(null), 4200);
    }
  }, [playerPos, companionId]);

  useEffect(
    () => () => {
      if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    },
    [],
  );

  const [viewport, setViewport] = useState({ width: 0, height: MAP_VIEWPORT_HEIGHT });
  const [walking, setWalking] = useState(false);
  const [frame, setFrame] = useState(0);
  const [facing, setFacing] = useState<FacingState>({ direction: 'down', flipped: false });

  const previousPlayerPos = useRef(playerPos);

  const [cameraX] = useState(() => new Animated.Value(0));
  const [cameraY] = useState(() => new Animated.Value(0));
  const [playerX] = useState(
    () => new Animated.Value(playerPos.x * TILE_DP - PLAYER_OFFSET_X),
  );
  const [playerY] = useState(
    () => new Animated.Value(playerPos.y * TILE_DP - PLAYER_OFFSET_Y),
  );

  const tiles = useMemo(() => {
    const out: VillageTile[] = [];
    for (let y = 0; y < VILLAGE_GRID_SIZE; y += 1) {
      for (let x = 0; x < VILLAGE_GRID_SIZE; x += 1) {
        out.push(getVillageTile(x, y));
      }
    }
    return out;
  }, []);

  const playerCenterX = (playerPos.x + 0.5) * TILE_DP;
  const playerCenterY = (playerPos.y + 0.5) * TILE_DP;

  const maxCameraX = Math.max(0, MAP_PIXEL_SIZE - viewport.width);
  const maxCameraY = Math.max(0, MAP_PIXEL_SIZE - viewport.height);
  const cameraTargetX = clamp(playerCenterX - viewport.width / 2, 0, maxCameraX);
  const cameraTargetY = clamp(playerCenterY - viewport.height / 2, 0, maxCameraY);

  // 카메라: 주인공 중심을 따라 부드럽게 이동 (뷰포트 밖으로 나가지 않게 클램프)
  useEffect(() => {
    if (reduceMotion !== false) {
      cameraX.setValue(-cameraTargetX);
      cameraY.setValue(-cameraTargetY);
      return;
    }
    const animation = Animated.parallel([
      Animated.spring(cameraX, {
        toValue: -cameraTargetX,
        useNativeDriver: true,
        damping: 22,
        stiffness: 180,
        mass: 0.9,
      }),
      Animated.spring(cameraY, {
        toValue: -cameraTargetY,
        useNativeDriver: true,
        damping: 22,
        stiffness: 180,
        mass: 0.9,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [cameraTargetX, cameraTargetY, cameraX, cameraY, reduceMotion]);

  // 주인공 이동: 타일 단위 이동을 부드럽게 보간
  useEffect(() => {
    if (reduceMotion !== false) {
      playerX.setValue(playerPos.x * TILE_DP - PLAYER_OFFSET_X);
      playerY.setValue(playerPos.y * TILE_DP - PLAYER_OFFSET_Y);
      return;
    }
    const animation = Animated.parallel([
      Animated.spring(playerX, {
        toValue: playerPos.x * TILE_DP - PLAYER_OFFSET_X,
        useNativeDriver: true,
        damping: 24,
        stiffness: 260,
        mass: 0.8,
      }),
      Animated.spring(playerY, {
        toValue: playerPos.y * TILE_DP - PLAYER_OFFSET_Y,
        useNativeDriver: true,
        damping: 24,
        stiffness: 260,
        mass: 0.8,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [playerPos.x, playerPos.y, playerX, playerY, reduceMotion]);

  // 방향 전환 + 걷기 상태 (이동이 멈추면 idle 프레임으로 복귀)
  useEffect(() => {
    const previous = previousPlayerPos.current;
    const dx = playerPos.x - previous.x;
    const dy = playerPos.y - previous.y;
    if (dx === 0 && dy === 0) return;

    previousPlayerPos.current = playerPos;
    if (dx !== 0) {
      setFacing({ direction: 'side', flipped: dx < 0 });
    } else {
      setFacing({ direction: dy < 0 ? 'up' : 'down', flipped: false });
    }
    setWalking(true);
    const timer = setTimeout(() => setWalking(false), 200);
    return () => clearTimeout(timer);
  }, [playerPos]);

  // 프레임 사이클: 걷는 중 130ms, 서 있을 때 260ms
  useEffect(() => {
    if (reduceMotion !== false) return;
    const period = walking ? WALK_FRAME_MS : IDLE_FRAME_MS;
    const interval = setInterval(() => setFrame((current) => (current + 1) % 4), period);
    return () => clearInterval(interval);
  }, [walking, reduceMotion]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setViewport((current) =>
      current.width === width && current.height === height ? current : { width, height },
    );
  };

  const playerSprite = playerSpriteForTier(
    playerTierForCp(arcadeState.cp), facing.direction,
    reduceMotion === false && walking, reduceMotion === false ? frame : 0,
  );

  return (
    <View
      testID="rpg-pixel-village-map"
      style={styles.viewport}
      onLayout={handleLayout}
      accessibilityLabel="청솔 시니어 마을 지도">
      <Animated.View
        style={[
          styles.mapLayer,
          { transform: [{ translateX: cameraX }, { translateY: cameraY }] },
        ]}>
        {/* 1) 바닥 타일 (잔디 / 돌담길) */}
        {tiles.map((tile) => (
          <Image
            key={`base-${tile.x}-${tile.y}`}
            source={baseTileSprite(tile)}
            style={[styles.tile, { left: tile.x * TILE_DP, top: tile.y * TILE_DP }]}
            contentFit="fill"
            accessibilityIgnoresInvertColors
          />
        ))}

        {/* 2) 장식 타일 (물 / 돌담 / 나무 / 꽃밭 / 석등) */}
        {tiles.map((tile) => {
          const sprite = decorSprite(tile);
          if (!sprite) return null;
          return (
            <Image
              key={`decor-${tile.x}-${tile.y}`}
              source={sprite}
              style={[styles.tile, { left: tile.x * TILE_DP, top: tile.y * TILE_DP }]}
              contentFit="fill"
              accessibilityIgnoresInvertColors
            />
          );
        })}

        {/* 3) 시설 건물 (풋프린트 아래쪽에 맞춰 144 x 144dp 로 그립니다) */}
        {VILLAGE_BUILDINGS.map((building) => {
          const size = building.width * TILE_DP;
          return (
            <Image
              key={`building-${building.id}`}
              source={BUILDING_SPRITES[building.id]}
              style={[
                styles.building,
                {
                  left: building.x * TILE_DP + (building.width * TILE_DP - size) / 2,
                  top: (building.y + building.height) * TILE_DP - size,
                  width: size,
                  height: size,
                },
              ]}
              contentFit="contain"
              accessibilityIgnoresInvertColors
              accessibilityLabel={building.name}
            />
          );
        })}

        {/* 4) 마을 NPC (은은한 위아래 흔들림) — 동행 중인 사람은 원래 자리에서 숨깁니다 */}
        {VILLAGE_NPCS.filter((npc) => npc.id !== companionId).map((npc, index) => (
          <NpcSprite
            key={`npc-${npc.id}`}
            npcId={npc.id}
            x={npc.x}
            y={npc.y}
            delayMs={index * 180}
            reduceMotion={reduceMotion}
          />
        ))}

        {/* 4-1) 동행 중인 NPC — 주인공 한 칸 뒤를 따라옵니다 */}
        {companionId
          ? (() => {
              const shown =
                companionPos && companionPos.npcId === companionId
                  ? companionPos
                  : { x: playerPos.x, y: playerPos.y };
              return (
                <>
                  <NpcSprite npcId={companionId} x={shown.x} y={shown.y} delayMs={0} reduceMotion={reduceMotion} />
                  {walkLine && walkLine.npcId === companionId ? (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.walkBubble,
                        { left: shown.x * TILE_DP - 60, top: shown.y * TILE_DP - 104 },
                      ]}>
                      <Text style={styles.walkBubbleText}>{walkLine.text}</Text>
                    </View>
                  ) : null}
                </>
              );
            })()
          : null}

        {/* 5) 주인공 어르신 (4방향 걷기 애니메이션) */}
        <Animated.View
          testID="rpg-player-avatar"
          accessibilityLabel={`주인공 어르신 (${playerPos.x}, ${playerPos.y})`}
          style={[
            styles.playerSprite,
            {
              transform: [
                { translateX: playerX },
                { translateY: playerY },
                { scaleX: facing.flipped ? -1 : 1 },
              ],
            },
          ]}>
          <Image source={playerSprite} style={styles.playerImage} contentFit="contain" />
        </Animated.View>
      </Animated.View>

      {/* 6) 뷰포트 안쪽 비네트 테두리 (레트로 CRT 느낌) */}
      <View pointerEvents="none" style={styles.vignette} />
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    backgroundColor: '#356347',
  },
  mapLayer: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: MAP_PIXEL_SIZE,
    height: MAP_PIXEL_SIZE,
  },
  tile: {
    position: 'absolute',
    width: TILE_DP,
    height: TILE_DP,
  },
  building: {
    position: 'absolute',
  },
  npcSprite: {
    position: 'absolute',
    width: NPC_SPRITE_DP,
    height: NPC_SPRITE_DP,
  },
  npcImage: {
    width: NPC_SPRITE_DP,
    height: NPC_SPRITE_DP,
  },
  playerSprite: {
    position: 'absolute',
    width: PLAYER_SPRITE_DP,
    height: PLAYER_SPRITE_DP,
  },
  playerImage: {
    width: PLAYER_SPRITE_DP,
    height: PLAYER_SPRITE_DP,
  },
  walkBubble: {
    position: 'absolute',
    width: 168,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#FCF9F2',
    borderWidth: 1,
    borderColor: '#B89A7A',
    zIndex: 20,
  },
  walkBubbleText: {
    color: '#182620',
    fontSize: 13,
    lineHeight: 18,
  },
  vignette: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderWidth: 14,
    borderColor: 'rgba(24, 38, 32, 0.32)',
  },
});
