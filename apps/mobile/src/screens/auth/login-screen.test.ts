// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PressableProps, TextInputProps } from 'react-native';

import type { AuthSession } from '@/types';
import { LoginScreen } from './login-screen';

const mocks = vi.hoisted(() => ({
  platform: { OS: 'android', select: (options: { default: unknown }) => options.default },
  session: null as AuthSession | null,
  inputs: {} as Record<string, TextInputProps>,
  kakao: vi.fn(), reviewer: vi.fn(), replace: vi.fn(),
}));
function box({ children }: { children?: ReactNode }) { return createElement('div', null, children); }
// RN platform typings differ on hover; a structural fixture supports both.
const pressableState = { pressed: false, hovered: false };

vi.mock('react-native', () => ({
  Platform: mocks.platform, StyleSheet: { create: (styles: unknown) => styles },
  Linking: { openURL: vi.fn() }, ActivityIndicator: () => createElement('span', null, 'loading'),
  View: box, ScrollView: box, KeyboardAvoidingView: box,
  Pressable: (props: PressableProps) => createElement('button', {
    disabled: props.disabled, 'aria-label': props.accessibilityLabel,
    'aria-checked': props.accessibilityState?.checked,
    onClick: () => props.onPress?.({} as Parameters<NonNullable<PressableProps['onPress']>>[0]),
  }, typeof props.children === 'function' ? props.children(pressableState) : props.children),
  TextInput: (props: TextInputProps) => {
    mocks.inputs[props.accessibilityLabel!] = props;
    return createElement('input', {
      'aria-label': props.accessibilityLabel, value: props.value, readOnly: true,
      disabled: props.editable === false, type: props.secureTextEntry ? 'password' : 'text',
    });
  },
}));
vi.mock('expo-image', () => ({ Image: () => createElement('span', null, 'logo') }));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: box }));
vi.mock('expo-router', () => ({
  router: { replace: mocks.replace },
  useLocalSearchParams: () => ({ returnTo: '/event/event-123', intent: 'apply' }),
}));
vi.mock('@/hooks/use-app-state', () => ({ useAppState: () => ({
  authRestoreError: null, largeTextEnabled: false, onboardingCompleted: false,
  profile: { id: 'anonymous' }, session: mocks.session,
  signInWithKakao: mocks.kakao, signInWithReviewer: mocks.reviewer,
}) }));
vi.mock('@/hooks/use-theme', () => ({ useTheme: () => ({
  background: '#fff', text: '#111', textSecondary: '#333', textMuted: '#555', surface: '#fff',
  backgroundElement: '#eee', backgroundSelected: '#ded', border: '#aaa', primary: '#153',
  inverseText: '#fff', warning: '#640', warningSurface: '#fec',
}) }));
vi.mock('@/components/ui/app-text', () => ({ AppText: ({ children }: { children?: ReactNode }) => createElement('span', null, children) }));
vi.mock('@/components/ui/app-icon', () => ({ AppIcon: () => createElement('span') }));
vi.mock('@/components/ui/cover-image', () => ({ CoverImage: () => createElement('span'), CoverImageRatios: { hero: 2 } }));
vi.mock('@/data/image-assets', () => ({ selectCoverImage: () => ({}) }));
vi.mock('@/analytics/consent-card', () => ({ AnalyticsSettingsEntry: () => null }));

let root: Root;
let container: HTMLDivElement;
const KAKAO = '카카오로 간편 로그인';
const ENTRY = '심사 계정으로 로그인';
const SUBMIT = '심사 계정 로그인 확인';
const TERMS = '서비스 이용약관에 동의합니다 (필수)';
const PRIVACY = '개인정보 처리방침에 동의합니다 (필수)';

