import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';

import { kakaoErrorMessage } from '@/auth/kakao-error-message';
import { Layout, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { getPublicWebPageUrl } from '@/config/public-web-links';
import { AppText } from '@/components/ui/app-text';
import { AppIcon } from '@/components/ui/app-icon';
import { CoverImage, CoverImageRatios } from '@/components/ui/cover-image';
import { selectCoverImage } from '@/data/image-assets';
import { useAppState } from '@/hooks/use-app-state';
import { useTheme } from '@/hooks/use-theme';
import {
  buildOnboardingHref,
  buildPostAuthHref,
  sanitizeAuthIntent,
  sanitizeReturnTo,
} from '@/utils/auth-routing';

export function LoginScreen() {
  const theme = useTheme();
  const {
    authRestoreError,
    onboardingCompleted,
    profile,
    session,
    signInWithKakao,
  } = useAppState();
  const params = useLocalSearchParams<{
    intent?: string | string[];
    returnTo?: string | string[];
  }>();
  const returnTo = sanitizeReturnTo(params.returnTo);
  const intent = sanitizeAuthIntent(params.intent);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState('');
  const displayedNotice = notice || authRestoreError;
  const manualSignInOwnsNavigation = useRef(false);

  useEffect(() => {
    if (!session || manualSignInOwnsNavigation.current) return;

    const hasCompletedProfile =
      session.onboardingCompletedAt !== null ||
      (onboardingCompleted && profile.id === session.userId);
    router.replace(
      hasCompletedProfile
        ? buildPostAuthHref(returnTo, intent)
        : buildOnboardingHref(returnTo, intent),
    );
  }, [intent, onboardingCompleted, profile.id, returnTo, session]);

  const handleKakaoSignIn = async () => {
    if (isSubmitting) return;
    if (!termsAccepted || !privacyAccepted) {
      setNotice('서비스 이용약관과 개인정보 처리방침에 모두 동의해 주세요.');
      return;
    }

    setIsSubmitting(true);
    setNotice('');
    manualSignInOwnsNavigation.current = true;
    try {
      const session = await signInWithKakao({
        termsAccepted: true,
        privacyAccepted: true,
      });
      const hasCompletedProfile =
        session.onboardingCompletedAt !== null ||
        (onboardingCompleted && profile.id === session.userId);
      router.replace(
        hasCompletedProfile
          ? buildPostAuthHref(returnTo, intent)
          : buildOnboardingHref(returnTo, intent),
      );
    } catch (error) {
      manualSignInOwnsNavigation.current = false;
      setNotice(kakaoErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <View style={styles.brandRow} accessibilityRole="header">
              <Image
                source={require('../../../assets/images/senior-club-logo-ui-v3.png')}
                style={styles.brandMark}
                contentFit="cover"
                accessibilityLabel="시니어클럽 로고"
              />
              <View style={styles.brandCopy}>
                <AppText variant="sectionTitle" style={[styles.brandName, { color: theme.text }]}>시니어클럽</AppText>
                <AppText variant="caption" style={{ color: theme.textSecondary }}>함께하는 목적이, 오래가는 관계로</AppText>
              </View>
            </View>

            <CoverImage
              image={selectCoverImage(undefined, 'hiking')}
              recyclingKey="login-hero"
              accessibilityLabel="시니어클럽 활동 소개 이미지"
              aspectRatio={CoverImageRatios.hero}
              style={styles.hero}
            />

            <View style={styles.intro}>
              <AppText variant="title" style={[styles.sectionTitle, { color: theme.text }]}>로그인하고 계속하기</AppText>
              <AppText variant="body" style={{ color: theme.textSecondary }}>
                카카오 계정으로 로그인하고, 좋아하는 일을 함께 시작해요.
              </AppText>
              {intent === 'apply' ? (
                <AppText variant="bodyStrong" style={{ color: theme.primary }}>
                  로그인 후 보던 모임으로 돌아가 신청을 이어갈 수 있어요.
                </AppText>
              ) : null}
            </View>

            <View style={styles.consentList} accessibilityLabel="필수 약관 동의">
              <ConsentCheckbox
                checked={termsAccepted}
                label="서비스 이용약관에 동의합니다 (필수)"
                onPress={() => {
                  setTermsAccepted((current) => !current);
                  setNotice('');
                }}
                theme={theme}
              />
              <ConsentCheckbox
                checked={privacyAccepted}
                label="개인정보 처리방침에 동의합니다 (필수)"
                onPress={() => {
                  setPrivacyAccepted((current) => !current);
                  setNotice('');
                }}
                theme={theme}
              />
            </View>

            {displayedNotice ? (
              <View
                style={[styles.notice, { backgroundColor: theme.warningSurface, borderColor: theme.warning }]}
                accessibilityLiveRegion="polite"
              >
                <AppText variant="body" style={{ color: theme.warning }}>
                  {displayedNotice}
                </AppText>
              </View>
            ) : null}

            <Pressable
              disabled={isSubmitting}
              onPress={handleKakaoSignIn}
              style={({ pressed }) => [
                styles.kakaoButton,
                { opacity: isSubmitting ? 0.55 : pressed ? 0.78 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
              accessibilityLabel="카카오로 간편 로그인">
              {isSubmitting ? (
                <ActivityIndicator color="#191919" size="small" />
              ) : (
                <AppIcon name="chat" color="#191919" />
              )}
              <AppText variant="button" selectable={false} style={styles.kakaoButtonText}>
                {isSubmitting ? '카카오 로그인을 확인하고 있어요…' : '카카오로 간편하게 시작하기'}
              </AppText>
            </Pressable>

            <View style={[styles.productionNotice, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <AppText variant="bodyStrong" style={{ color: theme.text }}>내 정보 설정 안내</AppText>
              <AppText variant="caption" style={{ color: theme.textSecondary }}>
                이름, 별명, 휴대폰 번호와 활동 지역은 내 정보에서 직접 설정할 수 있어요.
              </AppText>
            </View>

            <View style={styles.legalBlock}>
              <AppText variant="caption" style={[styles.legal, { color: theme.textMuted }]}>로그인하기 전에 아래 내용을 확인해 주세요.</AppText>
              <View style={styles.legalLinks}>
                <Pressable
                  onPress={() => Linking.openURL(getPublicWebPageUrl('terms'))}
                  hitSlop={8}
                  style={styles.legalLinkPressable}
                  accessibilityRole="link"
                  accessibilityLabel="서비스 이용약관 열기"
                >
                  <AppText variant="caption" style={[styles.legalLink, { color: theme.primary }]}>서비스 이용약관</AppText>
                </Pressable>
                <AppText variant="caption" style={{ color: theme.textMuted }} accessibilityElementsHidden>
                  ·
                </AppText>
                <Pressable
                  onPress={() => Linking.openURL(getPublicWebPageUrl('privacy'))}
                  hitSlop={8}
                  style={styles.legalLinkPressable}
                  accessibilityRole="link"
                  accessibilityLabel="개인정보 처리방침 열기"
                >
                  <AppText variant="caption" style={[styles.legalLink, { color: theme.primary }]}>개인정보 처리방침</AppText>
                </Pressable>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ConsentCheckbox({
  checked,
  label,
  onPress,
  theme,
}: {
  checked: boolean;
  label: string;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.consentRow,
        {
          borderColor: checked ? theme.primary : theme.border,
          backgroundColor: checked ? theme.backgroundSelected : theme.surface,
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      <View
        accessibilityElementsHidden
        style={[
          styles.checkBox,
          { borderColor: checked ? theme.primary : theme.border, backgroundColor: checked ? theme.primary : 'transparent' },
        ]}>
        {checked ? <AppIcon name="check" color="#FFFFFF" size={18} /> : null}
      </View>
      <AppText variant="body" selectable={false} style={[styles.consentLabel, { color: theme.text }]}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: Spacing.xxl },
  content: {
    width: '100%',
    maxWidth: Layout.maxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Layout.screenPadding,
    gap: Spacing.lg,
  },
  brandRow: {
    minHeight: TouchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingTop: Spacing.sm,
  },
  brandMark: { width: 44, height: 44, borderRadius: 14, flexShrink: 0 },
  brandCopy: { flex: 1, minWidth: 0, gap: 2 },
  brandName: { letterSpacing: -0.4 },
  hero: { borderRadius: Radius.lg },
  intro: { gap: Spacing.sm },
  sectionTitle: { letterSpacing: -0.5 },
  consentList: { gap: Spacing.sm },
  consentRow: {
    minHeight: TouchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  checkBox: {
    width: 24,
    height: 24,
    flexShrink: 0,
    borderWidth: 2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  consentLabel: { flex: 1, minWidth: 0 },
  notice: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.lg },
  kakaoButton: {
    minHeight: TouchTarget.minimum,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.xl,
    backgroundColor: '#FEE500',
    marginTop: Spacing.sm,
  },
  kakaoButtonText: { color: '#191919', flexShrink: 1, textAlign: 'center' },
  productionNotice: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.xs },
  legalBlock: { alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, marginTop: Spacing.md },
  legal: { textAlign: 'center' },
  legalLinks: { minHeight: TouchTarget.compact, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  legalLinkPressable: { minHeight: TouchTarget.compact, justifyContent: 'center' },
  legalLink: { textDecorationLine: 'underline' },
});
