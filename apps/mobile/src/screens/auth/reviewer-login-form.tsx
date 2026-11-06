import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { reviewerErrorMessage } from '@/auth/reviewer-error-message';
import { AppText } from '@/components/ui/app-text';
import { FontSizes, FontWeights, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface ReviewerLoginFormProps {
  disabled: boolean;
  termsAccepted: boolean;
  privacyAccepted: boolean;
  largeTextEnabled: boolean;
  onSignIn: (email: string, password: string) => Promise<void>;
  onNotice: (message: string) => void;
}

export function ReviewerLoginForm({
  disabled, termsAccepted, privacyAccepted, largeTextEnabled, onSignIn, onNotice,
}: ReviewerLoginFormProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionPending = useRef(false);
  const passwordInput = useRef<TextInput>(null);
  const busy = disabled || isSubmitting;
  const clearCredentials = () => { setEmail(''); setPassword(''); };

  const submit = async () => {
    if (disabled || submissionPending.current) return;
    if (!termsAccepted || !privacyAccepted) {
      onNotice('서비스 이용약관과 개인정보 처리방침에 모두 동의해 주세요.');
      return;
    }
    if (!email.trim() || !password) {
      onNotice('심사 계정 이메일과 비밀번호를 입력해 주세요.');
      return;
    }
    submissionPending.current = true;
    setIsSubmitting(true);
    onNotice('');
    try {
      await onSignIn(email.trim(), password);
    } catch (error) {
      onNotice(reviewerErrorMessage(error));
    } finally {
      clearCredentials();
      submissionPending.current = false;
      setIsSubmitting(false);
    }
  };

  const inputStyle = [styles.input, {
    color: theme.text, backgroundColor: theme.surface, borderColor: theme.border,
    fontSize: FontSizes[largeTextEnabled ? 'large' : 'standard'].body,
    opacity: busy ? 0.55 : 1,
  }];

  return (
    <View style={styles.section}>
      <Pressable
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="심사 계정으로 로그인"
        accessibilityHint="Google Play 앱 심사 계정 이메일과 비밀번호 입력란을 열거나 닫습니다."
        accessibilityState={{ expanded, disabled: busy }}
        onPress={() => {
          clearCredentials();
          setExpanded((current) => !current);
          onNotice('');
        }}
        style={({ pressed }) => [styles.entry, {
          borderColor: theme.border, opacity: busy ? 0.55 : pressed ? 0.7 : 1,
        }]}
      >
        <AppText variant="bodyStrong" selectable={false} style={{ color: theme.primary, textAlign: 'center' }}>
          심사 계정으로 로그인
        </AppText>
      </Pressable>
      {expanded ? (
        <View style={[styles.form, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <AppText variant="body" style={{ color: theme.textSecondary }}>
            Google Play 앱 심사용 계정만 이용할 수 있어요. 일반 회원은 카카오로 로그인해 주세요.
          </AppText>
          <View style={styles.field}>
            <AppText variant="bodyStrong">심사 계정 이메일</AppText>
            <TextInput
              accessibilityLabel="심사 계정 이메일"
              accessibilityState={{ disabled: busy }}
              value={email}
              onChangeText={setEmail}
              editable={!busy}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              textContentType="none"
              importantForAutofill="no"
              allowFontScaling
              returnKeyType="next"
              onSubmitEditing={() => passwordInput.current?.focus()}
              style={inputStyle}
            />
          </View>
          <View style={styles.field}>
            <AppText variant="bodyStrong">심사 계정 비밀번호</AppText>
            <TextInput
              ref={passwordInput}
              accessibilityLabel="심사 계정 비밀번호"
              accessibilityState={{ disabled: busy }}
              value={password}
              onChangeText={setPassword}
              editable={!busy}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              textContentType="none"
              importantForAutofill="no"
              allowFontScaling
              returnKeyType="done"
              onSubmitEditing={() => { void submit(); }}
              style={inputStyle}
            />
          </View>
          <Pressable
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="심사 계정 로그인 확인"
            accessibilityState={{ disabled: busy, busy: isSubmitting }}
            onPress={() => { void submit(); }}
            style={({ pressed }) => [styles.submit, {
              backgroundColor: theme.primary, opacity: busy ? 0.55 : pressed ? 0.78 : 1,
            }]}
          >
            {isSubmitting ? <ActivityIndicator color={theme.inverseText} size="small" /> : null}
            <AppText variant="button" selectable={false} style={{ color: theme.inverseText, flexShrink: 1, textAlign: 'center' }}>
              {isSubmitting ? '심사 계정 로그인을 확인하고 있어요…' : '심사 계정 로그인 확인'}
            </AppText>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.sm, width: '100%' },
  entry: { minHeight: TouchTarget.minimum, padding: Spacing.md, borderWidth: 1, borderRadius: Radius.lg },
  form: { gap: Spacing.md, padding: Spacing.lg, borderWidth: 1, borderRadius: Radius.lg },
  field: { gap: Spacing.xs },
  input: {
    width: '100%', minHeight: TouchTarget.minimum, paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md, borderWidth: 1, borderRadius: Radius.md, fontFamily: FontWeights.body,
  },
  submit: {
    minHeight: TouchTarget.minimum, padding: Spacing.md, borderRadius: Radius.md,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
  },
});
