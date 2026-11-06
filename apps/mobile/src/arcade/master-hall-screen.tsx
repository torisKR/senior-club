import { Image } from 'expo-image';
import React from 'react';
import { Alert, Linking, Pressable, StyleSheet, Switch, View } from 'react-native';

import { AppText, Card, Screen, SectionHeader, SeniorButton } from '@/components/ui';
import { AdsPrivacySettings } from '@/ads/AdsPrivacySettings';
import { AnalyticsSettingsEntry } from '@/analytics/consent-card';
import { getPublicWebPageUrl } from '@/config/public-web-links';
import { FontWeights, Layout, Radius, Spacing } from '@/constants/theme';
import { useAppState } from '@/hooks/use-app-state';
import { PlusCard } from '@/screens/profile/plus-card';
import { PixelFx } from '@/fx/pixel-fx';

import { RANK_TIERS } from './arcade-logic';
import { useArcade } from './arcade-store';
import { CosmeticShop } from './cosmetic-shop';

const MASTER_BADGE = require('../../assets/game/rpg/pixel/ui/badge_master.png');

export function MasterHallScreen() {
  const { largeTextEnabled, toggleLargeText } = useAppState();
  const { state, rankProgress, equipSkin, toggleSound } = useArcade();

  return (
    <Screen testID="master-hall-screen" contentContainerStyle={styles.container}>
      {/* 1. 명인전당 대표 급수 명패 */}
      <View style={styles.masterBanner}>
        <View style={styles.hallFlourish}>
          <PixelFx name="promotion" scale={0.48} loop />
        </View>
        <Image source={MASTER_BADGE} style={styles.badgeLarge} contentFit="contain" />
        <AppText variant="caption" style={styles.plaqueTag}>
          {rankProgress.current.tierGroup} · {rankProgress.current.plaqueName}
        </AppText>
        <AppText variant="title" style={{ color: '#FCF9F2' }}>
          {rankProgress.current.label}
        </AppText>
        <AppText variant="bodyStrong" style={{ color: '#F0BF4F' }}>
          누적 클럽 점수 {state.cp.toLocaleString()} CP · 명예 인장 {state.seals}개
        </AppText>
      </View>

      {/* 2. 3대 종목 통산 전적 */}
      <Card style={styles.statsCard}>
        <SectionHeader title="내 클럽 통산 전적" description="기기에 안전하게 자동 저장됩니다" />
        <View style={styles.statGrid}>
          <View style={styles.statItem}>
            <AppText variant="caption" style={styles.statLabel}>파크골프 홀인</AppText>
            <AppText variant="sectionTitle" style={styles.statVal}>{state.parkGolfClears}회</AppText>
          </View>
          <View style={styles.statItem}>
            <AppText variant="caption" style={styles.statLabel}>알까기 대국승</AppText>
            <AppText variant="sectionTitle" style={styles.statVal}>{state.alkkagiWins}승</AppText>
          </View>
          <View style={styles.statItem}>
            <AppText variant="caption" style={styles.statLabel}>사천성 클리어</AppText>
            <AppText variant="sectionTitle" style={styles.statVal}>{state.sacheonseongClears}회</AppText>
          </View>
        </View>
      </Card>

      {/* 3. 명예 다실 장비 보관함 (순수 치장 스킨 — 점수/판정 무영향) */}
      <Card style={styles.skinCard}>
        <SectionHeader
          title="명예 다실 & 장비 보관함"
          description="외형 치장 전용 스킨 (게임 판정·점수에는 영향을 주지 않습니다)"
        />
        <AppText variant="bodyStrong" style={styles.skinGroupTitle}>
          파크골프 퍼터 선택
        </AppText>
        <View style={styles.skinRow}>
          {([
            { id: 'persimmon', label: '감나무 황동 퍼터' },
            { id: 'redwood', label: '적삼목 클래식' },
            { id: 'master_gold', label: '명인 금장 퍼터' },
          ] as const).map((item) => {
            const active = state.equippedSkins.putter === item.id;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                onPress={() => equipSkin('putter', item.id)}
                style={[styles.skinChip, active && styles.skinChipActive]}>
                <AppText
                  variant="caption"
                  style={{ color: active ? '#FCF9F2' : '#182620', fontFamily: FontWeights.emphasis }}>
                  {item.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <AppText variant="bodyStrong" style={styles.skinGroupTitle}>
          사천성 원목 패 스킨 선택
        </AppText>
        <View style={styles.skinRow}>
          {([
            { id: 'ivory_wood', label: '상아빛 양각 패' },
            { id: 'bamboo', label: '담양 대나무 패' },
            { id: 'mother_of_pearl', label: '나전칠기 흑단 패' },
          ] as const).map((item) => {
            const active = state.equippedSkins.tile === item.id;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                onPress={() => equipSkin('tile', item.id)}
                style={[styles.skinChip, active && styles.skinChipActive]}>
                <AppText
                  variant="caption"
                  style={{ color: active ? '#FCF9F2' : '#182620', fontFamily: FontWeights.emphasis }}>
                  {item.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <CosmeticShop />

      {/* 4. 급수 승급 계보 (18급 ~ 명인) */}
      <Card style={styles.roadmapCard}>
        <SectionHeader title="시니어 클럽 급수 승급표" description="대국을 즐길수록 명패의 품격이 올라갑니다" />
        {RANK_TIERS.map((tier) => {
          const unlocked = state.cp >= tier.minCp;
          return (
            <View key={tier.id} style={[styles.tierRow, unlocked && styles.tierRowUnlocked]}>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong" style={{ color: '#182620' }}>
                  {tier.label}
                </AppText>
                <AppText variant="caption" style={{ color: '#526451' }}>
                  {tier.plaqueName} · 기준 {tier.minCp.toLocaleString()} CP
                </AppText>
              </View>
              <AppText
                variant="caption"
                style={{
                  color: unlocked ? '#0E5142' : '#855B00',
                  fontFamily: FontWeights.strong,
                }}>
                {unlocked ? '달성 완료' : '도전 중'}
              </AppText>
            </View>
          );
        })}
      </Card>

      {/* 5. 접근성·진동 설정 및 플러스 광고 제거 */}
      <Card style={styles.settingCard}>
        <View style={styles.settingRow}>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong">큰 글씨 모드</AppText>
            <AppText variant="caption" style={{ color: '#526451' }}>
              모든 게임 화면과 점수판 글씨를 큼직하게 표시합니다.
            </AppText>
          </View>
          <Switch value={largeTextEnabled} onValueChange={toggleLargeText} />
        </View>
        <View style={styles.settingRow}>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong">손맛 진동 및 효과음</AppText>
            <AppText variant="caption" style={{ color: '#526451' }}>
              퍼터 타격·바둑알 충돌·패 맞춤 시 촉각 피드백을 켭니다.
            </AppText>
          </View>
          <Switch value={state.soundEnabled} onValueChange={toggleSound} />
        </View>
        <SeniorButton
          label="개인정보 처리방침"
          variant="quiet"
          onPress={() => {
            void Linking.openURL(getPublicWebPageUrl('privacy')).catch(() => {
              Alert.alert('안내를 열 수 없어요', '인터넷 연결을 확인한 뒤 다시 시도해 주세요.');
            });
          }}
        />
      </Card>

      <AdsPrivacySettings />
      <AnalyticsSettingsEntry />
      <PlusCard />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.md,
  },
  masterBanner: {
    backgroundColor: '#24382B',
    borderRadius: Radius.lg,
    borderWidth: 2,
    borderColor: '#F0BF4F',
    padding: Spacing.lg,
    alignItems: 'center',
    gap: 6,
  },
  badgeLarge: {
    width: 104,
    height: 104,
  },
  hallFlourish: {
    width: 96,
    height: 67,
    alignSelf: 'center',
    marginBottom: -6,
    overflow: 'hidden',
  },
  plaqueTag: {
    color: '#D8B384',
    fontFamily: FontWeights.emphasis,
  },
  statsCard: {
    backgroundColor: '#FCF9F2',
    borderColor: '#D8B384',
    borderWidth: 2,
    gap: Spacing.sm,
  },
  statGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  statItem: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: '#D8B384',
    padding: Spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  statLabel: {
    color: '#526451',
  },
  statVal: {
    color: '#0E5142',
    fontVariant: ['tabular-nums'],
  },
  skinCard: {
    backgroundColor: '#FCF9F2',
    borderColor: '#6E4228',
    borderWidth: 2,
    gap: Spacing.sm,
  },
  skinGroupTitle: {
    color: '#182620',
    marginTop: 4,
  },
  skinRow: {
    flexDirection: 'row',
    gap: 6,
  },
  skinChip: {
    flex: 1,
    minHeight: 48,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: '#6E4228',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  skinChipActive: {
    backgroundColor: '#0E5142',
    borderColor: '#0E5142',
  },
  roadmapCard: {
    backgroundColor: '#FCF9F2',
    gap: Spacing.xs,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
    backgroundColor: '#F1F5F3',
  },
  tierRowUnlocked: {
    backgroundColor: '#E3F3EA',
    borderWidth: 1,
    borderColor: '#277357',
  },
  settingCard: {
    backgroundColor: '#FFFFFF',
    gap: Spacing.md,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
});
