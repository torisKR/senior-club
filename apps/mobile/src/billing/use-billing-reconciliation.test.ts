// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useBillingReconciliation } from './use-billing-reconciliation';

const lifecycle = vi.hoisted(() => ({ listener: undefined as undefined | ((state: string) => void) }));
vi.mock('react-native', () => ({
  AppState: {
    addEventListener: (_event: string, listener: (state: string) => void) => {
      lifecycle.listener = listener;
      return { remove: () => { lifecycle.listener = undefined; } };
    },
  },
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('foreground purchase reconciliation', () => {
  it('refreshes after returning to the app and cancels a pending refresh on unmount', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const refresh = vi.fn().mockResolvedValue(undefined);
    const root = createRoot(document.createElement('div'));
    function Probe() { useBillingReconciliation(refresh); return null; }

    await act(async () => root.render(createElement(Probe)));
    lifecycle.listener?.('background');
    lifecycle.listener?.('active');
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(refresh).toHaveBeenCalledTimes(1);

    lifecycle.listener?.('active');
    await act(async () => root.unmount());
    await vi.advanceTimersByTimeAsync(1500);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
