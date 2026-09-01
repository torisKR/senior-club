import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { apiErrorMessage } from '@/api/error-message';
import { Layout, Radius, Spacing, TouchTarget, FontWeights } from '@/constants/theme';
import { useAppState } from '@/hooks/use-app-state';
import { useTheme } from '@/hooks/use-theme';
import {
  buildLoginHref,
  buildPostAuthHref,
  sanitizeAuthIntent,
  sanitizeReturnTo,
} from '@/utils/auth-routing';

const STEPS = [
  { title: '어떻게 불러드릴까요?', description: '모임에서 사용할 이름을 알려 주세요.' },
  { title: '주로 활동할 지역은 어디인가요?', description: '가까운 모임을 먼저 추천해 드릴게요.' },
  { title: '출생연도를 알려 주세요', description: '가까운 연령대의 활동을 추천하는 데 사용해요.' },
  { title: '관심사를 골라 주세요', description: '좋아하는 주제를 1개에서 3개까지 선택해 주세요.' },
] as const;

const REGIONS = ['서울', '경기', '인천', '부산', '대구', '대전', '광주', '기타 지역'] as const;
const MINIMUM_BIRTH_YEAR = 1900;
const LATEST_ADULT_BIRTH_YEAR = new Date().getUTCFullYear() - 18;

