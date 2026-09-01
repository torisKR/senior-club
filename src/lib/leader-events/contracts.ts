import { z } from "zod";

const RESOURCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const resourceIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(RESOURCE_ID_PATTERN);

const httpsUrlSchema = z
  .string()
  .trim()
  .max(2_048)
  .url()
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  }, "HTTPS 주소만 사용할 수 있습니다.");

const optionalHttpsUrlSchema = httpsUrlSchema.nullable().optional();

const safeImageUrlSchema = z.string().trim().max(2_048).refine((value) => {
  if (value.startsWith("/") && !value.startsWith("//")) {
    try {
      return !value.split("/").some((segment) => {
        const decoded = decodeURIComponent(segment);
        return (
          decoded === "." ||
          decoded === ".." ||
          /[\\\u0000-\u001f\u007f]/.test(decoded)
        );
      });
    } catch {
      return false;
    }
  }
  return httpsUrlSchema.safeParse(value).success;
});

const optionalDateTimeSchema = z
  .string()
  .datetime({ offset: true })
  .nullable()
  .optional();

export const eventManagementFieldsSchema = z
  .object({
    clubId: resourceIdSchema,
    title: z.string().trim().min(2).max(120),
    description: z.string().trim().min(10).max(5_000),
    coverImageUrl: optionalHttpsUrlSchema,
    locationName: z.string().trim().min(2).max(200),
    address: z.string().trim().min(2).max(300),
    mapUrl: optionalHttpsUrlSchema,
    startAt: z.string().datetime({ offset: true }),
    endAt: optionalDateTimeSchema,
    registrationDeadline: optionalDateTimeSchema,
    capacity: z.number().int().min(1).max(500),
    price: z.number().int().min(0).max(10_000_000),
    difficulty: z.enum(["EASY", "MODERATE", "HARD"]),
    supplies: z.string().trim().max(1_000).nullable().optional(),
    approvalMode: z.enum(["AUTO", "MANUAL"]),
  })
  .strict();

function chronologicalIssues(
  value: {
    startAt?: string;
    endAt?: string | null;
    registrationDeadline?: string | null;
  },
  context: z.RefinementCtx,
) {
  if (
    value.startAt &&
    value.endAt &&
    Date.parse(value.endAt) <= Date.parse(value.startAt)
  ) {
    context.addIssue({
      code: "custom",
      path: ["endAt"],
      message: "종료 일시는 시작 일시보다 뒤여야 합니다.",
    });
  }
  if (
    value.startAt &&
    value.registrationDeadline &&
    Date.parse(value.registrationDeadline) > Date.parse(value.startAt)
  ) {
    context.addIssue({
      code: "custom",
      path: ["registrationDeadline"],
      message: "신청 마감은 시작 일시보다 늦을 수 없습니다.",
    });
  }
}

export const createLeaderEventInputSchema = eventManagementFieldsSchema
  .extend({ publish: z.boolean() })
  .strict()
  .superRefine(chronologicalIssues);

export const updateLeaderEventInputSchema = eventManagementFieldsSchema
  .omit({ clubId: true })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "변경할 모임 정보를 입력해 주세요.",
  })
  .superRefine(chronologicalIssues);

const nullableDateTimeSchema = z.string().datetime({ offset: true }).nullable();

export const managedClubSchema = z.object({
  id: resourceIdSchema,
  slug: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
});

export const managedClubsResponseSchema = z.object({
  data: z.array(managedClubSchema).max(100),
  page: z
    .object({
      nextCursor: z
        .string()
        .min(8)
        .max(500)
        .regex(/^[A-Za-z0-9_-]+$/)
        .nullable(),
      hasNextPage: z.boolean(),
    })
    .refine(
      (page) => page.hasNextPage === Boolean(page.nextCursor),
      "다음 목록 위치 정보가 일치하지 않습니다.",
    ),
});

export const leaderEventDetailSchema = z.object({
  id: resourceIdSchema,
  clubId: resourceIdSchema,
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(5_000),
  coverImageUrl: safeImageUrlSchema.nullable(),
  locationName: z.string().min(1).max(200),
  address: z.string().min(1).max(300),
  mapUrl: httpsUrlSchema.nullable(),
  startAt: z.string().datetime({ offset: true }),
  endAt: nullableDateTimeSchema,
  registrationDeadline: nullableDateTimeSchema,
  capacity: z.number().int().min(1).max(500),
  price: z.number().int().min(0).max(10_000_000),
  currency: z.literal("KRW"),
  difficulty: z.enum(["EASY", "MODERATE", "HARD"]),
  supplies: z.string().max(1_000).nullable(),
  approvalMode: z.enum(["AUTO", "MANUAL"]),
  status: z.enum(["DRAFT", "PUBLISHED", "CLOSED", "COMPLETED", "CANCELED"]),
  club: managedClubSchema,
  updatedAt: z.string().datetime({ offset: true }),
});

export const eventMutationResultSchema = z.object({
  id: resourceIdSchema,
  status: z.enum(["DRAFT", "PUBLISHED", "CLOSED", "COMPLETED", "CANCELED"]),
  updatedAt: z.string().datetime({ offset: true }),
});

export type CreateLeaderEventInput = z.infer<
  typeof createLeaderEventInputSchema
>;
export type UpdateLeaderEventInput = z.infer<
  typeof updateLeaderEventInputSchema
>;
export type ManagedClub = z.infer<typeof managedClubSchema>;
export type LeaderEventDetail = z.infer<typeof leaderEventDetailSchema>;
export type EventMutationResult = z.infer<typeof eventMutationResultSchema>;

export function parseLeaderEventId(value: unknown): string | null {
  return typeof value === "string" && RESOURCE_ID_PATTERN.test(value)
    ? value
    : null;
}
