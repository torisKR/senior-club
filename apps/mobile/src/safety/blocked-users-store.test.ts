import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  addBlockedUserId,
  getBlockedUserIds,
  removeBlockedUserId,
  replaceBlockedUserIds,
  resetBlockedUsersStoreForTests,
  subscribeBlockedUserIds,
} from './blocked-users-store';

describe('blocked users session store', () => {
  afterEach(() => resetBlockedUsersStoreForTests());

  it('isolates users and applies immediate add, authoritative replace, and removal', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeBlockedUserIds(listener);

    addBlockedUserId('member-1', 'blocked-1');
    expect([...getBlockedUserIds('member-1')]).toEqual(['blocked-1']);
    expect(getBlockedUserIds('member-2').size).toBe(0);

    replaceBlockedUserIds('member-1', ['blocked-1', 'blocked-2', 'blocked-2']);
    expect([...getBlockedUserIds('member-1')]).toEqual(['blocked-1', 'blocked-2']);

    removeBlockedUserId('member-1', 'blocked-1');
    expect([...getBlockedUserIds('member-1')]).toEqual(['blocked-2']);
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
  });
});
