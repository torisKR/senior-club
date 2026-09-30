import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';

import type { ProfileStateSnapshot } from '@/api/profile-api-core';
import { AppText, Card, SeniorButton } from '@/components/ui';
import { FontWeights, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createNativePhoneAuthDriver } from '@/phone-verification/native-phone-auth';
import { hasVerifiedPhone } from '@/phone-verification/phone-number';
import { verifyNativePhoneToken } from '@/phone-verification/phone-verification-api';
import { PhoneVerificationController } from '@/phone-verification/phone-verification-controller';

interface Props {
  userId?: string;
  phoneNumber?: string | null;
  phoneVerifiedAt?: string | null;
  onVerified(snapshot: ProfileStateSnapshot): void;
  onSavingChange?(saving: boolean): void;
}

export function PhoneVerificationCard(props: Props) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [phone, setPhone] = useState(props.phoneNumber ?? '');
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [controller] = useState(() => new PhoneVerificationController({
    createDriver: createNativePhoneAuthDriver,
    submitProof: (idToken, phoneNumber, signal) => verifyNativePhoneToken(
      idToken, phoneNumber, props.userId ?? '', signal,
    ),
    onVerified: (snapshot) => {
      if (snapshot.user.id === props.userId) props.onVerified(snapshot);
    },
  }));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const secondsUntilResend = Math.max(0, Math.ceil((state.resendAt - now) / 1000));
  const busy = ['sending', 'verifying', 'saving'].includes(state.stage);
  const hasChallenge = ['code', 'verifying', 'saving'].includes(state.stage);
  const verified = hasVerifiedPhone(props);

  const { onSavingChange } = props;
  useEffect(() => {
    onSavingChange?.(state.stage === 'saving');
    return () => onSavingChange?.(false);
  }, [state.stage, onSavingChange]);

  useEffect(() => {
    if (!state.resendAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state.resendAt]);

  const cancel = useCallback(() => {
    void controller.cancel();
    setExpanded(false);
    setConsent(false);
    setCode('');
  }, [controller]);

  useFocusEffect(useCallback(() => cancel, [cancel]));

  const inputStyle = {
    minHeight: TouchTarget.minimum,
    borderWidth: 2,
    borderColor: theme.border,
    borderRadius: Radius.md,
    backgroundColor: theme.surface,
    color: theme.text,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontSize: 18,
    fontFamily: FontWeights.emphasis,
  };

  return (
    <Card style={{ gap: Spacing.lg }}>
      <AppText variant="sectionTitle">휴대폰 인증 (선택)</AppText>
      <View style={{ gap: Spacing.sm }}>
        <AppText variant="bodyStrong" color={verified ? 'success' : 'textSecondary'}>
          {verified ? '✓ 휴대폰 인증 완료' : '휴대폰 미인증'}
        </AppText>
        <AppText color="textSecondary">
          연락처는 인증 없이 저장하거나 바꿀 수 있어요. 인증을 건너뛰어도 카카오 로그인과 모임 이용이 가능합니다.
        </AppText>
        {verified ? (
          <AppText color="textSecondary">인증한 번호: {props.phoneNumber}</AppText>
        ) : null}
      </View>

      {Platform.OS === 'web' ? (
        <AppText color="textSecondary">문자 인증은 Android 또는 iPhone 앱에서 이용해 주세요.</AppText>
      ) : !expanded ? (
        <SeniorButton
          label={state.cleaningUp ? '인증 정리 중…' : verified ? '다른 번호 인증하기' : '휴대폰 인증하기'}
          variant="outline"
          disabled={!props.userId || state.cleaningUp}
          onPress={() => {
            setPhone(props.phoneNumber ?? '');
            setConsent(false);
            setCode('');
            setNow(Date.now());
            setExpanded(true);
          }}
        />
      ) : (
        <View style={{ gap: Spacing.lg }}>
          <View style={{ gap: Spacing.sm }}>
            <AppText variant="bodyStrong">인증할 휴대폰 번호</AppText>
            <TextInput
              accessibilityLabel="인증할 휴대폰 번호"
              value={state.stage === 'idle' ? phone : state.phoneNumber || phone}
              onChangeText={setPhone}
              editable={state.stage === 'idle' && !state.cleaningUp}
              placeholder="010-1234-5678"
              placeholderTextColor={theme.textMuted}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              maxLength={24}
              style={inputStyle}
            />
            <AppText variant="caption" color="textSecondary">
              다른 번호를 인증하면 내 연락처도 그 번호로 바뀝니다.
            </AppText>
          </View>

          {state.stage === 'idle' ? (
            <View style={{ gap: Spacing.sm }}>
              <AppText color="textSecondary">
                인증을 요청하면 입력한 번호와 앱 확인 정보가 Google Firebase로 전달되어 인증 문자를 발송합니다.
                Google은 전화번호를 스팸·악용 방지 목적으로 처리하고 보관할 수 있습니다.
                인증 결과와 번호는 내 계정에 저장됩니다. 동의하지 않아도 서비스를 이용할 수 있습니다.
              </AppText>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel="선택형 휴대폰 인증을 위한 전화번호 처리와 문자 발송에 동의"
                accessibilityState={{ checked: consent, disabled: state.cleaningUp }}
                disabled={state.cleaningUp}
                onPress={() => setConsent((value) => !value)}
                style={({ pressed }) => ({
                  minHeight: TouchTarget.minimum,
                  padding: Spacing.lg,
                  borderRadius: Radius.md,
                  borderWidth: 2,
                  borderColor: consent ? theme.primary : theme.border,
                  backgroundColor: pressed || consent ? theme.backgroundSelected : theme.surface,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: Spacing.md,
                })}>
                <AppText variant="bodyStrong" color="primary" selectable={false}>{consent ? '☑' : '□'}</AppText>
                <AppText variant="bodyStrong" style={{ flex: 1 }} selectable={false}>
                  [선택] 휴대폰 인증 안내를 읽고 동의합니다
                </AppText>
              </Pressable>
              <SeniorButton
                label="인증 문자 받기"
                disabled={!consent || !phone.trim() || state.cleaningUp || !props.userId}
                onPress={() => { setCode(''); setNow(Date.now()); void controller.send(phone, consent); }}
              />
            </View>
          ) : null}

          {hasChallenge ? (
            <View style={{ gap: Spacing.sm }}>
              <AppText accessibilityLiveRegion="polite" color="textSecondary">
                {state.stage === 'saving'
                  ? '인증 결과를 내 계정에 저장하고 있어요.'
                  : '문자로 받은 6자리 인증번호를 입력해 주세요. 자동 확인이 가능한 경우 입력 없이 완료됩니다.'}
              </AppText>
              <AppText variant="bodyStrong">6자리 인증번호</AppText>
              <TextInput
                accessibilityLabel="문자로 받은 6자리 인증번호"
                value={code}
                onChangeText={(value) => { setCode(value.replace(/\D/g, '').slice(0, 6)); controller.clearCodeError(); }}
                editable={state.stage === 'code' && state.canConfirm}
                placeholder="123456"
                placeholderTextColor={theme.textMuted}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                maxLength={6}
                style={{ ...inputStyle, borderColor: state.codeError ? theme.danger : theme.border }}
              />
              <SeniorButton
                label={state.stage === 'saving' ? '인증 결과 저장 중…' : '인증번호 확인'}
                loading={state.stage === 'verifying' || state.stage === 'saving'}
                disabled={!state.canConfirm || code.length !== 6}
                onPress={() => void controller.confirm(code)}
              />
              <SeniorButton
                label={secondsUntilResend ? `인증 문자 다시 받기 (${secondsUntilResend}초 후)` : '인증 문자 다시 받기'}
                variant="outline"
                disabled={busy || secondsUntilResend > 0}
                onPress={() => { setCode(''); setNow(Date.now()); void controller.resend(); }}
              />
            </View>
          ) : null}

          {state.stage === 'sending' ? (
            <SeniorButton label="인증 문자 요청 중…" loading accessibilityLiveRegion="polite" />
          ) : null}

          {state.stage === 'link-error' ? (
            <SeniorButton label="인증 결과 저장 다시 시도" onPress={() => void controller.retryLink()} />
          ) : null}

          {state.error ? (
            <AppText variant="bodyStrong" color="danger" accessibilityRole="alert" accessibilityLiveRegion="assertive">
              {state.error}
            </AppText>
          ) : null}

          {state.stage === 'success' ? (
            <AppText color="success" variant="bodyStrong" accessibilityLiveRegion="polite">
              휴대폰 인증이 완료되고 내 연락처에 반영되었어요.
            </AppText>
          ) : null}
          <SeniorButton
            label={state.stage === 'success' ? '닫기' : '인증 취소'}
            variant="ghost"
            disabled={state.stage === 'saving'}
            onPress={cancel}
          />
        </View>
      )}
    </Card>
  );
}
