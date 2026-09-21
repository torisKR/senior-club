import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ImageBackground,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';

import { apiErrorMessage } from '@/api/error-message';
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

const PHONE_PATTERN = /^(?:01[016789][\d\s().-]{7,10}|\+[1-9][\d\s().-]{9,14})$/;

export function LoginScreen() {
  const theme = useTheme();
  const {
    authRestoreError,
    onboardingCompleted,
    profile,
    requestPhoneCode,
    session,
    signInWithKakao,
    signInWithPhone,
  } = useAppState();
  const params = useLocalSearchParams<{
    intent?: string | string[];
    returnTo?: string | string[];
  }>();
  const returnTo = sanitizeReturnTo(params.returnTo);
  const intent = sanitizeAuthIntent(params.intent);
  const [displayName, setDisplayName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [retrySeconds, setRetrySeconds] = useState(0);
  const [notice, setNotice] = useState('');
  const manualSignInOwnsNavigation = useRef(false);

  useEffect(() => {
    if (retrySeconds <= 0) return;
    const timer = setInterval(() => {
      setRetrySeconds((current) => Math.max(0, current - 1));
    }, 1_000);
    return () => clearInterval(timer);
  }, [retrySeconds]);

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

  const validateDetails = () => {
    const normalizedName = displayName.trim();
    const normalizedPhoneNumber = phoneNumber.trim();

    if (normalizedName.length < 2 || normalizedName.length > 20) {
      setNotice('이름 또는 별명을 두 글자 이상, 스무 글자 이내로 입력해 주세요.');
      return null;
    }

    if (!PHONE_PATTERN.test(normalizedPhoneNumber)) {
      setNotice('휴대폰 번호를 010-1234-5678 형식으로 입력해 주세요.');
      return null;
    }

    if (!termsAccepted || !privacyAccepted) {
      setNotice('서비스 이용약관과 개인정보 처리방침에 모두 동의해 주세요.');
      return null;
    }

    return { normalizedName, normalizedPhoneNumber };
  };

  const handleRequestCode = async () => {
    if (isSubmitting || retrySeconds > 0) return;
    const details = validateDetails();
    if (!details) return;

    setIsSubmitting(true);
    setNotice('');
    manualSignInOwnsNavigation.current = true;
    try {
      const challenge = await requestPhoneCode({ phoneNumber: details.normalizedPhoneNumber });
      setPhoneNumber(challenge.phoneNumber);
      setDisplayName(details.normalizedName);
      setChallengeId(challenge.challengeId);
      setRetrySeconds(Math.max(0, challenge.retryAfterSeconds));
      setNotice(
        challenge.devCode
          ? `개발용 인증번호는 ${challenge.devCode}입니다.`
          : '휴대폰으로 받은 6자리 인증번호를 입력해 주세요.',
      );
    } catch (error) {
      setNotice(apiErrorMessage(error, '인증번호를 보내지 못했습니다.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignIn = async () => {
    if (isSubmitting || !challengeId) return;
    if (!/^\d{6}$/.test(code)) {
      setNotice('휴대폰으로 받은 인증번호 6자리를 입력해 주세요.');
      return;
    }

    setIsSubmitting(true);
    setNotice('');
    try {
      const session = await signInWithPhone({
        challengeId,
        phoneNumber,
        displayName,
        code,
        termsAccepted: true,
        privacyAccepted: true,
      });
      const hasCompletedProfile =
        session.onboardingCompletedAt !== null ||
        (onboardingCompleted && profile.id === session.userId);

      if (!hasCompletedProfile) {
        router.replace(buildOnboardingHref(returnTo, intent));
        return;
      }

      router.replace(buildPostAuthHref(returnTo, intent));
    } catch (error) {
      manualSignInOwnsNavigation.current = false;
      setNotice(apiErrorMessage(error, '로그인하지 못했습니다.'));
    } finally {
      setIsSubmitting(false);
    }
  };

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
                <Text style={styles.heroTitle}>좋아하는 일을{`\n`}함께 시작해 보세요</Text>
              </View>
            </ImageBackground>

            <View style={styles.intro}>
              <View style={[styles.demoBadge, { backgroundColor: theme.infoSurface }]}>
                <Text style={[styles.demoBadgeText, { color: theme.info }]}>간편하고 안전한 로그인</Text>
              </View>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>로그인하고 계속하기</Text>
              <Text style={[styles.description, { color: theme.textSecondary }]}>카카오로 간편하게 시작하거나 휴대폰 번호로 로그인할 수 있어요.</Text>
              {intent === 'apply' ? (
                <Text style={[styles.intentDescription, { color: theme.primary }]}>로그인 후 보던 모임으로 돌아가 신청을 이어갈 수 있어요.</Text>
              ) : null}
            </View>

            {!challengeId ? (
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
            ) : null}

            {!challengeId ? (
              <>
                <Pressable
                  disabled={isSubmitting}
                  onPress={handleKakaoSignIn}
                  style={({ pressed }) => [
                    styles.kakaoButton,
                    { opacity: isSubmitting ? 0.55 : pressed ? 0.78 : 1 },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
                  accessibilityLabel="카카오로 로그인">
                  <Text style={styles.kakaoSymbol} accessibilityElementsHidden>
                    K
                  </Text>
                  <Text style={styles.kakaoButtonText}>
                    {isSubmitting ? '카카오 로그인을 확인하고 있어요…' : '카카오로 로그인'}
                  </Text>
                </Pressable>

                <View style={styles.divider} accessibilityElementsHidden>
                  <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
                  <Text style={[styles.dividerText, { color: theme.textMuted }]}>또는 휴대폰으로 로그인</Text>
                  <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
                </View>
              </>
            ) : null}

            <View style={styles.form} accessibilityLabel="휴대폰 로그인 정보">
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: theme.text }]}>이름 또는 별명</Text>
                <TextInput
                  value={displayName}
                  onChangeText={(value) => {
                    setDisplayName(value);
                    setNotice('');
                  }}
                  editable={!challengeId && !isSubmitting}
                  placeholder="예: 김현정"
                  placeholderTextColor={theme.textMuted}
                  autoComplete="name"
                  autoCapitalize="words"
                  maxLength={20}
                  returnKeyType="next"
                  style={[
                    styles.input,
                    { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
                  ]}
                  accessibilityLabel="이름 또는 별명"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: theme.text }]}>휴대폰 번호</Text>
                <TextInput
                  value={phoneNumber}
                  onChangeText={(value) => {
                    setPhoneNumber(value);
                    setNotice('');
                  }}
                  onSubmitEditing={handleRequestCode}
                  editable={!challengeId && !isSubmitting}
                  placeholder="010-1234-5678"
                  placeholderTextColor={theme.textMuted}
                  autoComplete="tel"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="phone-pad"
                  returnKeyType="done"
                  style={[
                    styles.input,
                    { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
                  ]}
                  accessibilityLabel="휴대폰 번호"
                />
              </View>

              {challengeId ? (
                <View style={styles.fieldGroup}>
                  <Text style={[styles.label, { color: theme.text }]}>휴대폰 인증번호</Text>
                  <TextInput
                    value={code}
                    onChangeText={(value) => {
                      setCode(value.replace(/\D/g, '').slice(0, 6));
                      setNotice('');
                    }}
                    onSubmitEditing={handleSignIn}
                    placeholder="숫자 6자리"
                    placeholderTextColor={theme.textMuted}
                    autoComplete="one-time-code"
                    autoCapitalize="none"
                    keyboardType="number-pad"
                    returnKeyType="done"
                    maxLength={6}
                    editable={!isSubmitting}
                    style={[
                      styles.input,
                      styles.codeInput,
                      { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
                    ]}
                    accessibilityLabel="휴대폰 인증번호 6자리"
                  />
                  <View style={styles.codeActions}>
                    <Pressable
                      disabled={isSubmitting}
                      onPress={() => {
                        setChallengeId(null);
                        setCode('');
                        setRetrySeconds(0);
                        setNotice('휴대폰을 확인한 뒤 인증번호를 다시 요청해 주세요.');
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="휴대폰 번호 수정"
                      style={styles.textAction}>
                      <Text style={[styles.textActionLabel, { color: theme.primary }]}>휴대폰 번호 수정</Text>
                    </Pressable>
                    <Text style={[styles.retryText, { color: theme.textSecondary }]}> 
                      {retrySeconds > 0 ? `${retrySeconds}초 후 재전송 가능` : '재전송할 수 있어요'}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>

            {notice || authRestoreError ? (
              <View
                style={[styles.notice, { backgroundColor: theme.warningSurface, borderColor: theme.warning }]}
                accessibilityLiveRegion="polite"
              >
                <Text style={[styles.noticeText, { color: theme.warning }]}>
                  {notice || authRestoreError}
                </Text>
              </View>
            ) : null}

            <Pressable
              disabled={isSubmitting}
              onPress={challengeId ? handleSignIn : handleRequestCode}
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: pressed ? theme.primaryPressed : theme.primary,
                  opacity: isSubmitting ? 0.55 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
              accessibilityLabel={challengeId ? '인증번호 확인하고 로그인' : '휴대폰 인증번호 받기'}
            >
              <Text style={[styles.primaryButtonText, { color: theme.inverseText }]}> 
                {isSubmitting
                  ? '처리하고 있어요…'
                  : challengeId
                    ? '인증번호 확인하고 로그인'
                    : '휴대폰 인증번호 받기'}
              </Text>
              <Text style={[styles.primaryArrow, { color: theme.inverseText }]} accessibilityElementsHidden>
                →
              </Text>
            </Pressable>

            {challengeId ? (
              <Pressable
                disabled={retrySeconds > 0 || isSubmitting}
                onPress={handleRequestCode}
                accessibilityRole="button"
                accessibilityState={{ disabled: retrySeconds > 0 || isSubmitting }}
                style={styles.resendButton}>
                <Text
                  style={[
                    styles.resendLabel,
                    { color: retrySeconds > 0 ? theme.textMuted : theme.primary },
                  ]}>
                  인증번호 다시 받기
                </Text>
              </Pressable>
            ) : null}

            <View style={[styles.productionNotice, { backgroundColor: theme.infoSurface, borderColor: theme.info }]}> 
              <Text style={[styles.productionNoticeTitle, { color: theme.info }]}>안전한 휴대폰 인증을 사용합니다</Text>
              <Text style={[styles.productionNoticeBody, { color: theme.textSecondary }]}>인증번호와 로그인 세션은 서버에서 확인하며, 이 기기에는 갱신용 로그인 정보만 안전하게 저장됩니다. 모임 신청 결과는 허용한 푸시 알림으로 받을 수 있어요.</Text>
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
  form: { gap: Spacing.lg },
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
  fieldGroup: { gap: Spacing.sm },
  label: { fontSize: 18, lineHeight: 27, fontFamily: FontWeights.strong },
  input: {
    minHeight: 62,
    borderWidth: 2,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontSize: 19,
    lineHeight: 28,
    fontFamily: FontWeights.emphasis,
  },
  codeInput: { textAlign: 'center', letterSpacing: 8, fontSize: 24, fontVariant: ['tabular-nums'] },
  codeActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  textAction: { minHeight: TouchTarget.compact, justifyContent: 'center' },
  textActionLabel: { fontSize: 16, lineHeight: 24, fontFamily: FontWeights.strong, textDecorationLine: 'underline' },
  retryText: { flex: 1, textAlign: 'right', fontSize: 15, lineHeight: 23, fontFamily: FontWeights.emphasis },
  notice: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.lg },
  noticeText: { fontSize: 17, lineHeight: 26, fontFamily: FontWeights.emphasis },
  primaryButton: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.xl,
  },
  primaryButtonText: { fontSize: 20, lineHeight: 28, fontFamily: FontWeights.strong },
  primaryArrow: { fontSize: 25, lineHeight: 29, fontFamily: FontWeights.emphasis },
  kakaoButton: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.xl,
    backgroundColor: '#FEE500',
  },
  kakaoSymbol: {
    color: '#191919',
    fontSize: 21,
    lineHeight: 28,
    fontFamily: FontWeights.strong,
  },
  kakaoButtonText: {
    color: '#191919',
    fontSize: 20,
    lineHeight: 28,
    fontFamily: FontWeights.strong,
  },
  divider: {
    minHeight: TouchTarget.compact,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 15, lineHeight: 22, fontFamily: FontWeights.emphasis },
  resendButton: { minHeight: TouchTarget.compact, alignItems: 'center', justifyContent: 'center' },
  resendLabel: { fontSize: 17, lineHeight: 25, fontFamily: FontWeights.strong, textDecorationLine: 'underline' },
  productionNotice: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.xs },
  productionNoticeTitle: { fontSize: 17, lineHeight: 25, fontFamily: FontWeights.strong },
  productionNoticeBody: { fontSize: 16, lineHeight: 25, fontFamily: FontWeights.emphasis },
  legalBlock: { alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md },
  legal: { fontSize: 15, lineHeight: 23, textAlign: 'center' },
  legalLinks: { minHeight: TouchTarget.compact, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  legalLinkPressable: { minHeight: TouchTarget.compact, justifyContent: 'center' },
  legalLink: { fontSize: 16, lineHeight: 24, fontFamily: FontWeights.strong, textDecorationLine: 'underline' },
  legalDivider: { fontSize: 18, lineHeight: 24, fontFamily: FontWeights.emphasis },
});
