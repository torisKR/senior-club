import { useSyncExternalStore } from 'react';

const EMPTY_BLOCKS: ReadonlySet<string> = new Set();
const blocksByUser = new Map<string, ReadonlySet<string>>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function equalSets(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  if (left.size !== right.size) return false;
  for (const id of left) {
    if (!right.has(id)) return false;
  }
  return true;
}

export function getBlockedUserIds(currentUserId: string | undefined) {
  return currentUserId ? (blocksByUser.get(currentUserId) ?? EMPTY_BLOCKS) : EMPTY_BLOCKS;
}

export function replaceBlockedUserIds(
  currentUserId: string,
  blockedUserIds: Iterable<string>,
) {
  const next = new Set(blockedUserIds);
  const current = getBlockedUserIds(currentUserId);
  if (equalSets(current, next)) return;
  blocksByUser.set(currentUserId, next);
  emit();
}

export function addBlockedUserId(currentUserId: string, blockedUserId: string) {
  const current = getBlockedUserIds(currentUserId);
  if (current.has(blockedUserId)) return;
  blocksByUser.set(currentUserId, new Set([...current, blockedUserId]));
  emit();
}

export function removeBlockedUserId(currentUserId: string, blockedUserId: string) {
  const current = getBlockedUserIds(currentUserId);
  if (!current.has(blockedUserId)) return;
  const next = new Set(current);
  next.delete(blockedUserId);
  blocksByUser.set(currentUserId, next);
  emit();
}

export function subscribeBlockedUserIds(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useBlockedUserIds(currentUserId: string | undefined) {
  return useSyncExternalStore(
    subscribeBlockedUserIds,
    () => getBlockedUserIds(currentUserId),
    () => EMPTY_BLOCKS,
  );
}

export function resetBlockedUsersStoreForTests() {
  blocksByUser.clear();
  emit();
}
