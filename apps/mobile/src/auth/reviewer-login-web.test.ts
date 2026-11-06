import { expect, it, vi } from 'vitest';

import { requestReviewerIdToken } from './reviewer-login';

const loaded = vi.hoisted(() => vi.fn());
vi.mock('@react-native-firebase/app', () => { loaded(); throw new Error('Native Firebase must not load on web'); });
vi.mock('@react-native-firebase/auth', () => { loaded(); throw new Error('Native Firebase must not load on web'); });

it('refuses reviewer authentication on web without importing native Firebase', async () => {
  await expect(requestReviewerIdToken('fixture@example.test', 'fixture')).rejects.toMatchObject({ code: 'REVIEWER_LOGIN_UNSUPPORTED' });
  expect(loaded).not.toHaveBeenCalled();
});
