import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Pressable, Switch, TextInput, View } from 'react-native';

import { ApiError } from '@/api/api-error';
import { apiErrorMessage } from '@/api/error-message';
import { BlockedUsersSection } from '@/components/safety';
import { AppText, Card, InterestChip, Screen, SectionHeader, SeniorButton } from '@/components/ui';
import { Radius, Spacing, TouchTarget, FontWeights } from '@/constants/theme';
import { getPublicWebPageUrl } from '@/config/public-web-links';
import { useAppState } from '@/hooks/use-app-state';
import { useTheme } from '@/hooks/use-theme';
import type { ParticipationStatus } from '@/types';

const STATUS_LABELS: Record<ParticipationStatus, { label: string; description: string }> = {
  pending: { label: '승인 대기', description: '리더가 신청 내용을 확인하고 있어요.' },
  approved: { label: '참여 확정', description: '모임 채팅에서 준비 내용을 확인하세요.' },
  attended: { label: '참여 완료', description: '함께한 모임의 후기를 남길 수 있어요.' },
  reviewed: { label: '후기 작성 완료', description: '소중한 후기를 남겨 주셨어요.' },
};

export function ProfileScreen() {
  const theme = useTheme();
  const {
    profile,
    session,
    interests,
    selectedInterestIds,
    participations,
    events,
    largeTextEnabled,
    setLargeTextEnabled,
    toggleInterest,
    resetSession,
    deleteAccount,
  } = useAppState();
  const [announcement, setAnnouncement] = useState('');
  const [showDeletionForm, setShowDeletionForm] = useState(false);
  const [deletionConfirmation, setDeletionConfirmation] = useState('');
  const [deletionReason, setDeletionReason] = useState('');
  const [deletionError, setDeletionError] = useState('');
  const [deletionLoading, setDeletionLoading] = useState(false);
  const [recentAuthenticationRequired, setRecentAuthenticationRequired] = useState(false);

  async function openPolicy(url: string, label: string) {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(`${label}을 열 수 없어요`, '네트워크 연결을 확인한 뒤 다시 시도해 주세요.');
    }
  }

  function confirmLogout() {
    Alert.alert('로그아웃할까요?', '이 기기의 로그인 상태가 해제됩니다.', [
      { text: '계속 이용하기', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: () => void resetSession().finally(() => router.replace('/login')),
      },
    ]);
  }

  function confirmDeleteAccount() {
    Alert.alert(
      '계정과 데이터를 삭제할까요?',
      '요청 후 7일의 유예 기간이 지나면 계정과 개인정보가 삭제됩니다. 요청 즉시 모든 기기에서 로그아웃됩니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '계정 삭제',
          style: 'destructive',
          onPress: () => {
            setDeletionError('');
            setRecentAuthenticationRequired(false);
            setShowDeletionForm(true);
          },
        },
      ],
    );
  }

  async function submitDeletionRequest() {
    if (deletionLoading) return;
    if (deletionConfirmation.trim() !== '계정 삭제') {
      setDeletionError('확인을 위해 ‘계정 삭제’를 정확히 입력해 주세요.');
      return;
    }
    const reason = deletionReason.trim();
    if (reason.length === 1) {
      setDeletionError('탈퇴 사유를 입력하려면 두 글자 이상 적어 주세요.');
      return;
    }

    setDeletionLoading(true);
    setDeletionError('');
    setRecentAuthenticationRequired(false);
    try {
      const deletionRequest = await deleteAccount(reason || undefined);
      const scheduledDate = new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(new Date(deletionRequest.scheduledFor));
      Alert.alert(
        '계정 삭제 요청을 접수했어요',
        `${scheduledDate}에 삭제될 예정입니다. 안내 이메일도 보내드렸습니다.`,
      );
      router.replace('/login');
    } catch (error) {
      const requiresRecentAuth =
        error instanceof ApiError &&
        (error.code === 'RECENT_AUTHENTICATION_REQUIRED' ||
          error.code === 'INVALID_SESSION' ||
          error.status === 401 ||
          error.status === 403);
      setRecentAuthenticationRequired(requiresRecentAuth);
      setDeletionError(
        requiresRecentAuth
          ? '계정 보호를 위해 방금 다시 로그인한 상태가 필요합니다. 아래 버튼으로 로그아웃한 뒤 다시 로그인해 주세요.'
          : apiErrorMessage(error, '계정 삭제 요청을 접수하지 못했습니다.'),
      );
    } finally {
      setDeletionLoading(false);
    }
  }

  async function reauthenticateForDeletion() {
    await resetSession();
    router.replace({ pathname: '/login', params: { returnTo: '/me' } });
  }

  return (
    <Screen contentContainerStyle={{ gap: Spacing.xxxl }}>
      <View style={{ gap: Spacing.xs }}>
        <AppText variant="title">내 정보</AppText>
        <AppText color="textSecondary">내 관심사와 모임 참여 상태를 한눈에 확인하세요.</AppText>
      </View>

      <Card>
        <View style={{ gap: Spacing.xl }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.lg }}>
            <View
              accessibilityLabel={`${profile.name} 프로필`}
              style={{
                width: 72,
                height: 72,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: Radius.pill,
                backgroundColor: theme.backgroundSelected,
              }}>
              <AppText variant="title" color="primary" selectable={false}>
                {profile.name.slice(0, 1)}
              </AppText>
            </View>
            <View style={{ flex: 1, gap: Spacing.xs }}>
              <AppText variant="sectionTitle">{profile.name}</AppText>
              <AppText color="textSecondary">{profile.ageGroup} · {profile.region}</AppText>
              <AppText variant="caption" color="textMuted">
                휴대폰 SMS 인증 회원
              </AppText>
            </View>
          </View>
          <View style={{ gap: Spacing.sm, paddingTop: Spacing.lg, borderTopWidth: 1, borderTopColor: theme.divider }}>
            <AppText variant="bodyStrong">휴대폰 번호</AppText>
            <AppText color="textSecondary">{profile.phoneNumber ?? '등록된 번호 없음'}</AppText>
          </View>
        </View>
      </Card>

      <View style={{ gap: Spacing.md }}>
        <SectionHeader
          title="내 관심사"
          description="관심사를 누르면 홈과 모임 추천에 바로 반영됩니다."
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
          {interests.map((interest) => (
            <InterestChip
              key={interest.id}
              interest={interest}
              selected={selectedInterestIds.includes(interest.id)}
              onPress={(selectedInterest) => {
                toggleInterest(selectedInterest.id);
                setAnnouncement(
                  selectedInterestIds.includes(selectedInterest.id)
                    ? `${selectedInterest.name} 관심사를 해제했습니다.`
                    : `${selectedInterest.name} 관심사를 선택했습니다.`,
                );
              }}
            />
          ))}
        </View>
      </View>

      <BlockedUsersSection currentUserId={session?.userId} />

      <View style={{ gap: Spacing.md }}>
        <SectionHeader
          title="내 모임 신청"
          description={`신청하거나 참여한 모임 ${participations.length}개`}
        />
        {participations.map((participation) => {
          const event = events.find((candidate) => candidate.id === participation.eventId);
          const status = STATUS_LABELS[participation.status];
          const canOpenReview = participation.status === 'attended';
          const destination = canOpenReview
            ? ({ pathname: '/reviews/new', params: { eventId: participation.eventId } } as Href)
            : (`/event/${participation.eventId}` as Href);

          if (!event) {
            return null;
          }

          return (
            <Pressable
              key={participation.id}
              accessibilityRole="button"
              accessibilityLabel={`${event.title}, ${status.label}, ${canOpenReview ? '후기 확인 또는 작성하기' : '모임 자세히 보기'}`}
              onPress={() => router.push(destination)}
              style={({ pressed }) => ({
                minHeight: TouchTarget.minimum,
                padding: Spacing.xl,
                gap: Spacing.md,
                borderWidth: 1,
                borderColor: theme.divider,
                borderRadius: Radius.lg,
                borderCurve: 'continuous',
                backgroundColor: pressed ? theme.backgroundSelected : theme.surface,
              })}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.md }}>
                <AppText variant="bodyStrong" style={{ flex: 1 }} selectable={false}>
                  {event.title}
                </AppText>
                <View
                  style={{
                    paddingHorizontal: Spacing.md,
                    paddingVertical: Spacing.xs,
                    borderRadius: Radius.pill,
                    backgroundColor:
                      participation.status === 'pending' ? theme.warningSurface : theme.successSurface,
                  }}>
                  <AppText
                    variant="caption"
                    color={participation.status === 'pending' ? 'warning' : 'success'}
                    selectable={false}>
                    {status.label}
                  </AppText>
                </View>
              </View>
              <AppText color="textSecondary" selectable={false}>
                {status.description}
              </AppText>
              <AppText variant="caption" color="primary" selectable={false}>
                {canOpenReview ? '후기 확인 또는 작성하기 ›' : '모임 자세히 보기 ›'}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <View style={{ gap: Spacing.md }}>
        <SectionHeader title="보기 편한 설정" description="이 기기에서 사용하는 글자 크기를 선택하세요." />
        <Card>
          <View
            style={{ minHeight: TouchTarget.minimum, flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
            <View style={{ flex: 1, gap: Spacing.xs }}>
              <AppText variant="bodyStrong">글자 크게 보기</AppText>
              <AppText color="textSecondary">본문과 버튼 글자를 한 단계 크게 표시합니다.</AppText>
            </View>
            <Switch
              accessibilityLabel="글자 크게 보기"
              accessibilityHint="두 번 탭하면 글자 크기를 바꿉니다"
              hitSlop={12}
              value={largeTextEnabled}
              onValueChange={(enabled) => {
                setLargeTextEnabled(enabled);
                setAnnouncement(`글자 크게 보기를 ${enabled ? '켰습니다' : '껐습니다'}.`);
              }}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor={theme.surface}
            />
          </View>
        </Card>
      </View>

      <View style={{ gap: Spacing.md }}>
        <SectionHeader title="개인정보와 계정" />
        <Card padded={false}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="개인정보 처리방침 열기"
            onPress={() => openPolicy(getPublicWebPageUrl('privacy'), '개인정보 처리방침')}
            style={({ pressed }) => ({
              minHeight: TouchTarget.minimum,
              paddingHorizontal: Spacing.xl,
              paddingVertical: Spacing.lg,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: Spacing.md,
              backgroundColor: pressed ? theme.backgroundElement : theme.surface,
            })}>
            <AppText variant="bodyStrong" selectable={false}>개인정보 처리방침</AppText>
            <AppText color="primary" selectable={false}>›</AppText>
          </Pressable>
          <View style={{ height: 1, backgroundColor: theme.divider }} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="이 기기의 계정과 데이터 삭제"
            onPress={confirmDeleteAccount}
            style={({ pressed }) => ({
              minHeight: TouchTarget.minimum,
              paddingHorizontal: Spacing.xl,
              paddingVertical: Spacing.lg,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: Spacing.md,
              backgroundColor: pressed ? theme.dangerSurface : theme.surface,
            })}>
            <View style={{ flex: 1, gap: Spacing.xs }}>
              <AppText variant="bodyStrong" color="danger" selectable={false}>계정 및 데이터 삭제</AppText>
              <AppText variant="caption" color="textSecondary" selectable={false}>
                서버에 계정 삭제를 요청하고 모든 기기에서 로그아웃합니다.
              </AppText>
            </View>
            <AppText color="danger" selectable={false}>›</AppText>
          </Pressable>
          <View style={{ height: 1, backgroundColor: theme.divider }} />
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="계정 삭제 안내 열기"
            onPress={() => openPolicy(getPublicWebPageUrl('account-deletion'), '계정 삭제 안내')}
            style={({ pressed }) => ({
              minHeight: TouchTarget.minimum,
              paddingHorizontal: Spacing.xl,
              paddingVertical: Spacing.lg,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: Spacing.md,
              backgroundColor: pressed ? theme.dangerSurface : theme.surface,
            })}>
            <AppText variant="bodyStrong" color="danger" selectable={false}>계정 삭제 안내</AppText>
            <AppText color="danger" selectable={false}>›</AppText>
          </Pressable>
        </Card>

        {showDeletionForm ? (
          <Card style={{ gap: Spacing.lg, borderColor: theme.danger }}>
            <View style={{ gap: Spacing.sm }}>
              <AppText variant="sectionTitle" color="danger">계정 삭제 요청</AppText>
              <AppText color="textSecondary">
                요청 후 7일 동안 삭제가 유예됩니다. 계속하려면 아래에 ‘계정 삭제’를 입력해 주세요.
              </AppText>
            </View>
            <View style={{ gap: Spacing.sm }}>
              <AppText variant="bodyStrong">확인 문구</AppText>
              <TextInput
                value={deletionConfirmation}
                onChangeText={(value) => {
                  setDeletionConfirmation(value);
                  setDeletionError('');
                }}
                editable={!deletionLoading}
                placeholder="계정 삭제"
                placeholderTextColor={theme.textMuted}
                autoCapitalize="none"
                style={{
                  minHeight: 56,
                  borderWidth: 2,
                  borderColor: theme.border,
                  borderRadius: Radius.md,
                  backgroundColor: theme.surface,
                  color: theme.text,
                  paddingHorizontal: Spacing.lg,
                  fontSize: 18,
                  fontFamily: FontWeights.emphasis,
                }}
                accessibilityLabel="계정 삭제 확인 문구"
              />
            </View>
            <View style={{ gap: Spacing.sm }}>
              <AppText variant="bodyStrong">탈퇴 사유 (선택)</AppText>
              <TextInput
                value={deletionReason}
                onChangeText={(value) => {
                  setDeletionReason(value.slice(0, 500));
                  setDeletionError('');
                }}
                editable={!deletionLoading}
                placeholder="서비스 개선을 위해 의견을 남겨 주세요."
                placeholderTextColor={theme.textMuted}
                multiline
                maxLength={500}
                style={{
                  minHeight: 96,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: Radius.md,
                  backgroundColor: theme.surface,
                  color: theme.text,
                  padding: Spacing.lg,
                  fontSize: 17,
                  lineHeight: 25,
                  textAlignVertical: 'top',
                }}
                accessibilityLabel="선택 입력인 탈퇴 사유"
              />
            </View>
            {deletionError ? (
              <AppText color="danger" variant="bodyStrong" accessibilityLiveRegion="assertive">
                {deletionError}
              </AppText>
            ) : null}
            {recentAuthenticationRequired ? (
              <SeniorButton
                label="다시 로그인하기"
                variant="outline"
                onPress={() => void reauthenticateForDeletion()}
              />
            ) : null}
            <View style={{ gap: Spacing.sm }}>
              <SeniorButton
                label="계정 삭제 요청 보내기"
                variant="danger"
                loading={deletionLoading}
                disabled={deletionConfirmation.trim() !== '계정 삭제'}
                onPress={() => void submitDeletionRequest()}
              />
              <SeniorButton
                label="취소"
                variant="ghost"
                disabled={deletionLoading}
                onPress={() => {
                  setShowDeletionForm(false);
                  setDeletionConfirmation('');
                  setDeletionReason('');
                  setDeletionError('');
                }}
              />
            </View>
          </Card>
        ) : null}
      </View>

      <View style={{ gap: Spacing.md }}>
        <SeniorButton label="로그아웃" variant="danger" onPress={confirmLogout} />
      </View>

      {announcement ? (
        <AppText accessibilityLiveRegion="polite" variant="bodyStrong" color="success">
          {announcement}
        </AppText>
      ) : null}
    </Screen>
  );
}
