// @vitest-environment jsdom
import { act, createElement, useContext } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppStateContext, AppStateProvider } from './app-state';
import { LEGACY_APP_STATE_STORAGE_KEYS, UI_PREFERENCES_STORAGE_KEY } from './app-state-store';

const fixture = vi.hoisted(() => ({
  bytes: new Map<string, string>(),
  fetch: vi.fn(),
}));

vi.mock('@/utils/storage', () => ({
  storage: {
    getRaw: (key: string) => fixture.bytes.get(key) ?? null,
    set: (key: string, value: unknown) => fixture.bytes.set(key, JSON.stringify(value)),
  },
}));


afterEach(() => { fixture.bytes.clear(); vi.unstubAllGlobals(); });

describe('offline provider', () => {
  it('opens without account or network access, and restores font changes on restart', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', fixture.fetch);
    fixture.fetch.mockClear();
    fixture.bytes.set(LEGACY_APP_STATE_STORAGE_KEYS[0], JSON.stringify({
      largeTextEnabled: true, session: { userId: 'old-account' },
    }));
    fixture.bytes.set('game-save', 'unchanged');
    const container = document.createElement('div');
    const root = createRoot(container);

    function Probe() {
      const state = useContext(AppStateContext);
      if (!state) throw new Error('missing provider');
      return createElement('button', { onClick: state.toggleLargeText }, String(state.largeTextEnabled));
    }

    const mount = () => root.render(createElement(AppStateProvider, null, createElement(Probe)));
    await act(async () => { mount(); });
    expect(container.textContent).toBe('true');
    await act(async () => { container.querySelector('button')?.click(); });
    expect(container.textContent).toBe('false');
    expect(fixture.bytes.get(UI_PREFERENCES_STORAGE_KEY)).toBe('{"largeTextEnabled":false}');
    await act(async () => { root.render(null); });
    await act(async () => { mount(); });
    expect(container.textContent).toBe('false');
    expect(fixture.bytes.get('game-save')).toBe('unchanged');
    expect(fixture.bytes.get(LEGACY_APP_STATE_STORAGE_KEYS[0])).toContain('old-account');
    expect(fixture.fetch).not.toHaveBeenCalled();
    await act(async () => { root.unmount(); });
  });
});
