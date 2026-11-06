// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FocusedBackgroundAudio } from './focused-background-audio';

const audio = vi.hoisted(() => ({
  player: { loop: false, volume: 1, play: vi.fn(), pause: vi.fn() },
  usePlayer: vi.fn(),
}));

vi.mock('expo-audio', () => ({ useAudioPlayer: audio.usePlayer }));
vi.mock('expo-router', async () => {
  const React = await import('react');
  return { useFocusEffect: (callback: () => void | (() => void)) => React.useEffect(callback, [callback]) };
});
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  audio.player.loop = false;
  audio.player.volume = 1;
  audio.player.play.mockReset();
  audio.player.pause.mockReset();
  audio.usePlayer.mockReset().mockReturnValue(audio.player);
});

afterEach(() => vi.unstubAllGlobals());

describe('focused background audio', () => {
  it('does not construct a browser audio player during server rendering', () => {
    vi.stubGlobal('window', undefined);
    expect(renderToString(createElement(FocusedBackgroundAudio, { source: 123, enabled: true }))).toBe('');
    expect(audio.usePlayer).not.toHaveBeenCalled();
  });

  it('preserves playback, mute and focus cleanup after the browser mounts', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => root.render(createElement(FocusedBackgroundAudio, { source: 123, enabled: true })));
    expect(audio.usePlayer).toHaveBeenCalledWith(123);
    expect(audio.player.loop).toBe(true);
    expect(audio.player.volume).toBe(0.45);
    expect(audio.player.play).toHaveBeenCalledTimes(1);

    await act(async () => root.render(createElement(FocusedBackgroundAudio, { source: 123, enabled: false })));
    expect(audio.player.pause).toHaveBeenCalledTimes(1);
    expect(audio.player.play).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    expect(audio.player.pause).toHaveBeenCalledTimes(2);
  });
});
