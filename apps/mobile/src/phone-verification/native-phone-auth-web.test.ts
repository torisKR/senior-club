import { expect, it, vi } from 'vitest';

import { createNativePhoneAuthDriver } from './native-phone-auth';

const native = vi.hoisted(() => ({ getApp: vi.fn() }));
vi.mock('@react-native-firebase/app', () => native);

it('keeps web profile editing independent of native Firebase and explains native verification', async () => {
  await expect(createNativePhoneAuthDriver()).rejects.toMatchObject({ code: 'PHONE_VERIFICATION_NATIVE_UNAVAILABLE' });
  expect(native.getApp).not.toHaveBeenCalled();
});
