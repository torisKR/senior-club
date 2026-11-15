import React, { useMemo } from 'react';
import { Modal, PixelRatio, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { PixelRadius } from '@/components/game/pixel-theme';
import { AppText } from '@/components/ui';
import { FontWeights, Spacing } from '@/constants/theme';

import { MAP_REGIONS } from '../maps';
import { PHOTO_SPOTS } from '../explore';
import type { MapDef } from '../maps/map-types';
import { isWalkable, mapHeight, mapWidth, tileAt } from '../maps/tiles';
import { rowRuns } from './minimap-runs';

function relativeLocation(player: { x: number; y: number }, target: { x: number; y: number }): string {
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const distance = Math.abs(dx) + Math.abs(dy);
  if (distance <= 1) return '바로 가까이';
  const direction = [dy < 0 ? '북쪽' : dy > 0 ? '남쪽' : '', dx < 0 ? '서쪽' : dx > 0 ? '동쪽' : ''].filter(Boolean).join(' · ');
  return `${direction}, 약 ${distance}칸`;
}

export function Minimap({ map, player, visible, onClose, companionId = null, reduceMotion = null }: {
  map: MapDef;
  player: { x: number; y: number };
  visible: boolean;
  onClose: () => void;
  companionId?: string | null;
  reduceMotion?: boolean | null;
}) {
  const { width: screenW } = useWindowDimensions();
  const w = mapWidth(map);
  const h = mapHeight(map);
  // 칸 크기를 실제 픽셀에 맞춰야 행 사이에 틈이 생기지 않습니다.
  const cell = PixelRatio.roundToNearestPixel(Math.min(8, (Math.min(screenW, 720) - Spacing.lg * 4) / w));
  const rows = useMemo(() => map.layout.map(rowRuns), [map]);
  const photoSpots = useMemo(() => PHOTO_SPOTS.filter((spot) => spot.mapId === map.id), [map.id]);
  const destinations = useMemo(() => map.buildings.filter((building) => building.facilityRoute || building.busStop), [map]);
  const activitySpots = useMemo(() => {
    const farm: { x: number; y: number }[] = [];
    const docks: { x: number; y: number }[] = [];
    const benches: { x: number; y: number }[] = [];
    map.layout.forEach((row, y) => Array.from(row).forEach((symbol, x) => {
      if (symbol === 'F' && map.id === 'field' && tileAt(map, x, y).type === 'farm') farm.push({ x, y });
      if (symbol === 'K' && isWalkable(map, x, y) && tileAt(map, x, y).type === 'dock') docks.push({ x, y });
      if (symbol === 'b' && tileAt(map, x, y).type === 'bench' && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => isWalkable(map, x + dx, y + dy))) benches.push({ x, y });
    }));
    return { farm, docks, benches };
  }, [map]);
  const closest = (spots: readonly { x: number; y: number }[]) => spots.reduce<{ x: number; y: number } | null>((best, spot) =>
    !best || Math.abs(spot.x - player.x) + Math.abs(spot.y - player.y) < Math.abs(best.x - player.x) + Math.abs(best.y - player.y) ? spot : best, null);
  const nearestFarm = closest(activitySpots.farm);
  const nearestDock = closest(activitySpots.docks);
  const nearestBench = closest(activitySpots.benches);
  const pavilion = map.buildings.find((building) => building.id === 'pavilion');
  return (
    <Modal visible={visible} transparent animationType={reduceMotion === false ? 'fade' : 'none'} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView style={styles.cardScroll} showsVerticalScrollIndicator>
        <View style={styles.card} accessibilityViewIsModal>
          <View style={styles.header}>
            <AppText variant="sectionTitle" style={styles.title}>{map.name} 지도</AppText>
            <Pressable testID="btn-close-minimap" accessibilityRole="button" accessibilityLabel="지도 닫기" onPress={onClose} style={styles.close}>
              <AppText variant="bodyStrong" style={styles.title}>닫기</AppText>
            </Pressable>
          </View>
          <View style={{ width: cell * w, height: cell * h, alignSelf: 'center' }} accessible accessibilityLabel={`${map.name} 지도. 빨간 점이 지금 있는 곳이고 갈색 영역은 건물입니다.${companionId ? ' 동행 중인 이웃은 내 곁에 있습니다.' : ''} 사진 명소: ${photoSpots.map((spot) => spot.name).join(', ') || '없음'}.`}>
            {visible ? rows.map((runs, y) => (
              <View key={y} style={{ flexDirection: 'row', height: cell }}>
                {runs.map((run, i) => (
                  <View key={i} style={{ width: run.length * cell, height: cell, backgroundColor: run.color }} />
                ))}
              </View>
            )) : null}
            {visible ? map.buildings.map((building) => (
              <React.Fragment key={`building-${building.id}-${building.x}-${building.y}`}>
                <View pointerEvents="none" style={[styles.buildingFootprint, {
                  left: building.x * cell, top: building.y * cell,
                  width: building.width * cell, height: building.height * cell,
                }]} />
                {(building.facilityRoute || building.busStop) ? (
                  <View pointerEvents="none" style={[styles.doorMark, {
                    left: (building.door.x + 0.5) * cell - 4, top: (building.door.y + 0.5) * cell - 4,
                  }]} />
                ) : null}
              </React.Fragment>
            )) : null}
            {visible ? map.npcs.filter((npc) => npc.id !== companionId).map((npc) => (
              <View key={npc.id} style={[styles.dot, styles.npcDot, { left: (npc.x + 0.5) * cell - 4, top: (npc.y + 0.5) * cell - 4 }]} />
            )) : null}
            {visible ? map.buildings.filter((b) => b.busStop).map((b) => (
              <View key={`bus-${b.x}`} style={[styles.busMark, { left: (b.door.x + 0.5) * cell - 9, top: (b.door.y + 0.5) * cell - 9 }]}>
                <AppText variant="caption" style={styles.busText}>버스</AppText>
              </View>
            )) : null}
            {visible ? photoSpots.map((spot) => (
              <View key={`photo-${spot.id}`} pointerEvents="none" style={[styles.photoMark, { left: (spot.x + 0.5) * cell - 6, top: (spot.y + 0.5) * cell - 6 }]} />
            )) : null}
            {visible ? MAP_REGIONS[map.id].map((region) => (
              <View key={region.name} pointerEvents="none" style={[styles.label, { left: region.x * cell - 40, top: region.y * cell - 10 }]}>
                <AppText variant="caption" style={styles.labelText}>{region.name}</AppText>
              </View>
            )) : null}
            {visible ? <View style={[styles.dot, styles.playerDot, { left: (player.x + 0.5) * cell - 7, top: (player.y + 0.5) * cell - 7 }]} /> : null}
          </View>
          <View style={styles.legendRow}>
            <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#E2574C' }]} /><AppText variant="caption" style={styles.legend}>나</AppText></View>
            <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#FFFFFF' }]} /><AppText variant="caption" style={styles.legend}>이웃</AppText></View>
            <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#1E6F94', borderRadius: 3 }]} /><AppText variant="caption" style={styles.legend}>버스 정류장</AppText></View>
            <View style={styles.legendItem}><View style={[styles.legendDot, styles.buildingLegend]} /><AppText variant="caption" style={styles.legend}>건물</AppText></View>
            <View style={styles.legendItem}><View style={[styles.legendDot, styles.doorLegend]} /><AppText variant="caption" style={styles.legend}>입구</AppText></View>
            <View style={styles.legendItem}><View style={[styles.legendDot, styles.photoLegend]} /><AppText variant="caption" style={styles.legend}>사진 명소</AppText></View>
          </View>
          {companionId ? <AppText variant="caption" style={styles.legend}>동행 중인 이웃은 내 곁에서 함께 걷고 있어요.</AppText> : null}
          {destinations.length > 0 || photoSpots.length > 0 || nearestFarm || nearestDock || nearestBench || pavilion ? (
            <View style={styles.destinations}>
              <AppText variant="bodyStrong" style={styles.title}>산책하며 찾아가기</AppText>
              <AppText variant="caption" style={styles.legend}>방향과 칸 수는 길을 따라 잰 거리가 아니에요. 천천히 돌아가세요.</AppText>
              {destinations.map((building) => (
                <AppText key={building.id} variant="body" style={styles.title}>
                  {building.name} · {relativeLocation(player, building.door)} · {building.busStop ? '정류장에서 버스 타기' : '입구에 서서 들어가기'}
                </AppText>
              ))}
              {nearestFarm ? <AppText variant="body" style={styles.title}>텃밭 · {relativeLocation(player, nearestFarm)} · 밭 옆에서 가꾸기</AppText> : null}
              {nearestDock ? <AppText variant="body" style={styles.title}>선착장 · {relativeLocation(player, nearestDock)} · 선착장 위에서 낚시</AppText> : null}
              {nearestBench ? <AppText variant="body" style={styles.title}>쉼터 벤치 · {relativeLocation(player, nearestBench)} · 벤치 옆에서 쉬기</AppText> : null}
              {pavilion ? <AppText variant="body" style={styles.title}>정자 · {relativeLocation(player, pavilion.door)} · 입구에서 쉬기</AppText> : null}
              {photoSpots.map((spot) => (
                <AppText key={spot.id} variant="body" style={styles.title}>
                  {spot.name} · {relativeLocation(player, spot)}
                </AppText>
              ))}
            </View>
          ) : null}
        </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: Spacing.lg },
  cardScroll: { maxHeight: '100%', flexGrow: 0 },
  card: { backgroundColor: '#FBF6EA', borderRadius: PixelRadius, padding: Spacing.lg, gap: Spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: '#182620' },
  close: { minHeight: 48, minWidth: 64, alignItems: 'center', justifyContent: 'center', borderRadius: PixelRadius, backgroundColor: '#E8DFC9' },
  dot: { position: 'absolute', borderRadius: 999 },
  npcDot: { width: 8, height: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#182620' },
  buildingFootprint: { position: 'absolute', backgroundColor: '#70462B', borderColor: '#F1D5A7', borderWidth: 0.5 },
  doorMark: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFE5A0', borderWidth: 1, borderColor: '#573A1F' },
  buildingLegend: { borderRadius: 1, backgroundColor: '#70462B', borderColor: '#F1D5A7' },
  doorLegend: { backgroundColor: '#FFE5A0', borderColor: '#573A1F' },
  playerDot: { width: 14, height: 14, backgroundColor: '#E2574C', borderWidth: 2, borderColor: '#FFFFFF' },
  busMark: { position: 'absolute', width: 18, height: 18, borderRadius: 4, backgroundColor: '#1E6F94', alignItems: 'center', justifyContent: 'center' },
  busText: { color: '#FFFFFF', fontSize: 8, lineHeight: 10 },
  photoMark: { position: 'absolute', width: 12, height: 12, backgroundColor: '#F0BF4F', borderWidth: 2, borderColor: '#573A1F', transform: [{ rotate: '45deg' }] },
  photoLegend: { backgroundColor: '#F0BF4F', borderColor: '#573A1F', borderRadius: 0, transform: [{ rotate: '45deg' }] },
  label: { position: 'absolute', width: 80, alignItems: 'center' },
  labelText: { color: '#FFFFFF', fontFamily: FontWeights.strong, fontSize: 12, textShadowColor: '#000', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  legend: { color: '#3D4F49' },
  destinations: { gap: 4 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: Spacing.sm },
  legendDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: '#182620' },
});
