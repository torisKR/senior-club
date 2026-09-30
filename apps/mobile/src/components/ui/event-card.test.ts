import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { Event } from '@/types';

import { EventCard } from './event-card';

const coverMocks = vi.hoisted(() => ({
  selection: { source: 4, fallbackSource: 4, isReference: true, sourceKey: 'photo' },
  select: vi.fn(),
}));

vi.mock('react-native', () => ({
  View: 'View',
  Platform: { select: (options: { default: unknown }) => options.default },
}));
vi.mock('expo-image', () => ({ Image: 'Image' }));
vi.mock('@/hooks/use-theme', () => ({ useTheme: () => ({}) }));
vi.mock('@/data/image-assets', () => ({
  getEventCoverImage: (value: Event) => {
    coverMocks.select(value);
    return coverMocks.selection;
  },
}));
vi.mock('./cover-image', () => ({ CoverImage: 'CoverImage' }));
vi.mock('./app-text', () => ({ AppText: 'AppText' }));
vi.mock('./card', () => ({ Card: 'Card' }));
vi.mock('./seat-meter', () => ({ SeatMeter: 'SeatMeter' }));

type ElementProps = { children?: ReactNode; [key: string]: unknown };

function elements(node: ReactNode): ReactElement<ElementProps>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<ElementProps>(node)) return [];
  return [node, ...elements(node.props.children)];
}

function visibleText(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(visibleText).join('');
  if (isValidElement<ElementProps>(node)) return visibleText(node.props.children);
  return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}

const event: Event = {
  id: 'past-event',
  clubId: 'club',
  clubTitle: '산책 모임',
  title: '한강 걷기',
  summary: '함께 걷는 모임',
  description: '한강에서 함께 걸어요.',
  location: '여의나루역',
  address: '서울 영등포구',
  startsAt: '2026-05-10T01:00:00.000Z',
  endsAt: '2026-05-10T03:00:00.000Z',
  capacity: 12,
  participantCount: 3,
  price: 5000,
  difficulty: 'easy',
  lifecycle: 'completed',
  preparation: [],
  leader: { id: 'leader', name: '리더', introduction: '' },
};

describe('EventCard lifecycle', () => {
  it('passes the full event and image selection to the shared cover while preserving compact cards', () => {
    const withPhoto = { ...event, imageUri: 'https://cdn.example.test/event.jpg', interestId: 'reading' };
    coverMocks.select.mockClear();
    const card = EventCard({ event: withPhoto });
    expect(coverMocks.select).toHaveBeenCalledWith(withPhoto);
    const cover = elements(card).find((element) => element.type === 'CoverImage');
    expect(cover?.props).toMatchObject({
      image: coverMocks.selection,
      recyclingKey: event.id,
      accessibilityLabel: `${event.title} 모임 대표 이미지`,
      style: { width: '100%', aspectRatio: 16 / 9 },
    });
    coverMocks.select.mockClear();
    const compact = EventCard({ event: withPhoto, compact: true });
    expect(coverMocks.select).not.toHaveBeenCalled();
    expect(elements(compact).some((element) => element.type === 'CoverImage')).toBe(false);
  });

  it.each([
    ['completed', '종료된 모임'],
    ['cancelled', '취소된 모임'],
  ] as const)('%s cards show their lifecycle without remaining seats or signup hints', (lifecycle, label) => {
    for (const compact of [false, true]) {
      const pastEvent = { ...event, lifecycle };
      const onPress = vi.fn();
      const card = EventCard({ event: pastEvent, compact, onPress });
      expect(visibleText(card)).toContain(label);
      expect(visibleText(card)).not.toContain('남은 자리');
      expect(elements(card).some((element) => element.type === 'SeatMeter')).toBe(false);
      expect(card.props.accessibilityLabel).toContain(label);
      expect(card.props.accessibilityLabel).not.toContain('남은 자리');
      expect(card.props.accessibilityHint).not.toContain('신청');
      card.props.onPress();
      expect(onPress).toHaveBeenCalledWith(pastEvent);
    }
  });

  it.each(['completed', 'cancelled'] as const)('%s cards hide stale pending/approved participation', (lifecycle) => {
    for (const participationStatus of ['pending', 'approved'] as const) {
      const card = EventCard({ event: { ...event, lifecycle }, participationStatus });
      expect(visibleText(card)).not.toMatch(/승인 대기|참여 확정/);
      expect(card.props.accessibilityLabel).not.toMatch(/승인 대기|참여 확정/);
    }
  });

  it('keeps attendance and review history on completed cards', () => {
    for (const [participationStatus, label] of [
      ['attended', '참여 완료'],
      ['reviewed', '후기 작성 완료'],
    ] as const) {
      const card = EventCard({ event, participationStatus });
      expect(visibleText(card)).toContain(label);
      expect(card.props.accessibilityLabel).toContain(label);
    }
  });

  it('preserves date, location and price for past and upcoming events', () => {
    const format = new Intl.DateTimeFormat('ko-KR', {
      month: 'long', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit',
    });
    const date = format.format(new Date(event.startsAt));
    for (const lifecycle of ['completed', 'cancelled', 'upcoming'] as const) {
      const card = EventCard({ event: { ...event, lifecycle } });
      expect(visibleText(card)).toContain(`일시 · ${date}`);
      expect(visibleText(card)).toContain('장소 · 여의나루역');
      expect(visibleText(card)).toContain('5,000원');
      expect(card.props.accessibilityLabel).toContain(date);
      expect(card.props.accessibilityLabel).toContain('여의나루역');
      expect(card.props.accessibilityLabel).toContain('5,000원');
    }
  });

  it.each([
    ['upcoming', 3, 9],
    ['full', 12, 0],
  ] as const)('%s cards preserve capacity and application information', (lifecycle, participantCount, remainingSeats) => {
    const card = EventCard({
      event: { ...event, lifecycle, participantCount },
      participationStatus: 'pending',
    });
    expect(visibleText(card)).toContain(`남은 자리 ${remainingSeats}명`);
    expect(visibleText(card)).toContain('승인 대기');
    expect(card.props.accessibilityLabel).toContain(`남은 자리 ${remainingSeats}명`);
    expect(card.props.accessibilityHint).toContain('신청 방법');
    expect(elements(card).find((element) => element.type === 'SeatMeter')?.props).toMatchObject({
      capacity: 12, participantCount,
    });
  });
});
