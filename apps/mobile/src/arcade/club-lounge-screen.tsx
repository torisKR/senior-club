import { Image } from 'expo-image';
import { type Href, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { HomeBannerAd } from '@/ads/HomeBannerAd';
import { AppText, Card, Screen, SectionHeader, SeniorButton } from '@/components/ui';
import { FontWeights, Layout, Radius, Spacing } from '@/constants/theme';
import { useAppState } from '@/hooks/use-app-state';

import { useArcade } from './arcade-store';

const HERO_BANNER = require('../../assets/game/rpg/pixel/ui/banner_lounge.png');
const MASTER_BADGE = require('../../assets/game/ui_rank_badge_master_01.png');
const PARKGOLF_BOARD = require('../../assets/game/env_parkgolf_green_board_01.png');
const ALKKAGI_BOARD = require('../../assets/game/env_alkkagi_wood_board_01.png');
const SACHEONSEONG_TILES = require('../../assets/game/spr_sacheonseong_tile_set_01.png');

export function ClubLoungeScreen() {
  const router = useRouter();
  const { largeTextEnabled, toggleLargeText } = useAppState();
  const { state, rankProgress, claimAttendanceStamp, triggerHaptic } = useArcade();
  const [stampBanner, setStampBanner] = useState<string | null>(null);

  const resumeRoute: Href =
    state.lastPlayedMode === 'alkkagi'
      ? '/events'
      : state.lastPlayedMode === 'sacheonseong'
        ? '/chat'
        : '/clubs';

  const resumeTitle =
    state.lastPlayedMode === 'alkkagi'
      ? '알까기 보드 대전 이어하기'
      : state.lastPlayedMode === 'sacheonseong'
        ? '전통 패 사천성 이어하기'
        : '파크골프 아케이드 이어하기';

  const handleClaimStamp = () => {
    const ok = claimAttendanceStamp();
    if (ok) {
      setStampBanner('오늘의 클럽 개근 낙관 날인 완료! (+300 CP · 명예 인장 +2)');
    } else {
      setStampBanner('오늘의 클럽 개근 도장을 이미 받으셨습니다.');
    }
  };

  return (
    <Screen testID="arcade-lounge-screen" contentContainerStyle={styles.container}>
      {/* 1. 상단 명패 & 급수 헤더 (Art Bible §4 & §7) */}
      <View style={styles.plaqueCard}>
        <View style={styles.plaqueTopRow}>
          <Image source={MASTER_BADGE} style={styles.badgeImage} contentFit="contain" />
          <View style={styles.plaqueInfo}>
            <View style={styles.tierPillRow}>
              <View style={styles.tierPill}>
                <AppText variant="caption" style={styles.tierPillText}>
                  {rankProgress.current.tierGroup} · {rankProgress.current.plaqueName}
                </AppText>
              </View>
            </View>
            <AppText variant="title" style={styles.rankTitle}>
              {rankProgress.current.label}
            </AppText>
            <AppText variant="caption" style={styles.cpSubtitle}>
              보유 점수 {state.cp.toLocaleString()} CP · 명예 인장 {state.seals}개
            </AppText>
          </View>
        </View>

        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.max(8, Math.round(rankProgress.progressRatio * 100))}%` },
            ]}
          />
        </View>
        <View style={styles.progressFooterRow}>
          <AppText variant="caption" style={styles.progressCaption}>
            {rankProgress.next
              ? `다음 승급(${rankProgress.next.shortLabel})까지 ${rankProgress.cpNeededForNext} CP 남음`
              : '최고위 클럽 명인(名人) 달성 완료!'}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="명인전당 급수표 보기"
            onPress={() => {
              triggerHaptic('light');
              router.push('/me' as Href);
            }}
            style={styles.hallLinkBtn}>
            <AppText variant="caption" style={styles.hallLinkText}>
              명인전당 보기 ▶
            </AppText>
          </Pressable>
        </View>
      </View>

      {/* 2. 클럽 라운지 히어로 배너 (ASSET-001) & 3초 즉시 대국 진입 */}
      <Card style={styles.heroCard}>
        <Image source={HERO_BANNER} style={styles.heroBanner} contentFit="cover" />
        <View style={styles.heroBody}>
          <AppText variant="sectionTitle" style={styles.heroHeadline}>
            청솔 시니어 마을: 클럽 아케이드
          </AppText>
          <AppText variant="body" style={styles.heroDesc}>
            18급 신입 회원에서 클럽 명인(名人)까지 — 원목 테이블과 파크골프 그린에서 한 수씩 성장하세요.
          </AppText>
          <SeniorButton
            testID="btn-resume-arcade"
            label={resumeTitle}
            variant="accent"
            onPress={() => {
              triggerHaptic('medium');
              router.push(resumeRoute);
            }}
          />
        </View>
      </Card>

      {/* 3. 3대 아케이드 종목 대형 카드 (SYS-01 ~ SYS-04) */}
      <SectionHeader
        title="3대 클럽 아케이드 종목"
        description="한 손 터치와 당기기로 즐기는 고대비 전통 보드·파크골프"
      />

      <View style={styles.modeList}>
        <Pressable
          testID="mode-card-parkgolf"
          accessibilityRole="button"
          accessibilityLabel="파크골프 아케이드 시작하기"
          onPress={() => {
            triggerHaptic('medium');
            router.push('/clubs' as Href);
          }}
          style={styles.modeCard}>
          <Image source={PARKGOLF_BOARD} style={styles.modeThumb} contentFit="cover" />
          <View style={styles.modeTextCol}>
            <View style={styles.modeTagRow}>
              <View style={[styles.modeTag, { backgroundColor: '#0E5142' }]}>
                <AppText variant="caption" style={styles.modeTagText}>야외 그린 · 9홀 퍼팅</AppText>
              </View>
              <AppText variant="caption" style={styles.modeRecordText}>
                홀인 {state.parkGolfClears}회
              </AppText>
            </View>
            <AppText variant="sectionTitle" style={styles.modeTitle}>
              1. 파크골프 아케이드
            </AppText>
            <AppText variant="caption" style={styles.modeDesc}>
              경사 화살표와 점선 궤적을 보고 감나무 퍼터로 홀컵에 쏙 넣으세요.
            </AppText>
            <View style={styles.modeCtaPill}>
              <AppText variant="bodyStrong" style={styles.modeCtaText}>
                그린 입장하기 ▶
              </AppText>
            </View>
          </View>
        </Pressable>

        <Pressable
          testID="mode-card-alkkagi"
          accessibilityRole="button"
          accessibilityLabel="알까기 보드 대전 시작하기"
          onPress={() => {
            triggerHaptic('medium');
            router.push('/events' as Href);
          }}
          style={styles.modeCard}>
          <Image source={ALKKAGI_BOARD} style={styles.modeThumb} contentFit="cover" />
          <View style={styles.modeTextCol}>
            <View style={styles.modeTagRow}>
              <View style={[styles.modeTag, { backgroundColor: '#6E4228' }]}>
                <AppText variant="caption" style={styles.modeTagText}>비자나무 판 · 물리 대전</AppText>
              </View>
              <AppText variant="caption" style={styles.modeRecordText}>
                대국 {state.alkkagiWins}승 · 일석이조 {state.alkkagiDoubleKnockouts}회
              </AppText>
            </View>
            <AppText variant="sectionTitle" style={styles.modeTitle}>
              2. 알까기 보드 대전
            </AppText>
            <AppText variant="caption" style={styles.modeDesc}>
              흑석과 백석의 정면 승부! 통쾌한 일석이조로 상대 알을 밀어내세요.
            </AppText>
            <View style={[styles.modeCtaPill, { backgroundColor: '#C2410C' }]}>
              <AppText variant="bodyStrong" style={styles.modeCtaText}>
                대국 시작하기 ▶
              </AppText>
            </View>
          </View>
        </Pressable>

        <Pressable
          testID="mode-card-sacheonseong"
          accessibilityRole="button"
          accessibilityLabel="전통 패 사천성 시작하기"
          onPress={() => {
            triggerHaptic('medium');
            router.push('/chat' as Href);
          }}
          style={styles.modeCard}>
          <Image source={SACHEONSEONG_TILES} style={styles.modeThumb} contentFit="contain" />
          <View style={styles.modeTextCol}>
            <View style={styles.modeTagRow}>
              <View style={[styles.modeTag, { backgroundColor: '#1E6F94' }]}>
                <AppText variant="caption" style={styles.modeTagText}>두뇌 활력 · 전통 패 퍼즐</AppText>
              </View>
              <AppText variant="caption" style={styles.modeRecordText}>
                클리어 {state.sacheonseongClears}회 · {state.sacheonseongMaxCombo}연타
              </AppText>
            </View>
            <AppText variant="sectionTitle" style={styles.modeTitle}>
              3. 전통 패 사천성
            </AppText>
            <AppText variant="caption" style={styles.modeDesc}>
              송학·매화·단풍·보름달! 큼직한 상아빛 원목 패의 짝을 맞추세요.
            </AppText>
            <View style={styles.modeCtaPill}>
              <AppText variant="bodyStrong" style={styles.modeCtaText}>
                패 맞추기 시작 ▶
              </AppText>
            </View>
          </View>
        </Pressable>
      </View>

      {/* 4. 오늘의 클럽 일과 3칸 스탬프 보드 & 낙관 도장 (ASSET-003) */}
      <Card style={styles.dailyCard}>
        <SectionHeader
          title="오늘의 클럽 3종 일과"
          description="세 종목을 즐기고 개근 낙관 도장(+300 CP)을 받으세요"
        />
        <View style={styles.stampRow}>
          <View style={[styles.stampBox, state.dailyMissions.parkGolfDone && styles.stampBoxDone]}>
            <AppText variant="bodyStrong" style={styles.stampBoxTitle}>파크골프</AppText>
            <AppText variant="caption" style={styles.stampSealText}>
              {state.dailyMissions.parkGolfDone ? '印 완수' : '1홀 클리어'}
            </AppText>
          </View>
          <View style={[styles.stampBox, state.dailyMissions.alkkagiDone && styles.stampBoxDone]}>
            <AppText variant="bodyStrong" style={styles.stampBoxTitle}>알까기</AppText>
            <AppText variant="caption" style={styles.stampSealText}>
              {state.dailyMissions.alkkagiDone ? '印 완수' : '대국 1승'}
            </AppText>
          </View>
          <View style={[styles.stampBox, state.dailyMissions.sacheonseongDone && styles.stampBoxDone]}>
            <AppText variant="bodyStrong" style={styles.stampBoxTitle}>사천성</AppText>
            <AppText variant="caption" style={styles.stampSealText}>
              {state.dailyMissions.sacheonseongDone ? '印 완수' : '1판 클리어'}
            </AppText>
          </View>
        </View>
        {stampBanner ? (
          <View style={styles.stampNotice}>
            <AppText variant="bodyStrong" style={{ color: '#0E5142' }}>{stampBanner}</AppText>
          </View>
        ) : null}
        <SeniorButton
          testID="btn-claim-daily-stamp"
          label={
            state.dailyMissions.attendanceStampClaimed
              ? '오늘의 개근 낙관 날인 완료 (보상 수령됨)'
              : '오늘의 클럽 개근 낙관 찍기 (+300 CP)'
          }
          variant={state.dailyMissions.attendanceStampClaimed ? 'secondary' : 'primary'}
          onPress={handleClaimStamp}
        />
      </Card>

      {/* 5. 시니어 큰 글씨 접근성 빠른 스위치 */}
      <Card style={styles.accessCard}>
        <View style={styles.accessRow}>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong">시니어 큰 글씨 모드</AppText>
            <AppText variant="caption" style={{ color: '#526451' }}>
              점수판과 패·버튼 글씨를 더욱 큼직하고 선명하게 키웁니다.
            </AppText>
          </View>
          <Switch
            value={largeTextEnabled}
            onValueChange={toggleLargeText}
            trackColor={{ false: '#A6B8B2', true: '#0E5142' }}
          />
        </View>
      </Card>

      <HomeBannerAd />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.lg,
  },
  plaqueCard: {
    backgroundColor: '#24382B',
    borderRadius: Radius.lg,
    borderWidth: 2,
    borderColor: '#D8B384',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  plaqueTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  badgeImage: {
    width: 76,
    height: 76,
  },
  plaqueInfo: {
    flex: 1,
    gap: 4,
  },
  tierPillRow: {
    flexDirection: 'row',
  },
  tierPill: {
    backgroundColor: '#0E5142',
    borderColor: '#F0BF4F',
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  tierPillText: {
    color: '#F0BF4F',
    fontFamily: FontWeights.emphasis,
  },
  rankTitle: {
    color: '#FCF9F2',
  },
  cpSubtitle: {
    color: '#E4EDDA',
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 12,
    borderRadius: Radius.pill,
    backgroundColor: '#142219',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#6E4228',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#F0BF4F',
    borderRadius: Radius.pill,
  },
  progressFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressCaption: {
    color: '#D8B384',
    flex: 1,
  },
  hallLinkBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  hallLinkText: {
    color: '#F0BF4F',
    fontFamily: FontWeights.emphasis,
  },
  heroCard: {
    padding: 0,
    overflow: 'hidden',
    borderColor: '#6E4228',
    borderWidth: 2,
    backgroundColor: '#FCF9F2',
  },
  heroBanner: {
    width: '100%',
    height: 184,
  },
  heroBody: {
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  heroHeadline: {
    color: '#182620',
  },
  heroDesc: {
    color: '#24382B',
  },
  modeList: {
    gap: Spacing.md,
  },
  modeCard: {
    flexDirection: 'row',
    backgroundColor: '#FCF9F2',
    borderRadius: Radius.lg,
    borderWidth: 2,
    borderColor: '#6E4228',
    padding: Spacing.md,
    gap: Spacing.md,
    alignItems: 'center',
    minHeight: 132,
  },
  modeThumb: {
    width: 96,
    height: 108,
    borderRadius: Radius.md,
    backgroundColor: '#0E5142',
    borderWidth: 1.5,
    borderColor: '#D8B384',
  },
  modeTextCol: {
    flex: 1,
    gap: 6,
  },
  modeTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 4,
  },
  modeTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  modeTagText: {
    color: '#FCF9F2',
    fontSize: 13,
    fontFamily: FontWeights.emphasis,
  },
  modeRecordText: {
    color: '#6E4228',
    fontFamily: FontWeights.emphasis,
    fontSize: 13,
  },
  modeTitle: {
    color: '#182620',
  },
  modeDesc: {
    color: '#35493E',
  },
  modeCtaPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#0E5142',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.md,
    marginTop: 2,
  },
  modeCtaText: {
    color: '#FCF9F2',
  },
  dailyCard: {
    backgroundColor: '#FCF9F2',
    borderColor: '#D8B384',
    borderWidth: 2,
    gap: Spacing.md,
  },
  stampRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  stampBox: {
    flex: 1,
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: '#A6B8B2',
    backgroundColor: '#F1F5F3',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xs,
    alignItems: 'center',
    gap: 4,
  },
  stampBoxDone: {
    borderColor: '#C2410C',
    backgroundColor: '#FDE7DF',
  },
  stampBoxTitle: {
    color: '#182620',
  },
  stampSealText: {
    color: '#C2410C',
    fontFamily: FontWeights.strong,
  },
  stampNotice: {
    backgroundColor: '#E3F3EA',
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#277357',
  },
  accessCard: {
    backgroundColor: '#FFFFFF',
  },
  accessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
});
