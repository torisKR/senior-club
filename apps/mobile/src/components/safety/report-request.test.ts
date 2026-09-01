import { describe, expect, it } from 'vitest';

import {
  buildSafetyReportInput,
  safetyReportDuplicateMessage,
  safetyReportSuccessMessage,
} from './report-request';

describe('buildSafetyReportInput', () => {
  it('keeps a content report attached to the content target', () => {
    expect(
      buildSafetyReportInput({
        kind: 'content',
        contentTargetType: 'REVIEW',
        contentTargetId: 'review-1',
        authorUserId: 'member-2',
        reason: 'MISINFORMATION',
        detail: '사실과 다른 내용입니다.',
      }),
    ).toEqual({
      targetType: 'REVIEW',
      targetId: 'review-1',
      reason: 'MISINFORMATION',
      detail: '사실과 다른 내용입니다.',
    });
  });

  it('always attaches a user report to the author and omits an empty detail', () => {
    expect(
      buildSafetyReportInput({
        kind: 'user',
        contentTargetType: 'REVIEW',
        contentTargetId: 'review-1',
        authorUserId: 'member-2',
        reason: 'HARASSMENT',
      }),
    ).toEqual({
      targetType: 'USER',
      targetId: 'member-2',
      reason: 'HARASSMENT',
    });
  });

  it('keeps content and user success and duplicate feedback explicit', () => {
    expect(safetyReportSuccessMessage('content', '후기', '박회원')).toContain(
      '후기 콘텐츠 신고',
    );
    expect(safetyReportSuccessMessage('user', '후기', '박회원')).toContain(
      '박회원 님에 대한 사용자 신고',
    );
    expect(safetyReportDuplicateMessage('content', '박회원')).toBe(
      '이 콘텐츠 신고가 이미 접수되어 확인 중입니다.',
    );
    expect(safetyReportDuplicateMessage('user', '박회원')).toBe(
      '박회원 님에 대한 사용자 신고가 이미 접수되어 확인 중입니다.',
    );
  });
});
