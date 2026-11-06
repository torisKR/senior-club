// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdsPrivacySettings } from './AdsPrivacySettings';

const consent = vi.hoisted(() => ({ required: false, show: vi.fn() }));
vi.mock('./AdsProvider', () => ({
  useAds: () => ({ privacyOptionsRequired: consent.required, showPrivacyOptions: consent.show }),
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'android', select: (options: { default: unknown }) => options.default },
  View: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}));
vi.mock('@/components/ui', () => ({
  AppText: ({ children }: { children: ReactNode }) => createElement('span', null, children),
  SeniorButton: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) =>
    createElement('button', { onClick: onPress, disabled }, label),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  consent.required = false;
  consent.show.mockReset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('advertising privacy entry point', () => {
  it('only appears when required and opens the privacy form on request', async () => {
    await act(async () => root.render(createElement(AdsPrivacySettings)));
    expect(container.querySelector('button')).toBeNull();
    consent.required = true;
    consent.show.mockResolvedValue(undefined);
    await act(async () => root.render(createElement(AdsPrivacySettings)));
    await act(async () => container.querySelector('button')!.click());
    expect(consent.show).toHaveBeenCalledOnce();
  });

  it('offers a retry if opening the form fails', async () => {
    consent.required = true;
    consent.show.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
    await act(async () => root.render(createElement(AdsPrivacySettings)));
    await act(async () => container.querySelector('button')!.click());
    expect(container.textContent).toContain('다시 시도');
    await act(async () => container.querySelector('button')!.click());
    expect(consent.show).toHaveBeenCalledTimes(2);
    expect(container.textContent).not.toContain('다시 시도');
  });
});
