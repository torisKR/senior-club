import { describe, expect, it } from 'vitest';

import { shouldShowContentSafetyActions } from './safety-visibility';

describe('shouldShowContentSafetyActions', () => {
  it('hides actions for signed-out and own content, and shows them for another author', () => {
    expect(shouldShowContentSafetyActions('member-2', undefined)).toBe(false);
    expect(shouldShowContentSafetyActions('member-1', 'member-1')).toBe(false);
    expect(shouldShowContentSafetyActions('member-2', 'member-1')).toBe(true);
  });
});
