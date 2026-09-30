import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';

import { kakaoErrorMessage } from '@/auth/kakao-error-message';
import { Layout, Radius, Spacing, TouchTarget, FontWeights } from '@/constants/theme';
import { getPublicWebPageUrl } from '@/config/public-web-links';
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
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
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
                <Text style={[styles.brandName, { color: theme.text }]}>시니어클럽</Text>
                <Text style={[styles.brandTagline, { color: theme.textSecondary }]}>함께하는 목적이, 오래가는 관계로</Text>
              </View>
            </View>

            <ImageBackground
              source={require('../../../assets/images/senior-club-hero-v2.jpg')}
              style={styles.hero}
              imageStyle={styles.heroImage}
              accessibilityIgnoresInvertColors
            >
              <View style={styles.heroScrim} />
              <View style={styles.heroCopy}>
                <Text style={styles.heroEyebrow}>오늘, 새로운 사람과</Text>
                <Text style={styles.heroTitle}>좋아하는 일을 함께 시작해 보세요</Text>
              </View>
            </ImageBackground>

            <View style={styles.intro}>
              <View style={[styles.demoBadge, { backgroundColor: theme.infoSurface }]}>
                <Text style={[styles.demoBadgeText, { color: theme.info }]}>간편하고 안전한 카카오 로그인</Text>
              </View>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>로그인하고 계속하기</Text>
              <Text style={[styles.description, { color: theme.textSecondary }]}>
                복잡한 절차 없이 카카오 계정으로 안전하고 간편하게 바로 시작할 수 있어요.
              </Text>
              {intent === 'apply' ? (
                <Text style={[styles.intentDescription, { color: theme.primary }]}>
                  로그인 후 보던 모임으로 돌아가 신청을 이어갈 수 있어요.
                </Text>
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
                <Text style={[styles.noticeText, { color: theme.warning }]}>
                  {displayedNotice}
                </Text>
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
                <Text style={styles.kakaoSymbol} accessibilityElementsHidden>
                  K
                </Text>
              )}
              <Text style={styles.kakaoButtonText}>
                {isSubmitting ? '카카오 로그인을 확인하고 있어요…' : '카카오로 간편하게 시작하기'}
              </Text>
            </Pressable>

            <View style={[styles.productionNotice, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <Text style={[styles.productionNoticeTitle, { color: theme.text }]}>내 정보 설정 안내</Text>
              <Text style={[styles.productionNoticeBody, { color: theme.textSecondary }]}>
                이름, 별명, 휴대폰 번호, 활동 지역은 로그인 후 [내 정보] 화면에서 본인이 언제든지 편리하게 설정하고 수정할 수 있습니다.
              </Text>
            </View>

            <View style={styles.legalBlock}>
              <Text style={[styles.legal, { color: theme.textMuted }]}>로그인하기 전에 아래 내용을 확인해 주세요.</Text>
              <View style={styles.legalLinks}>
                <Pressable
                  onPress={() => Linking.openURL(getPublicWebPageUrl('terms'))}
                  hitSlop={8}
                  style={styles.legalLinkPressable}
                  accessibilityRole="link"
                  accessibilityLabel="서비스 이용약관 열기"
                >
                  <Text style={[styles.legalLink, { color: theme.primary }]}>서비스 이용약관</Text>
                </Pressable>
                <Text style={[styles.legalDivider, { color: theme.textMuted }]} accessibilityElementsHidden>
                  ·
                </Text>
                <Pressable
                  onPress={() => Linking.openURL(getPublicWebPageUrl('privacy'))}
                  hitSlop={8}
                  style={styles.legalLinkPressable}
                  accessibilityRole="link"
                  accessibilityLabel="개인정보 처리방침 열기"
                >
                  <Text style={[styles.legalLink, { color: theme.primary }]}>개인정보 처리방침</Text>
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
        {checked ? <Text style={styles.checkMark}>✓</Text> : null}
      </View>
      <Text style={[styles.consentLabel, { color: theme.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 36 },
  content: {
    width: '100%',
    maxWidth: Layout.maxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Layout.screenPadding,
    gap: Spacing.xl,
  },
  brandRow: {
    minHeight: TouchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingTop: Spacing.sm,
  },
  brandMark: { width: 54, height: 54, borderRadius: 17 },
  brandCopy: { flex: 1, gap: 2 },
  brandName: { fontSize: 23, lineHeight: 29, fontFamily: FontWeights.strong, letterSpacing: -0.4 },
  brandTagline: { fontSize: 16, lineHeight: 23, fontFamily: FontWeights.emphasis },
  hero: {
    height: 250,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    borderRadius: Radius.xl,
  },
  heroImage: { borderRadius: Radius.xl },
  heroScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(8, 39, 32, 0.43)',
  },
  heroCopy: { padding: Spacing.xl, gap: Spacing.sm },
  heroEyebrow: { color: '#FFFFFF', fontSize: 17, lineHeight: 25, fontFamily: FontWeights.emphasis },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 30,
    lineHeight: 40,
    fontFamily: FontWeights.strong,
    letterSpacing: -0.8,
  },
  intro: { gap: Spacing.sm },
  demoBadge: {
    alignSelf: 'flex-start',
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
  },
  demoBadgeText: { fontSize: 16, lineHeight: 22, fontFamily: FontWeights.strong },
  sectionTitle: { fontSize: 26, lineHeight: 35, fontFamily: FontWeights.strong, letterSpacing: -0.5 },
  description: { fontSize: 18, lineHeight: 28, fontFamily: FontWeights.emphasis },
  intentDescription: { fontSize: 17, lineHeight: 26, fontFamily: FontWeights.strong },
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
    width: 28,
    height: 28,
    borderWidth: 2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: { color: '#FFFFFF', fontSize: 18, lineHeight: 22, fontFamily: FontWeights.strong },
  consentLabel: { flex: 1, fontSize: 17, lineHeight: 25, fontFamily: FontWeights.emphasis },
  notice: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.lg },
  noticeText: { fontSize: 17, lineHeight: 26, fontFamily: FontWeights.emphasis },
  kakaoButton: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.xl,
    backgroundColor: '#FEE500',
    marginTop: Spacing.sm,
  },
  kakaoSymbol: {
    color: '#191919',
    fontSize: 22,
    lineHeight: 28,
    fontFamily: FontWeights.strong,
  },
  kakaoButtonText: {
    color: '#191919',
    fontSize: 20,
    lineHeight: 28,
    fontFamily: FontWeights.strong,
  },
  productionNotice: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.xs },
  productionNoticeTitle: { fontSize: 17, lineHeight: 25, fontFamily: FontWeights.strong },
  productionNoticeBody: { fontSize: 16, lineHeight: 25, fontFamily: FontWeights.emphasis },
  legalBlock: { alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, marginTop: Spacing.md },
  legal: { fontSize: 15, lineHeight: 23, textAlign: 'center' },
  legalLinks: { minHeight: TouchTarget.compact, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  legalLinkPressable: { minHeight: TouchTarget.compact, justifyContent: 'center' },
  legalLink: { fontSize: 16, lineHeight: 24, fontFamily: FontWeights.strong, textDecorationLine: 'underline' },
  legalDivider: { fontSize: 18, lineHeight: 24, fontFamily: FontWeights.emphasis },
});
