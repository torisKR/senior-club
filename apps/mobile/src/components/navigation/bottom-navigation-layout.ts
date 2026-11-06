import type { AppIconName } from '@/components/ui/app-icon';

export const BottomDestinations = [
  { name: 'home', label: '라운지', icon: 'home' },
  { name: 'clubs', label: '파크골프', icon: 'groups' },
  { name: 'events', label: '알까기', icon: 'calendar' },
  { name: 'chat', label: '사천성', icon: 'chat' },
  { name: 'me', label: '명인전당', icon: 'person' },
] as const satisfies readonly { name: string; label: string; icon: AppIconName }[];

/** Reserve scaled label lines instead of shrinking text to fit a fixed bar. */
export function bottomNavigationLayout({
  width, fontScale, largeTextEnabled, bottomInset, count = BottomDestinations.length,
}: { width: number; fontScale: number; largeTextEnabled: boolean; bottomInset: number; count?: number }) {
  const labelSize = largeTextEnabled ? 13 : 12;
  const labelLineHeight = largeTextEnabled ? 18 : 16;
  const scale = Math.max(1, fontScale);
  const itemWidth = width / Math.max(1, count);
  const labelWidth = Math.max(1, itemWidth - 8);
  const labelLines = Math.max(1, Math.ceil((4 * labelSize * scale) / labelWidth));
  const rowHeight = Math.max(60, Math.ceil(12 + 28 + 4 + labelLineHeight * scale * labelLines));
  const safeBottom = Math.max(0, bottomInset);
  return { labelSize, labelLineHeight, labelLines, rowHeight, bottomInset: safeBottom, height: rowHeight + safeBottom };
}
