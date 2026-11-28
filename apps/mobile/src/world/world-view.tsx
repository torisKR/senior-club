import { Image } from 'expo-image';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useArcade } from '@/arcade/arcade-store';
import { PixelFx } from '@/fx/pixel-fx';
import { useReduceMotion } from '@/fx/use-reduce-motion';
import { useAppState } from '@/hooks/use-app-state';
import { FARM_PLOTS } from '@/rpg/rpg-logic';
import {
  BUILDING_SPRITES,
  CROP_SPRITES,
  LIFE_PROP_SPRITES,
  PLAYER_POSE_SPRITES,
  playerSpriteForTier,
  playerTierForCp,
  type PlayerPose,
} from '@/rpg/rpg-sprites';
import { useRpg } from '@/rpg/rpg-store';

import { todayKey } from '@/rpg/daily-reset';

import { forageSpawns, PHOTO_SPOTS } from './explore';
import { PLAY_SPRITES } from './play/play-sprites';
import { cropStage, type GardenPlot, type LifeState } from './life';
import type { MapDef, MapId } from './maps/map-types';
import { buildPassGrid, isWalkable, mapHeight, mapWidth, tileAt } from './maps/tiles';
import { cameraOrigin, chunkBoundsForViewport, facingFor, hitBoundary, isNearVisibleChunks, isRectNearVisibleChunks, nextWalkStrength, stepMotion, type Facing, type PassGrid } from './movement/motion';
import { MapChunk, TILE_DP } from './render/map-chunk';
import { VillagePeople } from './render/village-people';
import { useWorldActive } from './use-world-active';

const PLAYER_SPRITE_DP = 88;
/** 칸 중심(타일 좌표 x.5)에서 스프라이트 왼쪽 위까지 */
const PLAYER_ANCHOR_X = PLAYER_SPRITE_DP / 2;
const PLAYER_ANCHOR_Y = PLAYER_SPRITE_DP - TILE_DP * 0.4;
const WALK_FRAME_MS = 130;
const BOUNDARY_HAPTIC_GAP_MS = 1200;
/** 카메라 주변에 그려 둘 청크 반경 (가로·세로) */
const FOCUS_MS = 300;

export interface WorldViewProps {
  map: MapDef;
  /** 조이스틱 방향 (-1~1). UI 스레드에서 매 프레임 읽습니다. */
  joyX: SharedValue<number>;
  joyY: SharedValue<number>;
  /** 발밑 칸이 바뀔 때 (JS 스레드) */
  onTileChange: (x: number, y: number, sourceMapId: MapId) => void;
  /** UI 스레드에서 마지막 좌표를 확인한 뒤 저장합니다. */
  onMovementEnd: (x: number, y: number, sourceMapId: MapId) => void;
  pose?: PlayerPose | null;
  celebration?: number | null;
  celebrationProp?: 'wateringCan' | 'basket' | null;
  onCelebrationDone?: (key: number) => void;
  nowMs: number;
  /** 마을 위에 모달이 열려 있으면 배경 움직임을 멈춥니다. */
  paused?: boolean;
  /** 주인공을 화면 세로 어디에 둘지 (0 위 ~ 1 아래) */
  focusY?: number;
}

/**
 * 오픈월드 화면: 주인공은 UI 스레드에서 매 프레임 자유롭게 걷고, 카메라가 따라갑니다.
 * React 는 발밑 칸·방향·걷기 여부·청크가 바뀔 때만 다시 그립니다.
 */
