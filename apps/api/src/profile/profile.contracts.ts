import { z } from "zod";

const UNSAFE_PROFILE_TEXT = /[<>\u0000-\u001f\u007f]/u;
const latestAdultBirthYear = new Date().getUTCFullYear() - 18;

function normalizedProfileText(
  label: string,
  minimumLength: number,
  maximumLength: number,
) {
  return z
    .string()
    .trim()
    .min(minimumLength, `${label}은(는) ${minimumLength}자 이상이어야 합니다.`)
    .max(maximumLength, `${label}은(는) ${maximumLength}자 이하여야 합니다.`)
    .refine(
      (value) => !UNSAFE_PROFILE_TEXT.test(value),
      `${label}에 사용할 수 없는 문자가 포함되어 있습니다.`,
    )
    .transform((value) => value.normalize("NFC").replace(/\s+/gu, " "));
}

const interestSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "관심사 식별자가 올바르지 않습니다.",
  );

export const updateProfileSchema = z
  .object({
    name: normalizedProfileText("이름", 2, 40),
    region: normalizedProfileText("지역", 2, 80),
    birthYear: z
      .number()
      .int("출생연도는 정수여야 합니다.")
      .min(1900, "출생연도를 다시 확인해 주세요.")
      .max(latestAdultBirthYear, "만 18세 이상만 가입할 수 있습니다."),
    interestSlugs: z
      .array(interestSlugSchema)
      .min(1, "관심사를 1개 이상 선택해 주세요.")
      .max(3, "관심사는 최대 3개까지 선택할 수 있습니다."),
  })
  .strict()
  .refine(
    ({ interestSlugs }) => new Set(interestSlugs).size === interestSlugs.length,
    {
      path: ["interestSlugs"],
      message: "같은 관심사를 중복해서 선택할 수 없습니다.",
    },
  );

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
