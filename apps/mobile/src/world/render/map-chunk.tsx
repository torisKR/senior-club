import { Image } from 'expo-image';
import React from 'react';
import { Image as RNImage, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { TILE_SPRITES } from '@/rpg/rpg-sprites';

import type { MapDef } from '../maps/map-types';
import { isWaterSymbol, mapHeight, mapWidth } from '../maps/tiles';
import { CHUNK_TILES, type PassGrid } from '../movement/motion';
import { boundaryEdges, type BoundaryEdge } from './boundary-edges';
import { chunkLayers } from './tile-visuals';

/** 타일 한 칸의 화면 크기 (dp) */
export const TILE_DP = 48;
const EDGE_WIDTH = 3;
const LAND_EDGE = 'rgba(65, 47, 27, 0.7)';
const WATER_EDGE = '#E6C891';

// A grid belongs to one map instance. Cache only while that grid remains alive.
const edgeCache = new WeakMap<PassGrid, Map<string, BoundaryEdge[]>>();

function chunkEdges(map: MapDef, grid: PassGrid, cx: number, cy: number): BoundaryEdge[] {
  let chunks = edgeCache.get(grid);
  if (!chunks) {
    chunks = new Map();
    edgeCache.set(grid, chunks);
  }
  const key = `${cx}:${cy}`;
  let edges = chunks.get(key);
  if (!edges) {
    edges = boundaryEdges(grid, cx, cy, CHUNK_TILES, (x, y) => isWaterSymbol(map.layout[y]?.[x]));
    chunks.set(key, edges);
  }
  return edges;
}

/**
 * 8 x 8 칸 묶음. 가장 많은 바닥은 반복 이미지 한 장(RN Image repeat)으로 깔고 나머지만 칸마다 그려
 * 이미지 수를 줄입니다. 지도는 바뀌지 않으니 한 번 그리면 다시 그리지 않습니다.
 * ponytail: 반복 무늬 간격이 칸 격자와 몇 dp 어긋날 수 있음 — 잔디·숲 바닥은 고른 무늬라 티가 나지 않습니다.
 */
export const MapChunk = React.memo(function MapChunk({ map, grid, cx, cy, breeze }: { map: MapDef; grid: PassGrid; cx: number; cy: number; breeze: SharedValue<number> }) {
  const { dominant, cells } = chunkLayers(map, cx, cy, CHUNK_TILES);
  const cols = Math.min(CHUNK_TILES, mapWidth(map) - cx * CHUNK_TILES);
  const rows = Math.min(CHUNK_TILES, mapHeight(map) - cy * CHUNK_TILES);
  const edges = chunkEdges(map, grid, cx, cy);
  const swaying = cells.filter((cell) => cell.decor === 'bush' || cell.decor === 'flower');
  return (
    <>
      <RNImage
        source={TILE_SPRITES[dominant]}
        resizeMode="repeat"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={{ position: 'absolute', left: cx * CHUNK_TILES * TILE_DP, top: cy * CHUNK_TILES * TILE_DP, width: cols * TILE_DP, height: rows * TILE_DP }}
        accessibilityIgnoresInvertColors
      />
      {cells.map((cell) => {
        const position = { left: cell.x * TILE_DP, top: cell.y * TILE_DP };
        return (
          <React.Fragment key={`${cell.x},${cell.y}`}>
            {cell.base ? <Image source={TILE_SPRITES[cell.base]} style={[styles.tile, position]} contentFit="fill" accessibilityIgnoresInvertColors accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" /> : null}
            {cell.decor && cell.decor !== 'bush' && cell.decor !== 'flower' ? <Image source={TILE_SPRITES[cell.decor]} style={[styles.tile, position]} contentFit="fill" accessibilityIgnoresInvertColors accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" /> : null}
          </React.Fragment>
        );
      })}
      {swaying.length ? (
        <BreezeDecor cells={swaying} cx={cx} cy={cy} cols={cols} rows={rows} breeze={breeze} />
      ) : null}
      {edges.map((edge) => (
        <View key={`edge-${edge.x}-${edge.y}`} pointerEvents="none" style={[styles.edge, {
          left: edge.x * TILE_DP, top: edge.y * TILE_DP, width: edge.length * TILE_DP,
          borderTopWidth: edge.top ? EDGE_WIDTH : 0, borderBottomWidth: edge.bottom ? EDGE_WIDTH : 0,
          borderLeftWidth: edge.left ? EDGE_WIDTH : 0, borderRightWidth: edge.right ? EDGE_WIDTH : 0,
          borderTopColor: edge.topWater ? WATER_EDGE : LAND_EDGE,
          borderBottomColor: edge.bottomWater ? WATER_EDGE : LAND_EDGE,
          borderLeftColor: edge.leftWater ? WATER_EDGE : LAND_EDGE,
          borderRightColor: edge.rightWater ? WATER_EDGE : LAND_EDGE,
        }]} />
      ))}
    </>
  );
});

function BreezeDecor({ cells, cx, cy, cols, rows, breeze }: {
  cells: ReturnType<typeof chunkLayers>['cells']; cx: number; cy: number; cols: number; rows: number; breeze: SharedValue<number>;
}) {
  const breezeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: breeze.get() }] }));
  return <Animated.View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.breezeLayer, {
    left: cx * CHUNK_TILES * TILE_DP, top: cy * CHUNK_TILES * TILE_DP,
    width: cols * TILE_DP, height: rows * TILE_DP,
  }, breezeStyle]}>
    {cells.map((cell) => (
      <Image key={`breeze-${cell.x}-${cell.y}`} source={TILE_SPRITES[cell.decor!]} style={[styles.tile, {
        left: (cell.x - cx * CHUNK_TILES) * TILE_DP, top: (cell.y - cy * CHUNK_TILES) * TILE_DP,
      }]} contentFit="fill" accessibilityIgnoresInvertColors />
    ))}
  </Animated.View>;
}

const styles = StyleSheet.create({
  tile: { position: 'absolute', width: TILE_DP, height: TILE_DP },
  breezeLayer: { position: 'absolute' },
  edge: { position: 'absolute', height: TILE_DP, borderColor: 'rgba(65, 47, 27, 0.5)' },
});
