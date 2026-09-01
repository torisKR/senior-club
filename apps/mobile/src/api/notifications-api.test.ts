import { beforeEach, describe, expect, it, vi } from 'vitest';

import { notificationsApi } from './notifications-api';

const clientMocks = vi.hoisted(() => ({ requestJson: vi.fn() }));

vi.mock('@/auth/auth-session-manager', () => ({
  getAuthenticatedHttpClient: () => ({ requestJson: clientMocks.requestJson }),
}));

describe('notificationsApi request contract', () => {
  beforeEach(() => clientMocks.requestJson.mockReset());

  it('loads the first and subsequent keyset pages with authentication', async () => {
    const first = {
      data: [
        {
          id: 'event-cancel:application-1',
          type: 'SYSTEM',
          title: '모임이 취소되었습니다',
          body: '일정을 다시 확인해 주세요.',
          link: '/events/event-1',
          readAt: null,
          createdAt: '2026-07-30T03:00:00.000Z',
        },
      ],
      page: { hasNextPage: true, nextCursor: 'eyJpZCI6IjEifQ' },
    };
    clientMocks.requestJson.mockResolvedValue({ body: first });

    await expect(notificationsApi.list()).resolves.toEqual(first);
    expect(clientMocks.requestJson).toHaveBeenNthCalledWith(
      1,
      '/v1/me/notifications?limit=20',
      { auth: 'required', signal: undefined },
    );

    await expect(notificationsApi.list('eyJpZCI6IjEifQ')).resolves.toEqual(first);
    expect(clientMocks.requestJson).toHaveBeenNthCalledWith(
      2,
      '/v1/me/notifications?limit=20&cursor=eyJpZCI6IjEifQ',
      { auth: 'required', signal: undefined },
    );
  });

  it('rejects malformed or ambiguous notification pages from the server', async () => {
    clientMocks.requestJson
      .mockResolvedValueOnce({
        body: {
          data: [{ id: '../foreign' }],
          page: { hasNextPage: false, nextCursor: null },
        },
      })
      .mockResolvedValueOnce({
        body: {
          data: [],
          page: { hasNextPage: false, nextCursor: 'unexpected-cursor' },
        },
      });

    await expect(notificationsApi.list()).rejects.toThrow(
      '알림 서버 응답 형식이 올바르지 않습니다.',
    );
    await expect(notificationsApi.list()).rejects.toThrow(
      '알림 서버 응답 형식이 올바르지 않습니다.',
    );
  });

  it('rejects untrusted ids and cursors before issuing a request', async () => {
    await expect(notificationsApi.list('../foreign')).rejects.toThrow(
      '알림 목록 위치가 올바르지 않습니다.',
    );
    await expect(notificationsApi.markRead('../foreign')).rejects.toThrow(
      '알림 식별자가 올바르지 않습니다.',
    );
    expect(clientMocks.requestJson).not.toHaveBeenCalled();
  });

  it('marks one notification and all notifications through authenticated endpoints', async () => {
    clientMocks.requestJson
      .mockResolvedValueOnce({ body: { success: true } })
      .mockResolvedValueOnce({ body: { success: true } })
      .mockResolvedValueOnce({ body: { unreadCount: 4 } })
      .mockResolvedValueOnce({ body: { success: true, updatedCount: 3 } });

    await expect(notificationsApi.markRead('notification-1')).resolves.toEqual({
      success: true,
    });
    expect(clientMocks.requestJson).toHaveBeenNthCalledWith(
      1,
      '/v1/me/notifications/notification-1/read',
      { method: 'PATCH', auth: 'required' },
    );

    await expect(
      notificationsApi.markRead('review-request:application-2'),
    ).resolves.toEqual({ success: true });
    expect(clientMocks.requestJson).toHaveBeenNthCalledWith(
      2,
      '/v1/me/notifications/review-request%3Aapplication-2/read',
      { method: 'PATCH', auth: 'required' },
    );

    await expect(notificationsApi.unreadCount()).resolves.toBe(4);
    expect(clientMocks.requestJson).toHaveBeenNthCalledWith(
      3,
      '/v1/me/notifications/unread-count',
      { auth: 'required', signal: undefined },
    );

    await expect(notificationsApi.markAllRead()).resolves.toEqual({
      success: true,
      updatedCount: 3,
    });
    expect(clientMocks.requestJson).toHaveBeenNthCalledWith(
      4,
      '/v1/me/notifications/read-all',
      { method: 'POST', auth: 'required' },
    );
  });
});