export function WorldView({ map, joyX, joyY, onTileChange, onMovementEnd, pose = null, celebration, celebrationProp, onCelebrationDone, nowMs, paused = false, focusY = 0.5 }: WorldViewProps) {
  const { state } = useRpg();
  const { state: arcadeState, triggerHaptic } = useArcade();
  const reduceMotion = useReduceMotion();
  const { largeTextEnabled } = useAppState();
  const markerFontSize = largeTextEnabled ? 17 : 15;
  const worldActive = useWorldActive();
  const active = worldActive && !paused;
  const width = mapWidth(map);
  const height = mapHeight(map);
  const mapId = map.id;
  const grid = useMemo<PassGrid>(() => ({ cells: buildPassGrid(map), width, height }), [map, width, height]);
  const tile = state.playerPos;

  const px = useSharedValue(tile.x + 0.5);
  const py = useSharedValue(tile.y + 0.5);
  const gridSv = useSharedValue(grid);
  const tileX = useSharedValue(tile.x);
  const tileY = useSharedValue(tile.y);
  const facingSv = useSharedValue<Facing>('down');
  const walkingSv = useSharedValue(false);
  const walkStrength = useSharedValue(0);
  const inputActive = useSharedValue(false);
  const touchingBoundary = useSharedValue(false);
  const lastBoundaryHapticAt = useSharedValue(-BOUNDARY_HAPTIC_GAP_MS);
  const boundaryOpacity = useSharedValue(0);
  const breeze = useSharedValue(0);
  const viewW = useSharedValue(0);
  const viewH = useSharedValue(0);
  const focus = useSharedValue(focusY);

  const [walking, setWalking] = useState(false);
  const [facing, setFacing] = useState<Facing>('down');
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const previousMapId = useRef(map.id);

  useEffect(() => {
    gridSv.set(grid);
  }, [grid, gridSv]);

  useEffect(() => {
    focus.set(reduceMotion === false ? withTiming(focusY, { duration: FOCUS_MS }) : focusY);
  }, [focus, focusY, reduceMotion]);

  useEffect(() => {
    if (active && reduceMotion === false) {
      breeze.set(withRepeat(withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.sin) }), -1, true));
    } else {
      cancelAnimation(breeze);
      breeze.set(0);
    }
    return () => cancelAnimation(breeze);
  }, [active, breeze, reduceMotion]);

  // 걷지 않았는데 칸이 바뀌면(지도 이동·접근성 한 칸 걷기·불러오기) 그 자리로 옮겨 놓습니다.
  useEffect(() => {
    const mapChanged = previousMapId.current !== map.id;
    previousMapId.current = map.id;
    if (!mapChanged && tileX.get() === tile.x && tileY.get() === tile.y) return;
    tileX.set(tile.x);
    tileY.set(tile.y);
    px.set(tile.x + 0.5);
    py.set(tile.y + 0.5);
  }, [tile.x, tile.y, map.id, px, py, tileX, tileY]);

  const frameCallback = useFrameCallback((frameInfo) => {
    'worklet';
    const vx = joyX.get();
    const vy = joyY.get();
    const hasInput = vx !== 0 || vy !== 0;
    if (!hasInput) {
      walkStrength.set(0);
      if (inputActive.get()) {
        inputActive.set(false);
        scheduleOnRN(onMovementEnd, Math.floor(px.get()), Math.floor(py.get()), mapId);
      }
      touchingBoundary.set(false);
      if (walkingSv.get()) {
        walkingSv.set(false);
        scheduleOnRN(setWalking, false);
      }
      return;
    }
    inputActive.set(true);
    const dt = (frameInfo.timeSincePreviousFrame ?? 16) / 1000;
    const inputLength = Math.hypot(vx, vy);
    const strength = nextWalkStrength(walkStrength.get(), inputLength, dt);
    walkStrength.set(strength);
    const moveX = vx / inputLength * strength;
    const moveY = vy / inputLength * strength;
    const x = px.get();
    const y = py.get();
    const next = stepMotion(gridSv.get(), x, y, moveX, moveY, dt);
    const blocked = hitBoundary(x, y, next.x, next.y, moveX, moveY, dt);
    if (blocked && !touchingBoundary.get()) {
      boundaryOpacity.set(0.85);
      boundaryOpacity.set(withDelay(250, withTiming(0, { duration: reduceMotion === false ? 300 : 0 })));
      if (frameInfo.timestamp - lastBoundaryHapticAt.get() >= BOUNDARY_HAPTIC_GAP_MS) {
        lastBoundaryHapticAt.set(frameInfo.timestamp);
        scheduleOnRN(triggerHaptic, 'light');
      }
    }
    touchingBoundary.set(blocked);
    const moving = Math.abs(next.x - x) + Math.abs(next.y - y) > 0.00001;
    if (moving !== walkingSv.get()) {
      walkingSv.set(moving);
      scheduleOnRN(setWalking, moving);
    }
    px.set(next.x);
    py.set(next.y);
    const dir = facingFor(vx, vy, facingSv.get());
    if (dir && dir !== facingSv.get()) {
      facingSv.set(dir);
      scheduleOnRN(setFacing, dir);
    }
    const tx = Math.floor(next.x);
    const ty = Math.floor(next.y);
    if (tx !== tileX.get() || ty !== tileY.get()) {
      tileX.set(tx);
      tileY.set(ty);
      scheduleOnRN(onTileChange, tx, ty, mapId);
    }
  }, false);

  useEffect(() => {
    frameCallback.setActive(active);
    if (!active) {
      joyX.set(0);
      joyY.set(0);
      walkStrength.set(0);
      touchingBoundary.set(false);
      if (inputActive.get()) {
        inputActive.set(false);
        onMovementEnd(Math.floor(px.get()), Math.floor(py.get()), mapId);
      }
    }
    return () => frameCallback.setActive(false);
  }, [active, frameCallback, inputActive, joyX, joyY, mapId, onMovementEnd, px, py, touchingBoundary, walkStrength]);

  const cameraStyle = useAnimatedStyle(() => {
    const origin = cameraOrigin(px.get() * TILE_DP, py.get() * TILE_DP, viewW.get(), viewH.get(), width * TILE_DP, height * TILE_DP, focus.get());
    return { transform: [{ translateX: -origin.x }, { translateY: -origin.y }] };
  });

  const playerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: px.get() * TILE_DP - PLAYER_ANCHOR_X },
      { translateY: py.get() * TILE_DP - PLAYER_ANCHOR_Y },
    ],
  }));
  const boundaryStyle = useAnimatedStyle(() => ({ opacity: boundaryOpacity.get() }));

  const bounds = chunkBoundsForViewport(tile.x, tile.y, viewport.width, viewport.height, TILE_DP, width, height);
  const chunks = useMemo(() => {
    const result: { cx: number; cy: number }[] = [];
    for (let cy = bounds.top; cy <= bounds.bottom; cy += 1) {
      for (let cx = bounds.left; cx <= bounds.right; cx += 1) result.push({ cx, cy });
    }
    return result;
  }, [bounds.left, bounds.right, bounds.top, bounds.bottom]);

  const handleLayout = (event: LayoutChangeEvent) => {
    viewW.set(event.nativeEvent.layout.width);
    viewH.set(event.nativeEvent.layout.height);
    const { width: nextWidth, height: nextHeight } = event.nativeEvent.layout;
    setViewport((current) => current.width === nextWidth && current.height === nextHeight ? current : { width: nextWidth, height: nextHeight });
  };

  return (
    <View testID="world-view" style={styles.viewport} onLayout={handleLayout} accessibilityLabel={`${map.name} 지도`}>
      <Animated.View style={[styles.mapLayer, { width: width * TILE_DP, height: height * TILE_DP }, cameraStyle]}>
        {chunks.map((chunk) => (
          <MapChunk key={`${map.id}:${chunk.cx},${chunk.cy}`} map={map} grid={grid} cx={chunk.cx} cy={chunk.cy} breeze={breeze} />
        ))}

        <Crops map={map} garden={state.life.garden} nowMs={nowMs} chunks={chunks} markerFontSize={markerFontSize} />
        <ForageLayer map={map} foraged={state.life.foraged} chunks={chunks} day={todayKey(new Date(nowMs))} />
        <Buildings map={map} chunks={chunks} markerFontSize={markerFontSize} />
        <PhotoMarkers map={map} chunks={chunks} markerFontSize={markerFontSize} />
        <FishingMarker map={map} player={tile} markerFontSize={markerFontSize} />

        <VillagePeople key={map.id} map={map} chunks={chunks} active={active} />

        <Animated.View
          testID="rpg-player-avatar"
          accessibilityLabel={`주인공 어르신 (${tile.x}, ${tile.y})`}
          style={[styles.player, playerStyle]}>
          <PlayerImage cp={arcadeState.cp} facing={facing} walking={walking} active={active} reduceMotion={reduceMotion} pose={pose} />
          {active && celebration != null && celebrationProp && !pose ? (
            <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.activityProp}>
              <Image source={LIFE_PROP_SPRITES[celebrationProp]} style={styles.activityPropImage} contentFit="contain" />
            </View>
          ) : null}
          {active && celebration != null ? (
            <PixelFx key={celebration} name="holein" scale={0.75} onDone={() => onCelebrationDone?.(celebration)} style={styles.celebration} />
          ) : null}
          <Animated.View pointerEvents="none" style={[styles.boundaryHint, boundaryStyle]} />
        </Animated.View>
      </Animated.View>
      <View pointerEvents="none" style={styles.vignette} />
    </View>
  );
}

