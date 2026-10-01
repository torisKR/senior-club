import { describe, expect, it, vi } from 'vitest';

import { FontSizes, FontWeights, LineHeights } from '@/constants/theme';

import { AppText, type AppTextVariant } from './app-text';

const state = vi.hoisted(() => ({ large: false }));
vi.mock('react-native', () => ({ Text: 'Text', Platform: { select: (options: { default: unknown }) => options.default } }));
vi.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ text: '#24382b' }) }));
vi.mock('@/hooks/use-app-state', () => ({ useAppState: () => ({ largeTextEnabled: state.large }) }));

describe('native readable typography', () => {
  it('uses a readable hierarchy with quiet captions and regular body copy', () => {
    state.large = false;
    for (const [variant, size, line, family] of [
      ['caption', 13, 19, FontWeights.body], ['body', 16, 24, FontWeights.body],
      ['bodyStrong', 16, 24, FontWeights.emphasis], ['key', 17, 24, FontWeights.emphasis],
      ['sectionTitle', 20, 28, FontWeights.emphasis], ['title', 24, 32, FontWeights.emphasis],
      ['display', 28, 36, FontWeights.strong], ['button', 17, 24, FontWeights.emphasis],
    ] as const) {
      const text = AppText({ variant });
      expect(text.props.style[0]).toMatchObject({ fontSize: size, lineHeight: line, fontFamily: family });
      expect(text.props.allowFontScaling).toBe(true);
      expect(text.props.maxFontSizeMultiplier).toBeUndefined();
      expect(text.props.numberOfLines).toBeUndefined();
    }
  });

  it('keeps the separate large-text option and leaves system scaling enabled', () => {
    state.large = true;
    for (const variant of Object.keys(FontSizes.large) as Exclude<AppTextVariant, 'button' | 'bodyStrong'>[]) {
      const text = AppText({ variant });
      expect(text.props.style[0]).toMatchObject({ fontSize: FontSizes.large[variant], lineHeight: LineHeights.large[variant] });
      expect(FontSizes.large[variant]).toBeGreaterThan(FontSizes.standard[variant]);
      expect(text.props.allowFontScaling).toBe(true);
    }
    state.large = false;
  });
});
