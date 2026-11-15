import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText, Card, SectionHeader } from '@/components/ui';
import { FontWeights, Radius, Spacing } from '@/constants/theme';
import { useAppState } from '@/hooks/use-app-state';
import { itemSprite, POSTCARDS } from '@/rpg/rpg-sprites';
import { useRpg } from '@/rpg/rpg-store';

import { DEX, knownPhotoCount, PHOTO_SPOTS } from '../explore';
import { hasDiscovered } from '../life';

/** 도감: 찾은 것은 그림과 가진 개수, 못 찾은 것은 어디서 찾는지 안내 */
export function DexPanel() {
  const { state } = useRpg();
  const { width, fontScale } = useWindowDimensions();
  const { largeTextEnabled } = useAppState();
  const wideCells = width < 480 || fontScale >= 1.3 || largeTextEnabled;
  const singleColumn = fontScale >= 1.8 || (width < 360 && (fontScale >= 1.3 || largeTextEnabled));
  const life = state.life;
  const found = DEX.filter((entry) => hasDiscovered(life, entry.id)).length;
  const nextDiscovery = DEX.find((entry) => !hasDiscovered(life, entry.id));
  return (
    <View style={{ gap: Spacing.md }}>
      <SectionHeader title={`청솔 도감 ${found} / ${DEX.length}`} description="낚고, 거두고, 주운 것이 차례로 채워집니다" />
      <AppText variant="body" style={styles.discoveryHint}>
        {nextDiscovery ? `다음 산책 힌트 · ${nextDiscovery.hint}` : '마을의 선물을 모두 발견했어요. 천천히 다시 둘러보세요.'}
      </AppText>
      <View style={styles.grid}>
        {DEX.map((entry) => {
          const known = hasDiscovered(life, entry.id);
          const sprite = itemSprite(entry.id);
          const count = life.items[entry.id] ?? 0;
          return (
            <View key={entry.id} style={[styles.cell, wideCells && styles.wideCell, singleColumn && styles.singleCell, !known && styles.cellUnknown]}
              accessible accessibilityLabel={known ? `${entry.name}, ${count}개 가지고 있음` : `아직 못 찾음, ${entry.hint}`}>
              {known && sprite ? <Image source={sprite} style={styles.icon} contentFit="contain" /> : <AppText style={styles.question}>?</AppText>}
              <AppText variant="caption" style={styles.name}>{known ? entry.name : '???'}</AppText>
              <AppText variant="caption" style={styles.meta}>{known ? `가방 ${count}개` : entry.hint}</AppText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** 사진 앨범: 명소별 엽서와 찍은 날 */
export function AlbumPanel() {
  const { state } = useRpg();
  const photos = state.life.photos;
  return (
    <View style={{ gap: Spacing.md }}>
      <SectionHeader title={`사진 앨범 ${knownPhotoCount(photos)} / ${PHOTO_SPOTS.length}`} description="명소에서 ‘사진 찍기’를 누르면 앨범에 붙습니다" />
      {PHOTO_SPOTS.map((spot) => {
        const photo = photos.find((p) => p.spotId === spot.id);
        return (
          <Card key={spot.id} style={styles.photoCard}>
            {photo ? (
              <Image source={POSTCARDS[spot.id]} style={styles.postcard} contentFit="cover" accessibilityLabel={`${spot.name} 사진`} />
            ) : (
              <View style={[styles.postcard, styles.postcardEmpty]}><AppText variant="bodyStrong" style={styles.meta}>아직 찍지 않은 명소</AppText></View>
            )}
            <AppText variant="bodyStrong" style={styles.name}>{spot.name}</AppText>
            <AppText variant="caption" style={styles.meta}>{photo ? `${photo.day}에 찍음 · ${spot.caption}` : '지도에서 명소를 찾아가 보세요.'}</AppText>
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  cell: { width: '31%', minHeight: 116, padding: Spacing.sm, borderRadius: Radius.md, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D8C7A6', alignItems: 'center', gap: 2 },
  wideCell: { width: '48%' },
  singleCell: { width: '100%' },
  cellUnknown: { backgroundColor: '#EFE8D8' },
  icon: { width: 52, height: 52 },
  question: { fontSize: 34, lineHeight: 52, color: '#A08D6E', fontFamily: FontWeights.strong },
  name: { color: '#182620', textAlign: 'center' },
  discoveryHint: { color: '#315B38' },
  meta: { color: '#526451', textAlign: 'center' },
  photoCard: { gap: 6 },
  postcard: { width: '100%', aspectRatio: 4 / 3, borderRadius: Radius.md },
  postcardEmpty: { backgroundColor: '#E8DFC9', alignItems: 'center', justifyContent: 'center' },
});