/** 걷는 그림의 프레임만 갱신해 배경과 주변 인물을 다시 그리지 않습니다. */
const PlayerImage = React.memo(function PlayerImage({ cp, facing, walking, active, reduceMotion, pose }: {
  cp: number; facing: Facing; walking: boolean; active: boolean; reduceMotion: boolean | null; pose: PlayerPose | null;
}) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!active || reduceMotion !== false || !walking || pose) return;
    const interval = setInterval(() => setFrame((current) => (current + 1) % 4), WALK_FRAME_MS);
    return () => clearInterval(interval);
  }, [active, walking, reduceMotion, pose]);
  const direction = facing === 'left' || facing === 'right' ? 'side' : facing;
  const walkSprite = playerSpriteForTier(
    playerTierForCp(cp), direction, active && reduceMotion === false && walking, reduceMotion === false ? frame : 0,
  );
  return <Image source={pose ? PLAYER_POSE_SPRITES[pose] : walkSprite} style={[styles.playerImage, !pose && facing === 'left' && styles.flipped]} contentFit="contain" />;
});

/** 텃밭 작물 — 텃밭이나 시간이 바뀔 때만 다시 그립니다. */
const Crops = React.memo(function Crops({ map, garden, nowMs, chunks, markerFontSize }: { map: MapDef; garden: GardenPlot[]; nowMs: number; chunks: readonly { cx: number; cy: number }[]; markerFontSize: number }) {
  if (map.id !== 'field') return null;
  return (
    <>
      {FARM_PLOTS.map((spot, index) => {
        const plot = garden[index];
        const stage = plot ? cropStage(plot, nowMs) : null;
        if (!plot?.cropId || stage === null || !isNearVisibleChunks(spot.x, spot.y, chunks)) return null;
        return (
          <React.Fragment key={`crop-${index}`}>
            <Image source={CROP_SPRITES[plot.cropId][stage]}
              style={[styles.tile, { left: spot.x * TILE_DP, top: spot.y * TILE_DP }]} contentFit="contain" accessibilityIgnoresInvertColors />
            {stage === 2 ? <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
              style={[styles.harvestMarker, { left: spot.x * TILE_DP + 2, top: spot.y * TILE_DP - 20 }]}>
              <Text style={[styles.harvestMarkerText, { fontSize: markerFontSize }]}>수확</Text>
            </View> : null}
          </React.Fragment>
        );
      })}
    </>
  );
});

