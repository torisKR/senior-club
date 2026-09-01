const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createIdempotencyKeyFromUuid(generateUuid: () => string) {
  const key = generateUuid();

  if (!UUID_V4_PATTERN.test(key)) {
    throw new TypeError('네이티브 암호 모듈이 올바른 UUID v4를 생성하지 못했습니다.');
  }

  return key;
}
