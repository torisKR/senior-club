import { StyleSheet } from 'react-native';

import { PixelPalette } from '@/components/game/pixel-theme';
import { FontWeights, Radius, Spacing } from '@/constants/theme';

/** 픽셀 창 공통 모양: 직각에 가까운 모서리 + 호두 바깥선. */
const frame = { borderRadius: 2, borderWidth: 3, borderColor: PixelPalette.outline } as const;
const darkFrame = { ...frame, backgroundColor: 'rgba(36, 56, 43, 0.94)', boxShadow: `inset 0 0 0 2px ${PixelPalette.gold}` } as const;
const lightFrame = { ...frame, backgroundColor: PixelPalette.hanji, boxShadow: `inset 0 0 0 2px ${PixelPalette.woodLight}` } as const;

/** 마을 화면 HUD·하단 조작부·시트 스타일 (청솔마을 픽셀 스킨). */
export const hud = StyleSheet.create({
  quickSettings: { ...lightFrame, padding: Spacing.md, gap: Spacing.sm },
  settingsTitle: { color: PixelPalette.pineDark },
  settingRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  settingLabel: { flex: 1, color: PixelPalette.ink },
  worldRoot: { flex: 1, backgroundColor: '#356347' },
  top: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: Spacing.md },
  statusCard: { ...darkFrame, minWidth: 176, maxWidth: 230, flexShrink: 1, padding: Spacing.sm, gap: 6 },
  statusHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: { width: 28, height: 28 },
  rankText: { color: '#F0BF4F', fontFamily: FontWeights.strong },
  barTrack: { height: 12, borderRadius: 0, borderWidth: 2, borderColor: PixelPalette.outline, backgroundColor: '#3B2A1E', overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#6DBE45', boxShadow: 'inset 0 3px 0 #9BE06A' },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 2 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statIcon: { width: 22, height: 22 },
  statusText: { color: '#FCF9F2', fontVariant: ['tabular-nums'], fontFamily: FontWeights.strong },
  buttonColumn: { gap: Spacing.sm },
  hudButton: { width: 64, minHeight: 64, alignItems: 'center', justifyContent: 'center' },
  wideHudButton: { width: 88 },
  rewardScroll: { width: '100%', maxWidth: 420, maxHeight: '100%', flexGrow: 0, flexShrink: 1 },
  choiceScroll: { ...lightFrame, width: '100%', maxWidth: 420, maxHeight: '100%', flexGrow: 0, flexShrink: 1 },
  choiceContent: { padding: Spacing.md, gap: Spacing.sm },
  choiceTitle: { color: PixelPalette.ink },
  hudIcon: { width: 52, height: 52 },
  hudLabel: { color: '#FCF9F2', fontFamily: FontWeights.strong, textShadowColor: '#182620', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  tutorialSlot: { position: 'absolute', left: Spacing.md, right: Spacing.md },
  toastStack: { position: 'absolute', left: Spacing.md, right: 96, gap: 6, alignItems: 'flex-start' },
  locationPill: { ...darkFrame, borderWidth: 2, paddingHorizontal: 10, paddingVertical: 4 },
  locationText: { color: '#FCF9F2' },
  noticeToast: { ...lightFrame, padding: Spacing.sm },
  noticeText: { color: PixelPalette.pineDark },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: Spacing.md, gap: Spacing.sm },
  dialogue: { marginBottom: 0, padding: Spacing.md },
  closeBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  controlsRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'flex-end' },
  actionBtn: {
    minWidth: 96, minHeight: 96, flexShrink: 1, marginLeft: Spacing.sm, paddingHorizontal: Spacing.md,
    borderRadius: 48, alignItems: 'center', justifyContent: 'center',
    backgroundColor: PixelPalette.persimmon, borderWidth: 3, borderColor: PixelPalette.outline,
    boxShadow: `inset 0 0 0 3px ${PixelPalette.gold}, inset 0 -7px 0 ${PixelPalette.persimmonDark}, 0 4px 0 ${PixelPalette.outline}66`,
  },
  actionBtnIdle: { backgroundColor: 'rgba(36, 56, 43, 0.72)', boxShadow: `inset 0 0 0 3px ${PixelPalette.woodLight}` },
  actionBtnPressed: { transform: [{ translateY: 3 }] },
  actionText: { color: '#FFF8E7', textAlign: 'center', fontFamily: FontWeights.strong },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  sheet: {
    borderTopLeftRadius: Radius.sm, borderTopRightRadius: Radius.sm, backgroundColor: PixelPalette.hanji,
    borderTopWidth: 4, borderLeftWidth: 3, borderRightWidth: 3, borderColor: PixelPalette.outline,
    boxShadow: `inset 0 3px 0 ${PixelPalette.woodLight}`, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  sheetClose: { ...frame, borderWidth: 2, minHeight: 48, minWidth: 64, alignItems: 'center', justifyContent: 'center', backgroundColor: PixelPalette.hanjiShade },
});
