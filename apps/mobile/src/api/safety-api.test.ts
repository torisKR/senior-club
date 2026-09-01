import { beforeEach, describe, expect, it, vi } from 'vitest';

import { REPORT_REASONS, safetyApi } from '@/api/safety-api';

const clientMocks = vi.hoisted(() => ({
  requestJson: vi.fn(),
}));

vi.mock('@/auth/auth-session-manager', () => ({
  getAuthenticatedHttpClient: () => ({ requestJson: clientMocks.requestJson }),
}));

const createdAt = '2026-07-30T03:00:00.000Z';

function block(overrides: Record<string, unknown> = {}) {
  return {
    id: 'block-1',
    blockedUser: {
      id: 'member-2',
      name: '박회원',
      avatarUrl: null,
    },
    createdAt,
    ...overrides,
  };
}

describe('safetyApi', () => {
  beforeEach(() => {
    clientMocks.requestJson.mockReset();
  });

  it('reports content with the exact API enum and trimmed optional detail', async () => {
    clientMocks.requestJson.mockResolvedValue({
      body: { id: 'report-1', status: 'OPEN', createdAt },
    });

    await expect(
      safetyApi.report({
        targetType: 'REVIEW',
        targetId: 'review-1',
        reason: 'HARASSMENT',
        detail: '  반복해서 모욕적인 표현을 사용합니다.  ',
      }),
    ).resolves.toEqual({ id: 'report-1', status: 'OPEN', createdAt });
    expect(clientMocks.requestJson).toHaveBeenCalledWith('/v1/reports', {
      method: 'POST',
      auth: 'required',
      json: {
        targetType: 'REVIEW',
        targetId: 'review-1',
        reason: 'HARASSMENT',
        detail: '반복해서 모욕적인 표현을 사용합니다.',
      },
      signal: undefined,
    });
    expect(REPORT_REASONS).toEqual([
      'SPAM',
      'ABUSE',
      'HARASSMENT',
      'MISINFORMATION',
      'INAPPROPRIATE',
      'OTHER',
    ]);
  });

  it('omits blank optional report detail instead of sending an invalid empty string', async () => {
    clientMocks.requestJson.mockResolvedValue({
      body: { id: 'report-1', status: 'OPEN', createdAt },
    });

    await safetyApi.report({
      targetType: 'REVIEW',
      targetId: 'review-1',
      reason: 'SPAM',
      detail: '   ',
    });

    expect(clientMocks.requestJson.mock.calls[0]![1].json).toEqual({
      targetType: 'REVIEW',
      targetId: 'review-1',
      reason: 'SPAM',
    });
  });

  it('loads a strictly validated, unique, newest-first block list', async () => {
    clientMocks.requestJson.mockResolvedValue({
      body: [
        block(),
        block({
          id: 'block-2',
          blockedUser: {
            id: 'member-3',
            name: '김회원',
            avatarUrl: 'https://cdn.example.com/avatar/member-3.png',
          },
          createdAt: '2026-07-29T03:00:00.000Z',
        }),
      ],
    });

    await expect(safetyApi.blocks()).resolves.toHaveLength(2);
    expect(clientMocks.requestJson).toHaveBeenCalledWith('/v1/me/blocks', {
      auth: 'required',
      signal: undefined,
    });
  });

  it('creates and removes a block only for the requested safe user id', async () => {
    clientMocks.requestJson
      .mockResolvedValueOnce({
        body: {
          id: 'block-1',
          blockedUser: { id: 'member-2', name: '박회원' },
          createdAt,
        },
      })
      .mockResolvedValueOnce({ body: { success: true } });

    await expect(
      safetyApi.block({ blockedUserId: 'member-2', reason: '  원치 않는 연락입니다.  ' }),
    ).resolves.toMatchObject({ blockedUser: { id: 'member-2' } });
    await expect(safetyApi.unblock('member-2')).resolves.toBeUndefined();

    expect(clientMocks.requestJson).toHaveBeenNthCalledWith(1, '/v1/me/blocks', {
      method: 'POST',
      auth: 'required',
      json: { blockedUserId: 'member-2', reason: '원치 않는 연락입니다.' },
      signal: undefined,
    });
    expect(clientMocks.requestJson).toHaveBeenNthCalledWith(
      2,
      '/v1/me/blocks/member-2',
      { method: 'DELETE', auth: 'required', signal: undefined },
    );
  });

  it.each([
    {
      label: 'unknown report response fields',
      action: () => safetyApi.report({ targetType: 'REVIEW', targetId: 'review-1', reason: 'OTHER' }),
      body: { id: 'report-1', status: 'OPEN', createdAt, leaked: true },
    },
    {
      label: 'a mismatched block target',
      action: () => safetyApi.block({ blockedUserId: 'member-2' }),
      body: {
        id: 'block-1',
        blockedUser: { id: 'member-3', name: '다른 회원' },
        createdAt,
      },
    },
    {
      label: 'unknown unblock fields',
      action: () => safetyApi.unblock('member-2'),
      body: { success: true, deleted: 1 },
    },
    {
      label: 'unknown block-list fields',
      action: () => safetyApi.blocks(),
      body: [{ ...block(), reason: 'private server field' }],
    },
    {
      label: 'duplicate blocked users',
      action: () => safetyApi.blocks(),
      body: [block(), block({ id: 'block-2' })],
    },
    {
      label: 'out-of-order block pages',
      action: () => safetyApi.blocks(),
      body: [
        block({ createdAt: '2026-07-29T03:00:00.000Z' }),
        block({
          id: 'block-2',
          blockedUser: { id: 'member-3', name: '김회원', avatarUrl: null },
          createdAt,
        }),
      ],
    },
  ])('fails closed for $label', async ({ action, body }) => {
    clientMocks.requestJson.mockResolvedValue({ body });
    await expect(action()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('rejects invalid IDs, reasons, and one-character details before networking', async () => {
    await expect(
      safetyApi.report({
        targetType: 'REVIEW',
        targetId: '../review',
        reason: 'SPAM',
      }),
    ).rejects.toThrow('신고 대상 식별자가 올바르지 않습니다.');
    await expect(
      safetyApi.report({
        targetType: 'REVIEW',
        targetId: 'review-1',
        reason: 'PHISHING' as 'SPAM',
      }),
    ).rejects.toThrow('신고 이유가 올바르지 않습니다.');
    await expect(
      safetyApi.report({
        targetType: 'REVIEW',
        targetId: 'review-1',
        reason: 'OTHER',
        detail: '한',
      }),
    ).rejects.toThrow('신고 상세 내용은 2자 이상 1000자 이하여야 합니다.');
    await expect(safetyApi.unblock('member/2')).rejects.toThrow(
      '차단 해제 회원 식별자가 올바르지 않습니다.',
    );
    expect(clientMocks.requestJson).not.toHaveBeenCalled();
  });

  it('rejects unknown or missing request fields before networking', async () => {
    await expect(
      safetyApi.report({
        targetType: 'REVIEW',
        targetId: 'review-1',
        reason: 'SPAM',
        leaked: true,
      } as never),
    ).rejects.toThrow('신고 요청에 알 수 없는 leaked 필드가 있습니다.');
    await expect(
      safetyApi.block({ reason: '원치 않는 연락입니다.' } as never),
    ).rejects.toThrow('차단 요청에 blockedUserId 필드가 필요합니다.');
    expect(clientMocks.requestJson).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 123])(
    'rejects the non-string runtime ID %s before networking',
    async (unsafeId) => {
      await expect(
        safetyApi.report({
          targetType: 'REVIEW',
          targetId: unsafeId,
          reason: 'SPAM',
        } as never),
      ).rejects.toThrow('신고 대상 식별자가 올바르지 않습니다.');
      await expect(
        safetyApi.block({ blockedUserId: unsafeId } as never),
      ).rejects.toThrow('차단 회원 식별자가 올바르지 않습니다.');
      await expect(safetyApi.unblock(unsafeId as never)).rejects.toThrow(
        '차단 해제 회원 식별자가 올바르지 않습니다.',
      );
      expect(clientMocks.requestJson).not.toHaveBeenCalled();
    },
  );
});
