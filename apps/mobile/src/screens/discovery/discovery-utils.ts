import type { Event, ParticipationStatus } from '@/types';

export const difficultyLabels: Record<Event['difficulty'], string> = {
  easy: '쉬움',
  moderate: '보통',
  challenging: '도전',
};

export const participationLabels: Record<ParticipationStatus, string> = {
  pending: '신청 접수 · 승인 대기',
  approved: '참여 확정',
  attended: '참여 완료 · 후기 작성 가능',
  reviewed: '참여 완료 · 후기 작성 완료',
};

export const participationDescriptions: Record<ParticipationStatus, string> = {
  pending: '리더가 신청 내용을 확인하고 있어요. 아직 참여가 확정된 상태는 아닙니다.',
  approved: '리더가 신청을 승인했어요. 일정과 준비물을 다시 확인해 주세요.',
  attended: '함께한 모임의 후기를 남길 수 있어요.',
  reviewed: '후기를 남겨 주셔서 감사합니다.',
};

export function formatEventDate(value: string, includeYear = false) {
  return new Intl.DateTimeFormat('ko-KR', {
    ...(includeYear ? { year: 'numeric' as const } : {}),
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatEventTimeRange(startsAt: string, endsAt: string) {
  const start = formatEventDate(startsAt, true);
  const end = new Intl.DateTimeFormat('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(endsAt));
  return `${start} ~ ${end}`;
}

export function formatPrice(price: number) {
  return price === 0 ? '무료' : `${price.toLocaleString('ko-KR')}원`;
}

export function remainingSeats(event: Event) {
  return Math.max(0, event.capacity - event.participantCount);
}

export function isEventOpen(event: Event) {
  return event.lifecycle === 'upcoming' && remainingSeats(event) > 0;
}

export function matchesEventQuery(event: Event, query: string, clubTitle: string) {
  const keyword = query.trim().toLocaleLowerCase('ko-KR');
  if (!keyword) return true;

  return [event.title, event.summary, event.location, event.address, clubTitle]
    .join(' ')
    .toLocaleLowerCase('ko-KR')
    .includes(keyword);
}
