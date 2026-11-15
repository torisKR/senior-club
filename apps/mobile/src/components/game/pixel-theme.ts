import type { ButtonVariant } from '@/constants/theme';

/**
 * 청솔마을 픽셀 UI 팔레트 — 호두나무 프레임 + 한지 바탕.
 * 본문 텍스트(ink)는 한지(hanji) 위 대비 14:1 이상, 버튼 글자는 4.5:1 이상을 유지합니다.
 */
export const PixelPalette = {
  outline: '#2E2016',
  wood: '#7A5233',
  woodLight: '#A87B4F',
  hanji: '#F7EFDC',
  hanjiShade: '#EADDBF',
  ink: '#2B2118',
  inkSoft: '#5A4632',
  gold: '#C9A44C',
  pine: '#2F5D3A',
  pineDark: '#1F4027',
  persimmon: '#B83A0B',
  persimmonDark: '#8A2B08',
  danger: '#A22D2D',
  dialogue: '#24382B',
  dialogueText: '#FFF8E7',
} as const;

/** 픽셀 단위 두께 — 1아트픽셀 = 1dp 규칙에 맞춘 3dp 테두리. */
export const PixelBorder = { frame: 3, bevel: 5, pressedBevel: 2, corner: 18 } as const;

export interface PixelButtonAppearance {
  face: string;
  bevel: string;
  text: string;
}

/** 버튼 역할은 앱과 같게 두고(primary/accent/secondary…) 색만 마을 팔레트로 바꿉니다. */
export function pixelButtonAppearance(variant: ButtonVariant): PixelButtonAppearance {
  switch (variant) {
    case 'primary':
      return { face: PixelPalette.pine, bevel: PixelPalette.pineDark, text: PixelPalette.dialogueText };
    case 'accent':
      return { face: PixelPalette.persimmon, bevel: PixelPalette.persimmonDark, text: PixelPalette.dialogueText };
    case 'danger':
      return { face: PixelPalette.hanji, bevel: PixelPalette.hanjiShade, text: PixelPalette.danger };
    case 'quiet':
    case 'ghost':
      return { face: PixelPalette.hanjiShade, bevel: PixelPalette.woodLight, text: PixelPalette.ink };
    default:
      return { face: PixelPalette.hanji, bevel: PixelPalette.woodLight, text: PixelPalette.pineDark };
  }
}

/** 픽셀 창 모서리: 거의 직각(2dp). 알약형(pill)·원형은 그대로 둡니다. */
export const PixelRadius = 2;