/** 낚시는 선착장 위에서 할 수 있으므로 가까운 선착장에만 표식을 보여 줍니다. */
const FishingMarker = React.memo(function FishingMarker({ map, player, markerFontSize }: { map: MapDef; player: { x: number; y: number }; markerFontSize: number }) {
  const docks = useMemo(() => map.layout.flatMap((row, y) => Array.from(row).flatMap((symbol, x) =>
    symbol === 'K' && isWalkable(map, x, y) && tileAt(map, x, y).type === 'dock' ? [{ x, y }] : [])), [map]);
  const nearest = docks.reduce<{ x: number; y: number; distance: number } | null>((best, dock) => {
    const distance = Math.abs(dock.x - player.x) + Math.abs(dock.y - player.y);
    return distance <= 2 && (!best || distance < best.distance) ? { ...dock, distance } : best;
  }, null);
  if (!nearest) return null;
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[styles.fishingMarker, { left: nearest.x * TILE_DP + 2, top: nearest.y * TILE_DP - 48 }]}>
    <Text style={[styles.fishingMarkerText, { fontSize: markerFontSize }]}>낚시</Text>
  </View>;
});

/** 오늘의 채집물은 풀숲에 숨어 있습니다 — 헤치거나 날이 바뀔 때만 다시 그립니다. */
const ForageLayer = React.memo(function ForageLayer({ map, foraged, chunks, day }: { map: MapDef; foraged: LifeState['foraged']; chunks: readonly { cx: number; cy: number }[]; day: string }) {
  return (
    <>
      {forageSpawns(map, day)
        .filter((spawn) => isNearVisibleChunks(spawn.x, spawn.y, chunks) && !(foraged.day === day && foraged.keys.includes(`${map.id}:${spawn.key}`)))
        .map((spawn) => (
          <Image key={`forage-${spawn.key}`} source={PLAY_SPRITES.bush}
            style={[styles.forage, { left: spawn.x * TILE_DP + 2, top: spawn.y * TILE_DP + 2 }]} contentFit="contain" accessibilityIgnoresInvertColors />
        ))}
    </>
  );
});

