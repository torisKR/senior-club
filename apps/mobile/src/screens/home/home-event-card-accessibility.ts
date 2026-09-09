import type { ParticipationStatus } from '@/types';

import { participationDescriptions, participationLabels } from '../discovery/discovery-utils';

const eventDateFormatter = new Intl.DateTimeFormat('ko-KR', {
  month: 'long',
  day: 'numeric',
  weekday: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

export interface HomeEventAccessibilityInput {
  title: string;
  startsAt: string;
  location: string;
  remainingSeats: number;
  participationStatus?: ParticipationStatus;
}

export function formatHomeEventDate(value: string) {
  return eventDateFormatter.format(new Date(value));
}

export function buildHomeEventAccessibilityLabel({
  title,
  startsAt,
  location,
  remainingSeats,
  participationStatus,
}: HomeEventAccessibilityInput) {
  const status = participationStatus
    ? `${participationLabels[participationStatus]}. ${participationDescriptions[participationStatus]}`
    : undefined;

  return [
    title,
    formatHomeEventDate(startsAt),
    location,
    `남은 자리 ${remainingSeats}명`,
    status,
  ]
    .filter(Boolean)
    .join(', ');
}
