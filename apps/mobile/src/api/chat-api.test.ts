import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CHAT_MESSAGE_PAGE_SIZE,
  CHAT_ROOM_PAGE_SIZE,
  CHAT_FULL_RECONCILE_INTERVAL_MS,
  CHAT_MAX_DELTA_PAGES,
  CHAT_POLL_INTERVAL_MS,
  chatApi,
  drainChatMessageDelta,
  isChatRoomUnread,
  mergeChatMessages,
  reconcileLatestChatMessages,
  type ApiChatMessage,
  type ApiChatRoom,
} from '@/api/chat-api';

const clientMocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock('@/auth/auth-session-manager', () => ({
  getAuthenticatedHttpClient: () => ({ requestJson: clientMocks.request }),
}));

const clientMessageId = '49e84d7e-7251-4f39-8410-7dbb444cf7f9';

function message(overrides: Partial<ApiChatMessage> = {}): ApiChatMessage {
  return {
    id: 'message-1',
    roomId: 'room-1',
    userId: 'member-1',
    clientMessageId,
    replyToId: null,
    type: 'TEXT',
    message: '토요일 모임에서 뵙겠습니다.',
    createdAt: '2026-07-30T01:00:00.000Z',
    editedAt: null,
    sender: { id: 'member-1', name: '김회원', avatarUrl: null },
    attachments: [],
    ...overrides,
  };
}

function room(overrides: Partial<ApiChatRoom> = {}): ApiChatRoom {
  return {
    id: 'room-1',
    activityAt: '2026-07-30T01:00:00.000Z',
    joinedAt: '2026-07-29T01:00:00.000Z',
    mutedAt: null,
    lastReadAt: null,
    event: {
      id: 'event-1',
      title: '남산 숲길 걷기',
      startAt: '2026-08-01T01:00:00.000Z',
      locationName: '남산 둘레길 입구',
      club: { title: '숲길을 걷는 사람들', slug: 'forest-walkers' },
    },
    lastMessage: {
      id: 'message-1',
      message: '토요일 모임에서 뵙겠습니다.',
      type: 'TEXT',
      createdAt: '2026-07-30T01:00:00.000Z',
      sender: { id: 'member-2', name: '박회원' },
    },
    ...overrides,
  };
}