/** 가까운 사진 명소는 작은 표식으로 안내하고, 멀리 있는 표식은 그리지 않습니다. */
const PhotoMarkers = React.memo(function PhotoMarkers({ map, chunks, markerFontSize }: { map: MapDef; chunks: readonly { cx: number; cy: number }[]; markerFontSize: number }) {
  return <>{PHOTO_SPOTS.filter((spot) => spot.mapId === map.id && isNearVisibleChunks(spot.x, spot.y, chunks)).map((spot) => (
    <View key={spot.id} testID={`photo-marker-${spot.id}`} pointerEvents="none" accessible={false}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[styles.photoMarker, { left: spot.x * TILE_DP + 2, top: spot.y * TILE_DP - 20 }]}>
      <Text style={[styles.photoMarkerText, { fontSize: markerFontSize }]}>사진</Text>
    </View>
  ))}</>;
});

/** 지붕을 포함한 그림이 화면 근처에 있는 건물만 표시합니다. */
const Buildings = React.memo(function Buildings({ map, chunks, markerFontSize }: { map: MapDef; chunks: readonly { cx: number; cy: number }[]; markerFontSize: number }) {
  const visibleBuildings = map.buildings.filter((building) => isRectNearVisibleChunks(building.x, building.y - 1, building.width, building.height + 1, chunks));
  return (
    <>
      {visibleBuildings.map((building) => (
        <Image
          key={`building-${building.id}-${building.x}-${building.y}`}
          source={BUILDING_SPRITES[building.id]}
          style={{
            position: 'absolute',
            left: building.x * TILE_DP,
            top: (building.y - 1) * TILE_DP,
            width: building.width * TILE_DP,
            height: (building.height + 1) * TILE_DP,
          }}
          contentFit="contain"
          contentPosition="bottom"
          accessibilityIgnoresInvertColors
          accessibilityLabel={building.name}
        />
      ))}
      {visibleBuildings.filter((building) => building.facilityRoute || building.busStop).map((building) => (
        <View key={`entrance-${building.id}-${building.x}-${building.y}`} pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
          style={[styles.entranceMarker, { left: building.door.x * TILE_DP + 2, top: building.door.y * TILE_DP - 20 }]}>
          <Text style={[styles.entranceMarkerText, { fontSize: markerFontSize }]}>{building.busStop ? '버스' : '입구'}</Text>
        </View>
      ))}
    </>
  );
});

const styles = StyleSheet.create({
  viewport: { flex: 1, width: '100%', height: '100%', overflow: 'hidden', backgroundColor: '#356347' },
  mapLayer: { position: 'absolute', left: 0, top: 0 },
  tile: { position: 'absolute', width: TILE_DP, height: TILE_DP },
  forage: { position: 'absolute', width: TILE_DP - 4, height: TILE_DP - 4 },
  photoMarker: { position: 'absolute', minWidth: 44, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: '#76542D', backgroundColor: '#FFF4D7', alignItems: 'center' },
  photoMarkerText: { color: '#573A1F', fontWeight: '700' },
  fishingMarker: { position: 'absolute', minWidth: 44, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: '#1E6F94', backgroundColor: '#E7F5F6', alignItems: 'center' },
  fishingMarkerText: { color: '#174A63', fontWeight: '700' },
  harvestMarker: { position: 'absolute', minWidth: 44, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: '#79530F', backgroundColor: '#FFF1C7', alignItems: 'center' },
  harvestMarkerText: { color: '#573A1F', fontWeight: '700' },
  entranceMarker: { position: 'absolute', minWidth: 44, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: '#0E5142', backgroundColor: '#E4EDDA', alignItems: 'center' },
  entranceMarkerText: { color: '#0E5142', fontWeight: '700' },
  player: { position: 'absolute', left: 0, top: 0, width: PLAYER_SPRITE_DP, height: PLAYER_SPRITE_DP },
  playerImage: { width: PLAYER_SPRITE_DP, height: PLAYER_SPRITE_DP },
  celebration: { position: 'absolute', left: 2, bottom: 8 },
  activityProp: { position: 'absolute', right: 0, bottom: 10, width: 32, height: 32 },
  activityPropImage: { width: 32, height: 32 },
  flipped: { transform: [{ scaleX: -1 }] },
  boundaryHint: {
    position: 'absolute', left: 21, bottom: 7, width: 46, height: 14,
    borderWidth: 2, borderRadius: 12, borderColor: '#FFF0BD', backgroundColor: 'rgba(116, 81, 42, 0.22)',
  },
  vignette: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    borderWidth: 14, borderColor: 'rgba(24, 38, 32, 0.32)',
  },
});
