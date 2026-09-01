import type { ApiChatMessage } from '@/api/chat-api';

export type BooleanLock = { current: boolean };

export function tryAcquireBooleanLock(lock: BooleanLock) {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function releaseBooleanLock(lock: BooleanLock) {
  lock.current = false;
}

export function hasPendingClientMessage(
  messages: readonly ApiChatMessage[],
  clientMessageId: string,
  userId: string,
) {
  return messages.some(
    (message) =>
      message.clientMessageId === clientMessageId &&
      message.userId === userId &&
      message.delivery === 'pending',
  );
}

export function filterBlockedChatMessages(
  messages: readonly ApiChatMessage[],
  blockedUserIds: ReadonlySet<string>,
) {
  if (blockedUserIds.size === 0) return [...messages];
  return messages.filter((message) => !blockedUserIds.has(message.userId));
}

export function isReportableChatMessage(
  message: Pick<ApiChatMessage, 'type' | 'userId'>,
  currentUserId: string,
) {
  return message.type !== 'NOTICE' && message.userId !== currentUserId;
}
