// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PressableProps, TextInputProps } from 'react-native';

import { ReviewerLoginForm } from './reviewer-login-form';

const rendered = vi.hoisted(() => ({
  inputs: {} as Record<string, TextInputProps>,
  pressables: {} as Record<string, PressableProps>,
}));
// RN platform typings differ on hover; a structural fixture supports both.
const pressableState = { pressed: false, hovered: false };

vi.mock('react-native', () => ({
  Platform: { select: (options: { default: unknown }) => options.default },
  StyleSheet: { create: (styles: unknown) => styles },
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  ActivityIndicator: () => createElement('span', null, 'loading'),
  Pressable: (props: PressableProps) => {
    rendered.pressables[props.accessibilityLabel!] = props;
    return createElement('button', {
      disabled: props.disabled, 'aria-label': props.accessibilityLabel,
      'aria-expanded': props.accessibilityState?.expanded,
      'aria-busy': props.accessibilityState?.busy,
      onClick: () => props.onPress?.({} as Parameters<NonNullable<PressableProps['onPress']>>[0]),
    }, typeof props.children === 'function' ? props.children(pressableState) : props.children);
  },
  TextInput: (props: TextInputProps) => {
    rendered.inputs[props.accessibilityLabel!] = props;
    return createElement('input', {
      'aria-label': props.accessibilityLabel, value: props.value, readOnly: true,
      disabled: props.editable === false, type: props.secureTextEntry ? 'password' : 'text',
    });
  },
}));
vi.mock('@/components/ui/app-text', () => ({
  AppText: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));
vi.mock('@/hooks/use-theme', () => ({ useTheme: () => ({
  text: '#111', textSecondary: '#333', surface: '#fff', backgroundElement: '#eee',
  border: '#aaa', primary: '#153', inverseText: '#fff',
}) }));

let root: Root;
let container: HTMLDivElement;
let onSignIn: ReturnType<typeof vi.fn<(email: string, password: string) => Promise<void>>>;
let onNotice: ReturnType<typeof vi.fn<(message: string) => void>>;
const EMAIL = '심사 계정 이메일';
const PASSWORD = '심사 계정 비밀번호';
const ENTRY = '심사 계정으로 로그인';
const SUBMIT = '심사 계정 로그인 확인';

async function render(props: Partial<Parameters<typeof ReviewerLoginForm>[0]> = {}) {
  await act(async () => root.render(createElement(ReviewerLoginForm, {
    disabled: false, termsAccepted: true, privacyAccepted: true,
    largeTextEnabled: false, onSignIn, onNotice, ...props,
  })));
}
function button(label: string) {
  return container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
}
function field(label: string) {
  return container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
async function fill(email = ' reviewer@example.test ', password = ' fixture password ') {
  await act(async () => {
    rendered.inputs[EMAIL].onChangeText?.(email);
    rendered.inputs[PASSWORD].onChangeText?.(password);
  });
}
function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  rendered.inputs = {};
  rendered.pressables = {};
  onSignIn = vi.fn().mockResolvedValue(undefined);
  onNotice = vi.fn();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('explicit reviewer login form', () => {
  it('opens visibly labeled secure fields and explains that ordinary members use Kakao', async () => {
    await render();
    expect(container.querySelector('input')).toBeNull();
    expect(button(ENTRY).getAttribute('aria-expanded')).toBe('false');
    await click(ENTRY);
    expect(button(ENTRY).getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('일반 회원은 카카오로 로그인');
    expect(field(PASSWORD).type).toBe('password');
    expect(rendered.inputs[EMAIL]).toMatchObject({ keyboardType: 'email-address', autoCapitalize: 'none' });
    for (const label of [EMAIL, PASSWORD]) {
      expect(rendered.inputs[label]).toMatchObject({ autoComplete: 'off', textContentType: 'none', importantForAutofill: 'no' });
    }
  });

  it.each([[false, false], [true, false], [false, true]])(
    'requires both mandatory consents (terms %s, privacy %s)', async (termsAccepted, privacyAccepted) => {
      await render({ termsAccepted, privacyAccepted });
      await click(ENTRY);
      await fill();
      await click(SUBMIT);
      expect(onSignIn).not.toHaveBeenCalled();
      expect(onNotice).toHaveBeenLastCalledWith('서비스 이용약관과 개인정보 처리방침에 모두 동의해 주세요.');
    },
  );

  it.each([['', 'fixture'], ['fixture@example.test', ''], ['   ', 'fixture']])(
    'requires email and password before authentication (%j)', async (email, password) => {
      await render();
      await click(ENTRY);
      await fill(email, password);
      await click(SUBMIT);
      expect(onSignIn).not.toHaveBeenCalled();
      expect(onNotice).toHaveBeenLastCalledWith('심사 계정 이메일과 비밀번호를 입력해 주세요.');
    },
  );

  it.each(['success', 'failure'] as const)('clears both credentials on %s and disables interaction while pending', async (outcome) => {
    const completion = deferred();
    onSignIn.mockImplementation(() => completion.promise);
    await render();
    await click(ENTRY);
    await fill();
    const submit = rendered.pressables[SUBMIT].onPress!;
    await act(async () => {
      // Repeated events can arrive before React commits the disabled state.
      submit({} as Parameters<typeof submit>[0]);
      submit({} as Parameters<typeof submit>[0]);
    });
    expect(onSignIn).toHaveBeenCalledExactlyOnceWith('reviewer@example.test', ' fixture password ');
    expect(button(ENTRY).disabled).toBe(true);
    expect(button(SUBMIT).disabled).toBe(true);
    expect(button(SUBMIT).getAttribute('aria-busy')).toBe('true');
    expect(field(EMAIL).disabled).toBe(true);
    expect(field(PASSWORD).disabled).toBe(true);
    await act(async () => {
      if (outcome === 'success') completion.resolve();
      else completion.reject({ code: 'REVIEWER_NOT_ALLOWED', message: 'private-fixture-password' });
    });
    expect(field(EMAIL).value).toBe('');
    expect(field(PASSWORD).value).toBe('');
    expect(button(SUBMIT).disabled).toBe(false);
    expect(container.textContent).not.toContain('private-fixture-password');
    if (outcome === 'failure') expect(onNotice.mock.lastCall?.[0]).toContain('심사 계정으로 로그인하지 못했습니다');
  });

  it('clears credentials when the reviewer form is closed', async () => {
    await render();
    await click(ENTRY);
    await fill();
    await click(ENTRY);
    expect(container.querySelector('input')).toBeNull();
    await click(ENTRY);
    expect(field(EMAIL).value).toBe('');
    expect(field(PASSWORD).value).toBe('');
  });

  it('disables reviewer entry and keyboard submission during another provider login', async () => {
    await render();
    await click(ENTRY);
    await fill();
    await render({ disabled: true });
    expect(button(ENTRY).disabled).toBe(true);
    expect(button(SUBMIT).disabled).toBe(true);
    const keyboardSubmit = rendered.inputs[PASSWORD].onSubmitEditing!;
    await act(async () => keyboardSubmit({} as Parameters<typeof keyboardSubmit>[0]));
    expect(onSignIn).not.toHaveBeenCalled();
  });

  it('scales inputs for large text without fixed heights or horizontal field columns', async () => {
    await render();
    await click(ENTRY);
    const standard = Object.assign({}, ...rendered.inputs[EMAIL].style as Record<string, unknown>[]);
    await render({ largeTextEnabled: true });
    const large = Object.assign({}, ...rendered.inputs[EMAIL].style as Record<string, unknown>[]);
    expect(rendered.inputs[EMAIL].allowFontScaling).toBe(true);
    expect(large.fontSize).toBeGreaterThan(standard.fontSize as number);
    expect(large.width).toBe('100%');
    expect(large.minHeight).toBeGreaterThanOrEqual(48);
    expect(large.height).toBeUndefined();
  });
});
