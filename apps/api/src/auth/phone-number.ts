import { z } from "zod";

const E164_PATTERN = /^\+[1-9]\d{9,14}$/;
const KOREAN_MOBILE_PATTERN = /^01[016789]\d{7,8}$/;

export function normalizePhoneNumber(value: string) {
  const compact = value.trim().replace(/[\s().-]/g, "");
  if (E164_PATTERN.test(compact)) return compact;
  if (KOREAN_MOBILE_PATTERN.test(compact)) {
    return `+82${compact.slice(1)}`;
  }
  throw new z.ZodError([
    {
      code: "custom",
      path: [],
      message: "휴대폰 번호를 010-1234-5678 형식으로 입력해 주세요.",
    },
  ]);
}

export const normalizedPhoneNumber = z
  .string()
  .trim()
  .min(8)
  .max(24)
  .transform(normalizePhoneNumber);
