// @vitest-environment jsdom
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { BillingProvider, useAdsAllowed, useBilling } from '@/billing/BillingProvider';
import { CosmeticBillingProvider, type CosmeticStores } from '@/billing/CosmeticBillingProvider';
import { COSMETIC_PRODUCTS, type CosmeticProductId } from '@/billing/cosmetic-products';
import { createFakeBilling } from '@/billing/fake-billing';
import type { TokenStore } from '@/billing/billing-port';
import { ArcadeProvider, useArcade } from './arcade-store';

const mocks = vi.hoisted(() => ({ saved: {} as Record<string, unknown> }));
vi.mock('@/audio/sound-manager', () => ({ playSfx: vi.fn(), stopAllSfx: vi.fn() }));
vi.mock('expo-haptics', () => ({
  impactAsync: async () => {}, notificationAsync: async () => {},
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' }, NotificationFeedbackType: { Success: 'success' },
}));
vi.mock('react-native', () => ({ AppState: { addEventListener: () => ({ remove: () => {} }) } }));
vi.mock('@/utils/storage', () => ({ storage: {
  get: () => mocks.saved,
  getRaw: () => JSON.stringify(mocks.saved),
  set: (_key: string, value: Record<string, unknown>) => { mocks.saved = value; },
} }));

let root: Root | null;
let container: HTMLDivElement;
let current: { arcade: ReturnType<typeof useArcade>; owned: boolean; adsAllowed: boolean };

function Probe() {
  const arcade = useArcade();
  const { owned } = useBilling();
  const adsAllowed = useAdsAllowed();
  useEffect(() => { current = { arcade, owned, adsAllowed }; }, [arcade, owned, adsAllowed]);
  return null;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.saved = { cp: 425, seals: 7, soundEnabled: false, equippedSkins: { putter: 'nacre' } };
  container = document.createElement('div');
  document.body.append(container);
  root = null;
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('preserves ad removal and equipped cosmetics when old settings migrate and billing goes offline', async () => {
  const billing = createFakeBilling();
  billing.seedOwned('fixture-remove-ads');
  billing.seedOwnedProduct(COSMETIC_PRODUCTS[0].id, 'fixture-nacre');
  const values = new Map<string, string>();
  const tokenStore = (key: string): TokenStore => ({
    get: async () => values.get(key) ?? null,
    set: async (token) => { values.set(key, token); },
    clear: async () => { values.delete(key); },
  });
  const stores = Object.fromEntries(COSMETIC_PRODUCTS.map(({ id }) => [id, tokenStore(id)])) as Record<CosmeticProductId, TokenStore>;
  const adTokens = tokenStore('ads');
  const mount = async () => {
    root = createRoot(container);
    await act(async () => root!.render(createElement(BillingProvider, { billing: billing.billing, tokens: adTokens },
      createElement(CosmeticBillingProvider, { billing: billing.billing, stores: stores as CosmeticStores },
        createElement(ArcadeProvider, null, createElement(Probe))))));
  };
  await mount();
  expect(current.owned).toBe(true);
  expect(current.adsAllowed).toBe(false);
  expect(current.arcade.appearance.putter).toBe('nacre');
  expect(current.arcade.state.hapticEnabled).toBe(false);
  await act(async () => { current.arcade.toggleHaptic(); current.arcade.toggleReduceMotion(); });
  await act(async () => root!.unmount());
  root = null;
  billing.setProbeUnavailable(true);
  await mount();
  expect(current.owned).toBe(true);
  expect(current.adsAllowed).toBe(false);
  expect(current.arcade.appearance.putter).toBe('nacre');
  expect(current.arcade.state).toMatchObject({ cp: 425, seals: 7, soundEnabled: false, hapticEnabled: true, reduceMotion: true });
});