function session(onboarded = true): AuthSession {
  return {
    userId: 'fixture-member', email: '', displayName: '회원', role: 'member', sessionId: 'fixture-session',
    accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString(),
    refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    onboardingCompletedAt: onboarded ? '2026-10-01T00:00:00Z' : null, signedInAt: new Date().toISOString(),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const render = async () => { await act(async () => root.render(createElement(LoginScreen))); };
const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const click = async (label: string) => { await act(async () => button(label).click()); };
async function enterReviewer() {
  await click(ENTRY);
  await act(async () => {
    mocks.inputs['심사 계정 이메일'].onChangeText?.('fixture@example.test');
    mocks.inputs['심사 계정 비밀번호'].onChangeText?.('fixture-password');
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('require', () => 1); // Native image assets are resolved by Metro in the app.
  mocks.platform.OS = 'android';
  mocks.session = null;
  mocks.inputs = {};
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('Kakao-first screen with Android reviewer login', () => {
  it.each(['ios', 'web'])('shows Kakao only on %s', async (platform) => {
    mocks.platform.OS = platform;
    await render();
    expect(button(KAKAO)).toBeTruthy();
    expect(button(ENTRY)).toBeNull();
  });

  it('places the explicit reviewer entry below Kakao and applies the same required consents', async () => {
    await render();
    const buttons = [...container.querySelectorAll('button')];
    expect(buttons.indexOf(button(ENTRY))).toBeGreaterThan(buttons.indexOf(button(KAKAO)));
    await enterReviewer();
    await click(SUBMIT);
    await click(KAKAO);
    expect(mocks.reviewer).not.toHaveBeenCalled();
    expect(mocks.kakao).not.toHaveBeenCalled();
    expect(container.textContent).toContain('모두 동의해 주세요');
  });

  it.each(['kakao', 'reviewer'] as const)('reuses navigation ownership and routes once after %s login', async (provider) => {
    const login = deferred<AuthSession>();
    mocks[provider].mockImplementation(() => login.promise);
    await render();
    await click(TERMS);
    await click(PRIVACY);
    if (provider === 'reviewer') await enterReviewer();
    await click(provider === 'reviewer' ? SUBMIT : KAKAO);
    expect(button(KAKAO).disabled).toBe(true);
    expect(button(ENTRY).disabled).toBe(true);
    expect(button(TERMS).disabled).toBe(true);
    expect(button(PRIVACY).disabled).toBe(true);
    // The session subscription can publish before the awaited login resolves.
    mocks.session = session();
    await render();
    expect(mocks.replace).not.toHaveBeenCalled();
    await act(async () => { login.resolve(mocks.session!); });
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/event/event-123?intent=apply');
    const consent = { termsAccepted: true, privacyAccepted: true };
    if (provider === 'reviewer') expect(mocks.reviewer).toHaveBeenCalledExactlyOnceWith('fixture@example.test', 'fixture-password', consent);
    else expect(mocks.kakao).toHaveBeenCalledExactlyOnceWith(consent);
  });

  it('sends a reviewer who needs a profile through existing onboarding', async () => {
    mocks.reviewer.mockResolvedValueOnce(session(false));
    await render();
    await click(TERMS);
    await click(PRIVACY);
    await enterReviewer();
    await click(SUBMIT);
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith({
      pathname: '/onboarding', params: { returnTo: '/event/event-123', intent: 'apply' },
    });
  });

  it('keeps failed reviewer authentication on the login screen and clears credentials safely', async () => {
    mocks.reviewer.mockRejectedValueOnce({ code: 'AUTH_SESSION_CHANGED', message: 'private-fixture-token' });
    await render();
    await click(TERMS);
    await click(PRIVACY);
    await enterReviewer();
    await click(SUBMIT);
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(container.textContent).toContain('로그인 상태가 바뀌었습니다');
    expect(container.textContent).not.toContain('private-fixture-token');
    expect(mocks.inputs['심사 계정 이메일'].value).toBe('');
    expect(mocks.inputs['심사 계정 비밀번호'].value).toBe('');
    expect(button(KAKAO).disabled).toBe(false);
  });
});
