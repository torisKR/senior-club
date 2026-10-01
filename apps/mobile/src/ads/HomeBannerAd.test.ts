// @vitest-environment jsdom
import { act, createElement, Fragment, useEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { LayoutChangeEvent } from 'react-native';
import type { BannerAdProps } from 'react-native-google-mobile-ads';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BillingProvider, useBilling, type BillingContextValue, type BillingProviderProps } from '@/billing/BillingProvider';
import type { TokenStore } from '@/billing/billing-port';
import { createFakeBilling, type FakeBilling } from '@/billing/fake-billing';

import { HomeBannerAd } from './HomeBannerAd';
import { GOOGLE_ANDROID_TEST_BANNER_ID } from './ids';

const native = vi.hoisted(() => ({
  focused: true,
  consent: true,
  platform: { OS: 'android', select: (options: { default: unknown }) => options.default },
  dimensions: { width: 393, height: 852 },
  insets: { top: 24, bottom: 24, left: 0, right: 0 },
  views: new Map<string, Record<string, unknown>>(),
  label: {} as Record<string, unknown>,
  requests: [] as BannerAdProps[],
  unmounts: 0,
}));

vi.mock('expo-router', () => ({ useIsFocused: () => native.focused }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => native.insets }));
vi.mock('react-native', () => ({
  Platform: native.platform,
  useWindowDimensions: () => native.dimensions,
  View: (props: Record<string, unknown> & { children?: ReactNode; testID?: string }) => {
    if (props.testID) native.views.set(props.testID, props);
    return createElement('div', { 'data-testid': props.testID }, props.children);
  },
}));
vi.mock('react-native-google-mobile-ads', async () => {
  const { useEffect, useRef } = await import('react');
  return {
    BannerAdSize: { ANCHORED_ADAPTIVE_BANNER: 'ANCHORED_ADAPTIVE_BANNER' },
    BannerAd: (props: BannerAdProps) => {
      const request = useRef(props);
      useEffect(() => {
        native.requests.push(request.current);
        return () => { native.unmounts += 1; };
      }, []);
      return createElement('div', { 'data-testid': 'native-banner' },
        createElement('button', { 'aria-label': '광고 내부 링크' }, '광고 내부 링크'));
    },
  };
});
vi.mock('./AdsProvider', () => ({ useAds: () => ({ canRequestAds: native.consent }) }));
vi.mock('@/hooks/use-theme', () => ({
  useTheme: () => ({ backgroundElement: '#F2F4F0' }),
}));
vi.mock('@/components/ui', () => ({
  AppText: (props: Record<string, unknown> & { children?: ReactNode }) => {
    native.label = props;
    return createElement('span', null, props.children);
  },
}));

let root: Root;
let container: HTMLDivElement;
let fake: FakeBilling;
let tokens: TokenStore;
let billing: BillingContextValue;

function BillingProbe() {
  const current = useBilling();
  useEffect(() => { billing = current; }, [current]);
  return null;
}

async function render(withBilling = true) {
  await act(async () => {
    root.render(withBilling
      ? createElement(BillingProvider, { billing: fake.billing, tokens } as BillingProviderProps,
        createElement(Fragment, null, createElement(BillingProbe), createElement(HomeBannerAd)))
      : createElement(HomeBannerAd));
  });
}

