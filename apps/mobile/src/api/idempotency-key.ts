import { randomUUID } from 'expo-crypto';

import { createIdempotencyKeyFromUuid } from '@/api/idempotency-key-core';

/** Generates a native, cryptographically secure UUID suitable for mutation deduplication. */
export function createNativeIdempotencyKey() {
  return createIdempotencyKeyFromUuid(randomUUID);
}
