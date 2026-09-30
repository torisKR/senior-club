// @vitest-environment jsdom
import { createElement, act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ImageProps } from 'expo-image';
import type { TextProps, ViewProps } from 'react-native';

import type { CoverImageSelection } from '@/data/image-assets';

import { CoverImage, type CoverImageProps } from './cover-image';

const rendered = vi.hoisted(() => ({
  images: [] as ImageProps[],
  texts: [] as TextProps[],
  views: [] as ViewProps[],
  largeText: false,
}));

vi.mock('expo-image', () => ({
  Image: (props: ImageProps) => {
    rendered.images.push(props);
    const source = props.source as number | { uri: string };
    return createElement('img', { src: typeof source === 'number' ? `asset:${source}` : source.uri, alt: props.accessibilityLabel });
  },
}));
vi.mock('react-native', () => ({
  View: (props: ViewProps & { children?: ReactNode }) => {
    rendered.views.push(props);
    return createElement('div', {}, props.children);
  },
  Text: (props: TextProps & { children?: ReactNode }) => {
    rendered.texts.push(props);
    return createElement('span', {}, props.children);
  },
  Platform: { select: (options: { default: unknown }) => options.default },
}));
vi.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ surface: '#fff', textSecondary: '#333', backgroundElement: '#eee' }) }));
vi.mock('@/hooks/use-app-state', () => ({ useAppState: () => ({ largeTextEnabled: rendered.largeText }) }));

let root: Root;
let container: HTMLDivElement;
const photo = (uri: string, fallbackSource = 4): CoverImageSelection => ({
  source: { uri, cacheKey: uri }, fallbackSource, isReference: false, sourceKey: JSON.stringify([uri, fallbackSource]),
});
const reference = (source = 4): CoverImageSelection => ({
  source, fallbackSource: source, isReference: true, sourceKey: JSON.stringify([null, source]),
});
const latestImage = () => rendered.images.at(-1)!;
const render = async (image: CoverImageSelection, props: Partial<CoverImageProps> = {}) => {
  await act(async () => root.render(createElement(CoverImage, {
    image, recyclingKey: 'event-1', accessibilityLabel: '모임 대표 이미지', ...props,
  })));
};
const fail = async (onError = latestImage().onError) => {
  await act(async () => onError?.({ error: 'Unavailable image' }));
};

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  rendered.images = [];
  rendered.texts = [];
  rendered.views = [];
  rendered.largeText = false;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('mobile CoverImage', () => {
  it('recovers from a remote error once to a local category reference with honest semantics', async () => {
    await render(photo('https://cdn.example.test/missing.jpg', 7));
    const supplied = latestImage();
    expect(supplied.accessibilityLabel).toBe('모임 대표 이미지');
    expect(container.textContent).not.toContain('주제 참고 이미지');
    await fail();
    expect(latestImage()).toMatchObject({
      source: 7, accessible: true, accessibilityRole: 'image',
      accessibilityLabel: '시니어클럽 공용 주제 참고 이미지', cachePolicy: 'memory-disk', contentFit: 'cover',
    });
    expect(latestImage().recyclingKey).not.toBe(supplied.recyclingKey);
    expect(latestImage().onError).toBeUndefined();
    expect(container.textContent).toContain('주제 참고 이미지');
    await fail(supplied.onError);
    expect(latestImage().source).toBe(7);
    expect(latestImage().onError).toBeUndefined();
  });

  it('resets failure when the source changes, including returning to a previously failed URI', async () => {
    const first = photo('https://cdn.example.test/a.jpg');
    await render(first);
    await fail();
    await render(photo('https://cdn.example.test/b.jpg'));
    expect(latestImage().source).toEqual(photo('https://cdn.example.test/b.jpg').source);
    expect(container.textContent).not.toContain('주제 참고 이미지');
    await render(first);
    expect(latestImage().source).toEqual(first.source);
    expect(latestImage().onError).toBeTypeOf('function');
    expect(latestImage().accessibilityLabel).toBe('모임 대표 이미지');
  });

  it('ignores stale remote errors after a recycled item switches sources', async () => {
    await render(photo('https://cdn.example.test/a.jpg'));
    const staleError = latestImage().onError;
    const next = photo('https://cdn.example.test/b.jpg', 5);
    await render(next, { recyclingKey: 'event-2', accessibilityLabel: '다음 모임 대표 이미지' });
    const nextKey = latestImage().recyclingKey;
    await fail(staleError);
    expect(latestImage().source).toEqual(next.source);
    expect(latestImage().recyclingKey).toBe(nextKey);
    expect(latestImage().accessibilityLabel).toBe('다음 모임 대표 이미지');
    expect(container.textContent).not.toContain('주제 참고 이미지');
  });

  it('resets for a recycled item sharing the same URI and for a changed fallback category', async () => {
    const shared = photo('https://cdn.example.test/shared.jpg');
    await render(shared);
    await fail();
    await render(shared, { recyclingKey: 'club-2' });
    expect(latestImage().source).toEqual(shared.source);
    await fail();
    await render(photo('https://cdn.example.test/shared.jpg', 6), { recyclingKey: 'club-2' });
    expect(latestImage().source).toEqual(shared.source);
    await fail();
    expect(latestImage().source).toBe(6);
  });

  it('keeps a failed source on its category reference during ordinary rerenders', async () => {
    const shared = photo('https://cdn.example.test/shared.jpg');
    await render(shared);
    await fail();
    await render({ ...shared }, { accessibilityLabel: '수정한 모임 이름' });
    expect(latestImage().source).toBe(shared.fallbackSource);
    expect(latestImage().accessibilityLabel).toContain('주제 참고 이미지');
  });

  it('renders missing-image references honestly from the first render, without a retry loop', async () => {
    await render(reference(2), { accessibilityLabel: '이 모임의 실제 사진' });
    expect(latestImage().source).toBe(2);
    expect(latestImage().accessibilityLabel).toBe('시니어클럽 공용 주제 참고 이미지');
    expect(latestImage().onError).toBeUndefined();
    expect(container.textContent).toBe('주제 참고 이미지');
  });

  it.each([16 / 9, 4 / 3, 2.4])('preserves reserved aspect ratio %s, caching and the caller transition', async (aspectRatio) => {
    await render(reference(), { style: { width: '100%', aspectRatio }, transition: 160 });
    expect(latestImage()).toMatchObject({ cachePolicy: 'memory-disk', contentFit: 'cover', transition: 160 });
    expect(latestImage().style).toEqual(expect.arrayContaining([expect.objectContaining({ width: '100%', aspectRatio })]));
  });

  it('allows Android large-text scaling and wrapping in a caption below the reserved image', async () => {
    await render(reference());
    const standardStyle = rendered.texts.at(-1)!.style as { fontSize: number }[];
    rendered.largeText = true;
    await render(reference());
    const caption = rendered.texts.at(-1)!;
    const captionStyle = caption.style as { fontSize: number }[];
    expect(caption.allowFontScaling).toBe(true);
    expect(caption.numberOfLines).toBeUndefined();
    expect(caption.maxFontSizeMultiplier).toBeUndefined();
    expect(captionStyle[0].fontSize).toBeGreaterThan(standardStyle[0].fontSize);
    const captionContainer = rendered.views.at(-1)!;
    expect(captionContainer.style).not.toHaveProperty('height');
    expect(captionContainer.style).not.toHaveProperty('position', 'absolute');
    expect(captionContainer.importantForAccessibility).toBe('no-hide-descendants');
    expect(latestImage().accessibilityLabel).toContain('주제 참고 이미지');
  });
});