export function OnboardingScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{
    intent?: string | string[];
    returnTo?: string | string[];
  }>();
  const returnTo = sanitizeReturnTo(params.returnTo);
  const intent = sanitizeAuthIntent(params.intent);
  const {
    profile,
    interests,
    interestsLoading,
    interestsError,
    selectedInterestIds,
    signOut,
    toggleInterest: updateInterestSelection,
    replaceInterests,
    reloadInterests,
    completeOnboarding,
  } = useAppState();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(profile.name);
  const [region, setRegion] = useState(() => REGIONS.find((candidate) => profile.region.startsWith(candidate)) ?? '');
  const [birthYear, setBirthYear] = useState(() => profile.birthYear?.toString() ?? '');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitInFlight = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const currentStep = STEPS[step];
  const progressPercent = useMemo(() => `${((step + 1) / STEPS.length) * 100}%` as `${number}%`, [step]);

  useEffect(() => {
    if (interestsLoading || interestsError) return;
    const catalogIds = new Set(interests.map((interest) => interest.id));
    const validSelection = selectedInterestIds.filter((interestId) => catalogIds.has(interestId));
    if (
      validSelection.length !== selectedInterestIds.length ||
      validSelection.some((interestId, index) => interestId !== selectedInterestIds[index])
    ) {
      replaceInterests(validSelection);
    }
  }, [interests, interestsError, interestsLoading, replaceInterests, selectedInterestIds]);

  const moveToStep = (nextStep: number) => {
    setError('');
    setStep(nextStep);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const validateStep = () => {
    if (step === 0) {
      const cleanName = name.trim();
      if (cleanName.length < 2) {
        setError('이름을 두 글자 이상 입력해 주세요.');
        return false;
      }
      if (cleanName.length > 20) {
        setError('이름은 스무 글자 이내로 입력해 주세요.');
        return false;
      }
    }

    if (step === 1 && !region) {
      setError('활동할 지역을 하나 선택해 주세요.');
      return false;
    }

    if (step === 2) {
      if (!/^\d{4}$/.test(birthYear)) {
        setError('출생연도를 숫자 네 자리로 입력해 주세요.');
        return false;
      }
      const parsedBirthYear = Number(birthYear);
      if (
        parsedBirthYear < MINIMUM_BIRTH_YEAR ||
        parsedBirthYear > LATEST_ADULT_BIRTH_YEAR
      ) {
        setError(
          `${MINIMUM_BIRTH_YEAR}년부터 ${LATEST_ADULT_BIRTH_YEAR}년 사이로 입력해 주세요.`,
        );
        return false;
      }
    }

    if (step === 3) {
      if (interestsLoading) {
        setError('관심사 목록을 불러오는 중입니다. 잠시만 기다려 주세요.');
        return false;
      }
      if (interests.length === 0) {
        setError('관심사 목록을 다시 불러온 뒤 선택해 주세요.');
        return false;
      }
      if (selectedInterestIds.length === 0) {
        setError('관심사를 한 개 이상 선택해 주세요.');
        return false;
      }

      if (selectedInterestIds.length > 3) {
        setError('관심사는 최대 세 개까지 선택해 주세요.');
        return false;
      }
    }

    return true;
  };

  const goNext = async () => {
    if (submitInFlight.current) return;
    if (!validateStep()) {
      return;
    }

    if (step < STEPS.length - 1) {
      moveToStep(step + 1);
      return;
    }

    submitInFlight.current = true;
    setIsSubmitting(true);
    setError('');
    try {
      await completeOnboarding({
        name: name.trim(),
        region,
        birthYear: Number(birthYear),
        interestSlugs: [...selectedInterestIds],
      });
      router.replace(buildPostAuthHref(returnTo, intent));
    } catch (submissionError) {
      setError(apiErrorMessage(submissionError, '프로필을 저장하지 못했습니다. 다시 시도해 주세요.'));
    } finally {
      submitInFlight.current = false;
      setIsSubmitting(false);
    }
  };

  const goBack = () => {
    if (submitInFlight.current) return;
    if (step > 0) {
      moveToStep(step - 1);
      return;
    }

    void signOut();
    router.replace(buildLoginHref(returnTo, intent));
  };

  const handleToggleInterest = (interestId: string) => {
    if (submitInFlight.current) return;
    setError('');
    if (!selectedInterestIds.includes(interestId) && selectedInterestIds.length >= 3) {
      setError('관심사는 최대 세 개까지 선택할 수 있어요. 선택을 바꾸려면 하나를 먼저 해제해 주세요.');
      return;
    }

    updateInterestSelection(interestId);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.shell}>
          <View style={styles.topBar}>
            <Pressable
              onPress={goBack}
              hitSlop={8}
              style={({ pressed }) => [
                styles.backButton,
                { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.68 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={step === 0 ? '로그인 화면으로 돌아가기' : '이전 단계로 돌아가기'}
            >
              <Text style={[styles.backArrow, { color: theme.text }]} accessibilityElementsHidden>
                ←
              </Text>
            </Pressable>
            <View
              style={styles.progressCopy}
              accessibilityRole="progressbar"
              accessibilityLabel="가입 정보 입력 진행률"
              accessibilityValue={{ min: 1, max: STEPS.length, now: step + 1, text: `${STEPS.length}단계 중 ${step + 1}단계` }}
            >
              <Text style={[styles.progressText, { color: theme.textSecondary }]}>{STEPS.length}단계 중 {step + 1}단계</Text>
            </View>
            <View style={styles.backButtonPlaceholder} />
          </View>

          <View style={[styles.progressTrack, { backgroundColor: theme.backgroundElement }]}>
            <View style={[styles.progressFill, { width: progressPercent, backgroundColor: theme.primary }]} />
          </View>

          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scrollContent}
            contentInsetAdjustmentBehavior="automatic"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.content}>
              <View style={styles.heading} accessibilityRole="header">
                <Text style={[styles.eyebrow, { color: theme.accent }]}>나에게 맞는 클럽 찾기</Text>
                <Text style={[styles.title, { color: theme.text }]}>{currentStep.title}</Text>
                <Text style={[styles.description, { color: theme.textSecondary }]}>{currentStep.description}</Text>
              </View>

              {step === 0 ? (
                <View style={styles.fieldGroup}>
                  <Text style={[styles.label, { color: theme.text }]}>이름 또는 별명</Text>
                  <TextInput
                    value={name}
                    onChangeText={(value) => {
                      setName(value);
                      if (error) setError('');
                    }}
                    onSubmitEditing={() => void goNext()}
                    placeholder="예: 김현정"
                    placeholderTextColor={theme.textMuted}
                    autoComplete="name"
                    autoCapitalize="words"
                    returnKeyType="next"
                    maxLength={20}
                    style={[
                      styles.input,
                      {
                        backgroundColor: theme.surface,
                        borderColor: error ? theme.danger : theme.border,
                        color: theme.text,
                      },
                    ]}
                    accessibilityLabel="모임에서 사용할 이름 또는 별명"
                    accessibilityHint="두 글자 이상 입력해 주세요"
                  />
                  <Text style={[styles.helper, { color: theme.textMuted }]}>실명 대신 편하게 불릴 별명을 적어도 좋아요.</Text>
                </View>
              ) : null}

              {step === 1 ? (
                <OptionGrid
                  options={REGIONS}
                  selected={region}
                  onSelect={(value) => {
                    setRegion(value);
                    setError('');
                  }}
                  theme={theme}
                  accessibilityLabel="활동 지역"
                />
              ) : null}

              {step === 2 ? (
                <View style={styles.fieldGroup}>
                  <Text style={[styles.label, { color: theme.text }]}>출생연도</Text>
                  <TextInput
                    value={birthYear}
                    onChangeText={(value) => {
                      setBirthYear(value.replace(/\D/g, '').slice(0, 4));
                      if (error) setError('');
                    }}
                    onSubmitEditing={() => void goNext()}
                    placeholder="예: 1962"
                    placeholderTextColor={theme.textMuted}
                    inputMode="numeric"
                    keyboardType="number-pad"
                    returnKeyType="next"
                    maxLength={4}
                    style={[
                      styles.input,
                      {
                        backgroundColor: theme.surface,
                        borderColor: error ? theme.danger : theme.border,
                        color: theme.text,
                      },
                    ]}
                    accessibilityLabel="출생연도 네 자리"
                    accessibilityHint={`${MINIMUM_BIRTH_YEAR}년부터 ${LATEST_ADULT_BIRTH_YEAR}년 사이로 입력해 주세요`}
                  />
                  <Text style={[styles.helper, { color: theme.textMuted }]}>숫자 네 자리로 정확히 입력해 주세요.</Text>
                </View>
              ) : null}

              {step === 3 ? (
                <View style={styles.interestSection}>
                  <View style={[styles.selectionCount, { backgroundColor: theme.infoSurface }]}>
                    <Text style={[styles.selectionCountText, { color: theme.info }]}>선택 {selectedInterestIds.length}/3</Text>
                  </View>
                  {interestsLoading ? (
                    <View
                      style={[styles.catalogStatus, { backgroundColor: theme.surface, borderColor: theme.border }]}
                      accessibilityRole="progressbar"
                      accessibilityLabel="관심사 목록을 불러오는 중"
                    >
                      <ActivityIndicator color={theme.primary} size="large" />
                      <Text style={[styles.catalogStatusText, { color: theme.textSecondary }]}>관심사 목록을 불러오고 있어요</Text>
                    </View>
                  ) : null}

                  {!interestsLoading && (interestsError || interests.length === 0) ? (
                    <View
                      style={[styles.catalogStatus, { backgroundColor: theme.dangerSurface, borderColor: theme.danger }]}
                      accessibilityLiveRegion="polite"
                    >
                      <Text style={[styles.catalogStatusText, { color: theme.danger }]}>
                        {interestsError ?? '현재 선택할 수 있는 관심사가 없습니다.'}
                      </Text>
                      <Pressable
                        onPress={() => void reloadInterests()}
                        style={({ pressed }) => [
                          styles.retryButton,
                          { backgroundColor: theme.surface, borderColor: theme.danger, opacity: pressed ? 0.7 : 1 },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="관심사 목록 다시 불러오기"
                      >
                        <Text style={[styles.retryButtonText, { color: theme.danger }]}>다시 불러오기</Text>
                      </Pressable>
                    </View>
                  ) : null}

                  {!interestsLoading && interests.length > 0 ? (
                    <View style={styles.interestGrid} accessibilityLabel="관심사 목록">
                      {interests.map((interest) => {
                        const selected = selectedInterestIds.includes(interest.id);
                        return (
                          <Pressable
                            key={interest.id}
                            disabled={isSubmitting}
                            onPress={() => handleToggleInterest(interest.id)}
                            style={({ pressed }) => [
                              styles.interestCard,
                              {
                                backgroundColor: selected ? theme.backgroundSelected : theme.surface,
                                borderColor: selected ? theme.primary : theme.border,
                                opacity: pressed ? 0.72 : isSubmitting ? 0.55 : 1,
                              },
                            ]}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: selected, disabled: isSubmitting }}
                            accessibilityLabel={`${interest.name}, ${interest.description}`}
                            accessibilityHint={selected ? '누르면 선택을 해제합니다' : '누르면 관심사로 선택합니다'}
                          >
                            <Text style={styles.interestEmoji} accessibilityElementsHidden>
                              {interest.emoji}
                            </Text>
                            <View style={styles.interestCopy}>
                              <Text style={[styles.interestName, { color: theme.text }]}>{interest.name}</Text>
                              <Text numberOfLines={2} style={[styles.interestDescription, { color: theme.textSecondary }]}>
                                {interest.description}
                              </Text>
                            </View>
                            <View
                              style={[
                                styles.check,
                                { backgroundColor: selected ? theme.primary : 'transparent', borderColor: selected ? theme.primary : theme.border },
                              ]}
                              accessibilityElementsHidden
                            >
                              {selected ? <Text style={styles.checkText}>✓</Text> : null}
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              ) : null}

              {error ? (
                <View
                  style={[styles.errorBox, { backgroundColor: theme.dangerSurface, borderColor: theme.danger }]}
                  accessibilityLiveRegion="assertive"
                >
                  <Text style={[styles.errorText, { color: theme.danger }]}>확인해 주세요. {error}</Text>
                </View>
              ) : null}
            </View>
          </ScrollView>

          <View style={[styles.footer, { backgroundColor: theme.background, borderTopColor: theme.divider }]}>
            <Pressable
              disabled={isSubmitting}
              onPress={() => void goNext()}
              style={({ pressed }) => [
                styles.nextButton,
                {
                  backgroundColor: pressed ? theme.primaryPressed : theme.primary,
                  opacity: isSubmitting ? 0.58 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={step === STEPS.length - 1 ? '설정을 마치고 홈으로 이동' : '다음 단계'}
              accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
            >
              {isSubmitting ? <ActivityIndicator color={theme.inverseText} size="small" /> : null}
              <Text style={[styles.nextButtonText, { color: theme.inverseText }]}>{isSubmitting ? '저장 중...' : step === STEPS.length - 1 ? '설정 마치기' : '다음'}</Text>
              <Text style={[styles.nextArrow, { color: theme.inverseText }]} accessibilityElementsHidden>
                {isSubmitting ? '' : step === STEPS.length - 1 ? '✓' : '→'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type Theme = ReturnType<typeof useTheme>;

function OptionGrid({
  options,
  selected,
  onSelect,
  theme,
  accessibilityLabel,
}: {
  options: readonly string[];
  selected: string;
  onSelect: (value: string) => void;
  theme: Theme;
  accessibilityLabel: string;
}) {
  return (
    <View style={styles.optionGrid} accessibilityLabel={`${accessibilityLabel} 선택 목록`}>
      {options.map((option) => {
        const isSelected = option === selected;
        return (
          <Pressable
            key={option}
            onPress={() => onSelect(option)}
            style={({ pressed }) => [
              styles.optionCard,
              {
                backgroundColor: isSelected ? theme.backgroundSelected : theme.surface,
                borderColor: isSelected ? theme.primary : theme.border,
                opacity: pressed ? 0.72 : 1,
              },
            ]}
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected }}
            accessibilityLabel={`${accessibilityLabel} ${option}`}
            accessibilityHint="두 번 탭하여 선택합니다"
          >
            <Text style={[styles.optionText, { color: theme.text }]}>{option}</Text>
            <View
              style={[
                styles.radio,
                { borderColor: isSelected ? theme.primary : theme.border },
              ]}
              accessibilityElementsHidden
            >
              {isSelected ? <View style={[styles.radioDot, { backgroundColor: theme.primary }]} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  safeArea: { flex: 1 },
  shell: { flex: 1, width: '100%', maxWidth: Layout.maxContentWidth, alignSelf: 'center' },
  topBar: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Layout.screenPadding,
  },
  backButton: {
    width: TouchTarget.minimum,
    height: TouchTarget.minimum,
    borderRadius: Radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonPlaceholder: { width: TouchTarget.minimum, height: TouchTarget.minimum },
  backArrow: { fontSize: 27, lineHeight: 31, fontFamily: FontWeights.emphasis },
  progressCopy: { minHeight: TouchTarget.compact, justifyContent: 'center', paddingHorizontal: Spacing.sm },
  progressText: { fontSize: 17, lineHeight: 25, fontFamily: FontWeights.emphasis },
  progressTrack: { height: 8, marginHorizontal: Layout.screenPadding, borderRadius: Radius.pill, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: Radius.pill },
  scrollContent: { flexGrow: 1, paddingBottom: Spacing.xl },
  content: { paddingHorizontal: Layout.screenPadding, paddingTop: Spacing.xxl, gap: Spacing.xxl },
  heading: { gap: Spacing.sm },
  eyebrow: { fontSize: 16, lineHeight: 24, fontFamily: FontWeights.strong },
  title: { fontSize: 30, lineHeight: 40, fontFamily: FontWeights.strong, letterSpacing: -0.7 },
  description: { fontSize: 18, lineHeight: 28, fontFamily: FontWeights.emphasis },
  fieldGroup: { gap: Spacing.sm },
  label: { fontSize: 18, lineHeight: 28, fontFamily: FontWeights.strong },
  input: {
    minHeight: 64,
    borderWidth: 2,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontSize: 20,
    lineHeight: 28,
    fontFamily: FontWeights.emphasis,
  },
  helper: { fontSize: 16, lineHeight: 24, fontFamily: FontWeights.emphasis },
  optionGrid: { gap: Spacing.md },
  optionCard: {
    minHeight: 68,
    borderWidth: 2,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  optionText: { flex: 1, fontSize: 20, lineHeight: 28, fontFamily: FontWeights.emphasis },
  radio: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 14, height: 14, borderRadius: 7 },
  interestSection: { gap: Spacing.lg },
  selectionCount: {
    alignSelf: 'flex-start',
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.pill,
  },
  selectionCountText: { fontSize: 17, lineHeight: 25, fontFamily: FontWeights.strong },
  catalogStatus: {
    minHeight: 128,
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  catalogStatusText: { fontSize: 17, lineHeight: 26, fontFamily: FontWeights.emphasis, textAlign: 'center' },
  retryButton: {
    minHeight: TouchTarget.minimum,
    borderWidth: 1.5,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButtonText: { fontSize: 17, lineHeight: 25, fontFamily: FontWeights.strong },
  interestGrid: { gap: Spacing.md },
  interestCard: {
    minHeight: 92,
    borderWidth: 2,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  interestEmoji: { fontSize: 32, lineHeight: 39 },
  interestCopy: { flex: 1, gap: 2 },
  interestName: { fontSize: 20, lineHeight: 28, fontFamily: FontWeights.strong },
  interestDescription: { fontSize: 16, lineHeight: 23, fontFamily: FontWeights.emphasis },
  check: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: { color: '#FFFFFF', fontSize: 19, lineHeight: 23, fontFamily: FontWeights.strong },
  errorBox: { borderWidth: 1.5, borderRadius: Radius.md, padding: Spacing.lg },
  errorText: { fontSize: 17, lineHeight: 26, fontFamily: FontWeights.emphasis },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: Layout.screenPadding, paddingTop: Spacing.md, paddingBottom: Spacing.lg },
  nextButton: {
    minHeight: 62,
    borderRadius: Radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  nextButtonText: { fontSize: 20, lineHeight: 28, fontFamily: FontWeights.strong },
  nextArrow: { fontSize: 25, lineHeight: 29, fontFamily: FontWeights.strong },
});
