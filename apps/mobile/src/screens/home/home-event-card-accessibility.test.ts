import { describe, expect, it } from 'vitest';

import { buildHomeEventAccessibilityLabel } from './home-event-card-accessibility';

describe('buildHomeEventAccessibilityLabel', () => {
  it('includes the application status and its explanation for TalkBack users', () => {
    expect(
      buildHomeEventAccessibilityLabel({
        title: '한강 걷기',
        startsAt: '2099-08-10T01:00:00.000Z',
        location: '여의나루역',
        remainingSeats: 12,
        participationStatus: 'pending',
      }),
    ).toContain('신청 접수 · 승인 대기. 리더가 신청 내용을 확인하고 있어요. 아직 참여가 확정된 상태는 아닙니다.');
  });

  it('does not invent an application state for a public event', () => {
    expect(
      buildHomeEventAccessibilityLabel({
        title: '한강 걷기',
        startsAt: '2099-08-10T01:00:00.000Z',
        location: '여의나루역',
        remainingSeats: 12,
      }),
    ).not.toContain('승인 대기');
  });
});