async function layout(width: number) {
  expect(container.querySelector('[data-testid="home-banner-ad-container"]')).not.toBeNull();
  const onLayout = native.views.get('home-banner-ad-container')!.onLayout as (event: LayoutChangeEvent) => void;
  await act(async () => {
    onLayout({ nativeEvent: { layout: { width, height: 0, x: 0, y: 0 } } } as LayoutChangeEvent);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('__DEV__', true);
  vi.stubEnv('EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID', 'ca-app-pub-5744832247312120/1234567890');
  Object.assign(native, { focused: true, consent: true, requests: [], unmounts: 0 });
  native.platform.OS = 'android';
  native.dimensions = { width: 393, height: 852 };
  native.insets = { top: 24, bottom: 24, left: 0, right: 0 };
  native.views.clear();
  fake = createFakeBilling();
  tokens = { get: async () => null, set: async () => undefined, clear: async () => undefined };
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Android content banner requests and accessibility', () => {
  it('waits for container layout and requests compact test inventory at the inset content width', async () => {
    await render();
    expect(native.requests).toHaveLength(0);
    expect(container.textContent).toBe('');
    await layout(361.9); // A 393dp viewport with 16dp screen padding on each side.
    expect(native.requests).toHaveLength(1);
    expect(native.requests[0]).toMatchObject({
      unitId: GOOGLE_ANDROID_TEST_BANNER_ID, size: 'ANCHORED_ADAPTIVE_BANNER', width: 361,
    });
    expect(container.textContent).toContain('광고');
    await render();
    await layout(361.9);
    expect(native.requests).toHaveLength(1);
  });

  it('subtracts horizontal safe areas and bounds a stale container to the viewport', async () => {
    native.dimensions = { width: 852, height: 393 };
    native.insets.left = 44;
    native.insets.right = 24;
    await render();
    await layout(688);
    expect(native.requests[0].width).toBe(620);
    expect(native.views.get('home-banner-ad-container')!.style).toMatchObject({ paddingLeft: 44, paddingRight: 24 });
    await layout(1000);
    expect(native.requests.at(-1)!.width).toBe(784);
  });

  it('makes no native request when layout leaves no usable width', async () => {
    native.insets.left = 30;
    native.insets.right = 30;
    await render();
    await layout(0);
    await layout(50);
    expect(native.requests).toHaveLength(0);
    expect(container.textContent).toBe('');
  });

  it('preserves native TalkBack descendants and a readable label without grouping or intercepting presses', async () => {
    await render();
    await layout(361);
    for (const id of ['home-banner-ad-container', 'home-banner-ad']) {
      const props = native.views.get(id)!;
      expect(props.accessible).toBe(false);
      expect(props.accessibilityElementsHidden).not.toBe(true);
      expect(props.importantForAccessibility).not.toBe('no-hide-descendants');
      expect(props.onPress).toBeUndefined();
      expect(props.pointerEvents).toBeUndefined();
    }
    expect(native.label).toMatchObject({ children: '광고', align: 'center', color: 'textSecondary', selectable: false });
    expect(native.label.accessibilityElementsHidden).not.toBe(true);
    expect(container.querySelector('button[aria-label="광고 내부 링크"]')).not.toBeNull();
    expect(native.views.get('home-banner-ad')!.style).toMatchObject({ alignItems: 'center', gap: 8, paddingVertical: 12 });
  });

  it('does not request in a retained background tab and remounts on each reentry', async () => {
    native.focused = false;
    await render();
    expect(container.childElementCount).toBe(0);
    expect(native.requests).toHaveLength(0);
    native.focused = true;
    await render();
    await layout(361);
    native.focused = false;
    await render();
    expect(container.childElementCount).toBe(0);
    expect(native.unmounts).toBe(1);
    native.focused = true;
    await render();
    expect(native.requests).toHaveLength(1);
    await layout(361);
    expect(native.requests).toHaveLength(2);
  });

  it('gates consent, pending billing, missing billing, and owned ad removal before requests', async () => {
    let resolveConnect!: () => void;
    fake.billing.connect = () => new Promise<void>((resolve) => { resolveConnect = resolve; });
    await render();
    expect(billing.ready).toBe(false);
    expect(container.childElementCount).toBe(0);
    native.consent = false;
    await act(async () => resolveConnect());
    await render();
    expect(billing.ready).toBe(true);
    expect(container.childElementCount).toBe(0);
    native.consent = true;
    await render();
    await layout(361);
    await act(async () => { await billing.buy(); });
    expect(billing.owned).toBe(true);
    expect(container.childElementCount).toBe(0);
    await render(false);
    expect(container.childElementCount).toBe(0);
    expect(native.requests).toHaveLength(1);
  });

  it('never requests for an existing ad-free entitlement', async () => {
    fake.seedOwned('owned-token');
    await render();
    expect(billing.owned).toBe(true);
    expect(native.requests).toHaveLength(0);
    expect(container.childElementCount).toBe(0);
  });

  it.each(['ios', 'web'])('makes no request on %s', async (platform) => {
    native.platform.OS = platform;
    await render();
    expect(native.requests).toHaveLength(0);
    expect(container.childElementCount).toBe(0);
  });

  it('collapses failed inventory and only retries after a new width, unit, or screen visit', async () => {
    vi.stubGlobal('__DEV__', false);
    await render();
    await layout(361);
    const first = native.requests[0];
    await act(async () => first.onAdFailedToLoad!(new Error('no fill')));
    expect(container.querySelector('[data-testid="home-banner-ad"]')).toBeNull();
    expect(container.textContent).toBe('');
    expect(native.views.get('home-banner-ad-container')!.style).not.toHaveProperty('paddingVertical');
    await render();
    await layout(361);
    expect(native.requests).toHaveLength(1);
    await layout(340);
    expect(native.requests).toHaveLength(2);
    await act(async () => first.onAdFailedToLoad!(new Error('late failure')));
    expect(container.querySelector('[data-testid="native-banner"]')).not.toBeNull();
    vi.stubEnv('EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID', 'ca-app-pub-5744832247312120/9876543210');
    await render();
    expect(container.querySelector('[data-testid="native-banner"]')).toBeNull();
    await layout(340);
    expect(native.requests.at(-1)!.unitId).toBe('ca-app-pub-5744832247312120/9876543210');
    await act(async () => native.requests.at(-1)!.onAdFailedToLoad!(new Error('no fill')));
    native.focused = false;
    await render();
    native.focused = true;
    await render();
    await layout(340);
    expect(native.requests).toHaveLength(4);
  });

  it('remeasures and remounts after rotation even when the max container width is unchanged', async () => {
    native.dimensions = { width: 800, height: 1200 };
    await render();
    await layout(688);
    native.dimensions = { width: 1200, height: 800 };
    await render();
    expect(native.unmounts).toBe(1);
    expect(native.requests).toHaveLength(1);
    expect(container.querySelector('[data-testid="native-banner"]')).toBeNull();
    await layout(688);
    expect(native.requests).toHaveLength(2);
    expect(native.requests[1].width).toBe(688);
  });

  it('fails closed for a malformed release unit', async () => {
    vi.stubGlobal('__DEV__', false);
    vi.stubEnv('EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID', 'invalid');
    await render();
    expect(native.requests).toHaveLength(0);
    expect(container.childElementCount).toBe(0);
  });
});