describe('chatApi request contract', () => {
  beforeEach(() => clientMocks.request.mockReset());

  it('uses the bounded 50-message page and 20-second polling budget', () => {
    expect(CHAT_MESSAGE_PAGE_SIZE).toBe(50);
    expect(CHAT_ROOM_PAGE_SIZE).toBe(50);
    expect(CHAT_POLL_INTERVAL_MS).toBe(20_000);
    expect(CHAT_FULL_RECONCILE_INTERVAL_MS).toBe(300_000);
    expect(CHAT_MAX_DELTA_PAGES).toBe(3);
  });

  it('loads only authenticated entitled rooms', async () => {
    const page = {
      data: [room()],
      page: { hasNextPage: true, nextCursor: 'rooms_CURSOR_123' },
    };
    clientMocks.request.mockResolvedValue({ body: page });

    await expect(chatApi.rooms()).resolves.toEqual(page);
    expect(clientMocks.request).toHaveBeenCalledWith(
      `/v1/chat/rooms?limit=${CHAT_ROOM_PAGE_SIZE}`,
      {
      auth: 'required',
      signal: undefined,
      },
    );

    clientMocks.request.mockResolvedValue({
      body: { data: [], page: { hasNextPage: false, nextCursor: null } },
    });
    await chatApi.rooms({ cursor: 'rooms_CURSOR_123' });
    expect(clientMocks.request).toHaveBeenLastCalledWith(
      `/v1/chat/rooms?limit=${CHAT_ROOM_PAGE_SIZE}&cursor=rooms_CURSOR_123`,
      { auth: 'required', signal: undefined },
    );
  });

  it('loads a 50-message cursor page and forwards cancellation', async () => {
    const controller = new AbortController();
    clientMocks.request.mockResolvedValue({
      body: {
        data: [message()],
        page: {
          hasNextPage: true,
          nextCursor: 'cursor_CHAT_123',
          nextAfter: null,
        },
      },
    });

    await chatApi.messages('room-1', {
      cursor: 'cursor_CHAT_123',
      signal: controller.signal,
    });

    expect(clientMocks.request).toHaveBeenCalledWith(
      `/v1/chat/rooms/room-1/messages?limit=${CHAT_MESSAGE_PAGE_SIZE}&cursor=cursor_CHAT_123`,
      { auth: 'required', signal: controller.signal },
    );
  });

  it('loads only messages after an opaque polling watermark', async () => {
    const controller = new AbortController();
    clientMocks.request.mockResolvedValue({
      body: {
        data: [message()],
        page: {
          hasNextPage: false,
          nextCursor: null,
          nextAfter: 'after_CHAT_1234',
        },
      },
    });

    await chatApi.messages('room-1', {
      after: 'after_CHAT_0000',
      signal: controller.signal,
    });

    expect(clientMocks.request).toHaveBeenCalledWith(
      `/v1/chat/rooms/room-1/messages?limit=${CHAT_MESSAGE_PAGE_SIZE}&after=after_CHAT_0000`,
      { auth: 'required', signal: controller.signal },
    );
  });

  it('drains at most three advancing delta pages and returns the continuation watermark', async () => {
    const pages = [1, 2, 3].map((number) => ({
      body: {
        data: [
          message({
            id: `message-${number}`,
            clientMessageId: null,
            createdAt: `2026-07-30T01:0${number}:00.000Z`,
          }),
        ],
        page: {
          hasNextPage: true,
          nextCursor: null,
          nextAfter: `after_CHAT_page_${number}`,
        },
      },
    }));
    clientMocks.request
      .mockResolvedValueOnce(pages[0])
      .mockResolvedValueOnce(pages[1])
      .mockResolvedValueOnce(pages[2]);

    const result = await drainChatMessageDelta('room-1', 'after_CHAT_page_0');

    expect(result.data.map(({ id }) => id)).toEqual([
      'message-1',
      'message-2',
      'message-3',
    ]);
    expect(result.page).toEqual(pages[2].body.page);
    expect(clientMocks.request).toHaveBeenCalledTimes(CHAT_MAX_DELTA_PAGES);
    expect(clientMocks.request.mock.calls.map(([path]) => path)).toEqual([
      `/v1/chat/rooms/room-1/messages?limit=${CHAT_MESSAGE_PAGE_SIZE}&after=after_CHAT_page_0`,
      `/v1/chat/rooms/room-1/messages?limit=${CHAT_MESSAGE_PAGE_SIZE}&after=after_CHAT_page_1`,
      `/v1/chat/rooms/room-1/messages?limit=${CHAT_MESSAGE_PAGE_SIZE}&after=after_CHAT_page_2`,
    ]);
  });

  it('sends trimmed text with the caller UUID and reuses it on retry', async () => {
    clientMocks.request.mockResolvedValue({ body: message() });
    const input = {
      clientMessageId,
      message: '  토요일 모임에서 뵙겠습니다.  ',
    };

    await chatApi.send('room-1', input);
    await chatApi.send('room-1', input);

    const expected = [
      '/v1/chat/rooms/room-1/messages',
      {
        method: 'POST',
        auth: 'required',
        json: { clientMessageId, message: '토요일 모임에서 뵙겠습니다.' },
        signal: undefined,
      },
    ];
    expect(clientMocks.request.mock.calls[0]).toEqual(expected);
    expect(clientMocks.request.mock.calls[1]).toEqual(expected);
  });

  it('marks the selected room read through the protected endpoint', async () => {
    clientMocks.request.mockResolvedValue({
      body: { success: true, lastReadAt: '2026-07-30T02:00:00.000Z' },
    });

    await chatApi.markRead('room-1');

    expect(clientMocks.request).toHaveBeenCalledWith('/v1/chat/rooms/room-1/read', {
      method: 'PATCH',
      auth: 'required',
      signal: undefined,
    });
  });

  it('rejects unsafe identifiers, cursors, UUIDs, and empty messages before networking', async () => {
    await expect(chatApi.rooms({ cursor: '../rooms' })).rejects.toThrow(
      '대화방 목록 위치가 올바르지 않습니다.',
    );
    await expect(chatApi.messages('../room')).rejects.toThrow(
      '채팅방 식별자가 올바르지 않습니다.',
    );
    await expect(
      chatApi.messages('room-1', { cursor: '../cursor' }),
    ).rejects.toThrow('채팅 목록 위치가 올바르지 않습니다.');
    await expect(
      chatApi.send('room-1', { clientMessageId: 'not-a-uuid', message: '안녕하세요' }),
    ).rejects.toThrow('메시지 요청 식별자가 올바르지 않습니다.');
    await expect(
      chatApi.send('room-1', { clientMessageId, message: '   ' }),
    ).rejects.toThrow('메시지는 1자 이상 2000자 이하여야 합니다.');
    expect(clientMocks.request).not.toHaveBeenCalled();
  });

  it('rejects malformed room, message, and read responses instead of trusting JSON casts', async () => {
    clientMocks.request
      .mockResolvedValueOnce({
        body: {
          data: [{ id: 'room-without-event' }],
          page: { hasNextPage: false, nextCursor: null },
        },
      })
      .mockResolvedValueOnce({
        body: {
          data: [{ id: 'message-without-sender' }],
          page: { hasNextPage: false, nextCursor: null, nextAfter: 'after_CHAT_1234' },
        },
      })
      .mockResolvedValueOnce({ body: { success: true, lastReadAt: 'not-a-date' } });

    await expect(chatApi.rooms()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    await expect(chatApi.messages('room-1')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
    await expect(chatApi.markRead('room-1')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('fails closed on unsafe IDs, cross-room messages, unknown keys, and wrong ordering', async () => {
    clientMocks.request
      .mockResolvedValueOnce({
        body: {
          data: [room({ id: '../unsafe-room' })],
          page: { hasNextPage: false, nextCursor: null },
        },
      })
      .mockResolvedValueOnce({
        body: {
          data: [message({ roomId: 'room-2' })],
          page: {
            hasNextPage: false,
            nextCursor: null,
            nextAfter: 'after_CHAT_1234',
          },
        },
      })
      .mockResolvedValueOnce({
        body: {
          data: [{ ...message(), unexpected: 'field' }],
          page: {
            hasNextPage: false,
            nextCursor: null,
            nextAfter: 'after_CHAT_1234',
          },
        },
      })
      .mockResolvedValueOnce({
        body: {
          data: [
            message({ id: 'message-older', createdAt: '2026-07-30T00:00:00.000Z' }),
            message({ id: 'message-newer', createdAt: '2026-07-30T01:00:00.000Z' }),
          ],
          page: {
            hasNextPage: false,
            nextCursor: null,
            nextAfter: 'after_CHAT_1234',
          },
        },
      });

    await expect(chatApi.rooms()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    await expect(chatApi.messages('room-1')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
    await expect(chatApi.messages('room-1')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
    await expect(chatApi.messages('room-1')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('rejects unordered room pages and impossible empty continuation pages', async () => {
    clientMocks.request
      .mockResolvedValueOnce({
        body: {
          data: [
            room({ id: 'room-older', activityAt: '2026-07-30T01:00:00.000Z' }),
            room({ id: 'room-newer', activityAt: '2026-07-30T02:00:00.000Z' }),
          ],
          page: { hasNextPage: false, nextCursor: null },
        },
      })
      .mockResolvedValueOnce({
        body: {
          data: [],
          page: { hasNextPage: true, nextCursor: 'rooms_CURSOR_123' },
        },
      });

    await expect(chatApi.rooms()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    await expect(chatApi.rooms()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('rejects mixed cursor directions and malformed delta page tokens', async () => {
    await expect(
      chatApi.messages('room-1', {
        cursor: 'cursor_CHAT_123',
        after: 'after_CHAT_1234',
      }),
    ).rejects.toThrow('이전 대화 위치와 새 대화 위치를 함께 보낼 수 없습니다.');

    clientMocks.request.mockResolvedValue({
      body: {
        data: [message()],
        page: { hasNextPage: true, nextCursor: null, nextAfter: null },
      },
    });
    await expect(
      chatApi.messages('room-1', { after: 'after_CHAT_1234' }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});

describe('chat state helpers', () => {
  it('deduplicates server pages and replaces an optimistic message by clientMessageId', () => {
    const optimistic = message({
      id: `optimistic:${clientMessageId}`,
      createdAt: '2026-07-30T00:59:59.000Z',
      delivery: 'pending',
    });
    const confirmed = message();
    const older = message({
      id: 'message-older',
      clientMessageId: null,
      createdAt: '2026-07-29T23:00:00.000Z',
    });
    const otherUserCollision = message({
      id: 'message-other-user',
      userId: 'member-2',
      createdAt: '2026-07-30T00:30:00.000Z',
      sender: { id: 'member-2', name: '박회원' },
    });

    expect(
      mergeChatMessages(
        [optimistic, older, otherUserCollision],
        [confirmed, older],
      ),
    ).toEqual([older, otherUserCollision, confirmed]);
  });

  it('computes unread state without inventing an unread count', () => {
    expect(isChatRoomUnread(room(), 'member-1')).toBe(true);
    expect(
      isChatRoomUnread(
        room({ lastReadAt: '2026-07-30T02:00:00.000Z' }),
        'member-1',
      ),
    ).toBe(false);
    expect(
      isChatRoomUnread(
        room({
          lastMessage: {
            ...room().lastMessage!,
            sender: { id: 'member-1', name: '김회원' },
          },
        }),
        'member-1',
      ),
    ).toBe(false);
  });

  it('reconciles the latest server window and removes no-longer-visible rows', () => {
    const older = message({
      id: 'message-older',
      clientMessageId: null,
      createdAt: '2026-07-29T23:00:00.000Z',
    });
    const removedRecent = message({
      id: 'message-removed',
      clientMessageId: null,
      createdAt: '2026-07-30T01:01:00.000Z',
    });
    const incoming = message({
      id: 'message-latest',
      clientMessageId: null,
      createdAt: '2026-07-30T01:00:00.000Z',
    });
    const pending = message({
      id: `optimistic:${clientMessageId}`,
      createdAt: '2026-07-30T01:02:00.000Z',
      delivery: 'pending',
    });

    expect(
      reconcileLatestChatMessages(
        [older, removedRecent, pending],
        [incoming],
        { hasNextPage: true, replace: false },
      ),
    ).toEqual([older, incoming, pending]);

    expect(
      reconcileLatestChatMessages(
        [older, removedRecent, pending],
        [incoming],
        { hasNextPage: true, replace: true },
      ),
    ).toEqual([incoming, pending]);
  });
});
