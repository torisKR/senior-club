// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppBillingProvider } from './AppBillingProvider';
import { useCosmeticBilling } from './CosmeticBillingProvider';

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  AppState: { addEventListener: () => ({ remove: () => undefined }) },
}));
vi.mock('./plus-token-store', () => import('./plus-token-store.web'));
vi.mock('./expo-iap-billing', () => import('./expo-iap-billing.web'));
vi.mock('./revenuecat-observer', () => import('./revenuecat-observer.web'));

afterEach(() => vi.unstubAllGlobals());

describe('web billing provider', () => {
  it('mounts the app and initializes all cosmetic stores on web', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    let itemCount = 0;
    function Child() {
      itemCount = Object.keys(useCosmeticBilling().items).length;
      return createElement('span', null, 'game ready');
    }
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => root.render(createElement(AppBillingProvider, null, createElement(Child))));
    expect(container.textContent).toBe('game ready');
    expect(itemCount).toBe(3);
    await act(async () => root.unmount());
  });
});
