import { describe, expect, it } from 'vitest';

import type { ApiChatMessage } from '@/api/chat-api';
import {
  filterBlockedChatMessages,
  hasPendingClientMessage,
  isReportableChatMessage,
  releaseBooleanLock,
  tryAcquireBooleanLock,
} from '@/screens/social/chat-state';

function message(delivery?: ApiChatMessage['delivery']): ApiChatMessage {
  return {
    id: 'message-1',
    roomId: 'room-1',
    userId: 'member-1',
    clientMessageId: '49e84d7e-7251-4f39-8410-7dbb444cf7f9',
    replyToId: null,
    type: 'TEXT',
    message: '안녕하세요.',
    createdAt: '2026-07-30T01:00:00.000Z',
    editedAt: null,
    sender: { id: 'member-1', name: '김회원' },
    attachments: [],
    delivery,
  };
}

describe('chat screen concurrency helpers', () => {
  it('synchronously prevents a second composer submit until released', () => {
    const lock = { current: false };

    expect(tryAcquireBooleanLock(lock)).toBe(true);
    expect(tryAcquireBooleanLock(lock)).toBe(false);
    releaseBooleanLock(lock);
    expect(tryAcquireBooleanLock(lock)).toBe(true);
  });

  it('only treats an optimistic pending row as an unresolved send', () => {
    const clientMessageId = message().clientMessageId!;

    expect(
      hasPendingClientMessage([message('pending')], clientMessageId, 'member-1'),
    ).toBe(true);
    expect(
      hasPendingClientMessage(
        [message(), message('failed')],
        clientMessageId,
        'member-1',
      ),
    ).toBe(
      false,
    );
  });

  it('immediately hides every message authored by a blocked user', () => {
    const visible = message();
    const blocked = {
      ...message(),
      id: 'message-blocked',
      userId: 'member-2',
      sender: { id: 'member-2', name: '박회원' },
    };

    expect(
      filterBlockedChatMessages([visible, blocked], new Set(['member-2'])),
    ).toEqual([visible]);
  });

  it('offers safety actions only for another user\'s non-notice message', () => {
    expect(isReportableChatMessage(message(), 'member-2')).toBe(true);
    expect(isReportableChatMessage(message(), 'member-1')).toBe(false);
    expect(
      isReportableChatMessage({ ...message(), type: 'NOTICE' }, 'member-2'),
    ).toBe(false);
  });
});
