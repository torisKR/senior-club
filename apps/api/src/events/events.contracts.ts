import { z } from "zod";

import {
  ApprovalMode,
  AttendanceStatus,
  EventDifficulty,
  EventMemberStatus,
} from "../generated/prisma/client";

const normalizedText = (minimum: number, maximum: number, message: string) =>
  z
    .string()
    .trim()
    .min(minimum, message)
    .max(maximum)
    .transform((value) => value.replace(/\s+/g, " "));

const httpsUrlSchema = z
  .string()
  .trim()
  .max(2_048, "주소가 너무 깁니다.")
  .url("올바른 URL을 입력해 주세요.")
  .refine((value) => new URL(value).protocol === "https:", {
    message: "HTTPS 주소만 사용할 수 있습니다.",
  });

const eventTimestampSchema = z.iso.datetime({
  offset: true,
  error: "ISO 8601 형식의 일시를 입력해 주세요.",
});

const eventFieldsSchema = z.object({
  title: normalizedText(2, 120, "모임 제목은 2자 이상이어야 합니다."),
  description: z
    .string()
    .trim()
    .min(10, "모임 설명은 10자 이상이어야 합니다.")
    .max(5_000, "모임 설명은 5,000자 이하여야 합니다."),
  coverImageUrl: httpsUrlSchema.nullable().optional(),
  locationName: normalizedText(2, 200, "장소명은 2자 이상이어야 합니다."),
  address: normalizedText(2, 300, "주소는 2자 이상이어야 합니다."),
  mapUrl: httpsUrlSchema.nullable().optional(),
  startAt: eventTimestampSchema,
  endAt: eventTimestampSchema.nullable().optional(),
  registrationDeadline: eventTimestampSchema.nullable().optional(),
  capacity: z
    .number()
    .int("정원은 정수여야 합니다.")
    .min(1, "정원은 1명 이상이어야 합니다.")
    .max(500, "정원은 500명 이하여야 합니다."),
  price: z
    .number()
    .int("참가비는 원 단위 정수여야 합니다.")
    .min(0, "참가비는 0원 이상이어야 합니다.")
    .max(10_000_000, "참가비는 1,000만원 이하여야 합니다."),
  difficulty: z.enum(EventDifficulty),
  supplies: z
    .string()
    .trim()
    .max(1_000, "준비물은 1,000자 이하여야 합니다.")
    .nullable()
    .optional(),
  approvalMode: z.enum(ApprovalMode),
});

function validateProvidedSchedule(
  value: {
    startAt?: string | undefined;
    endAt?: string | null | undefined;
    registrationDeadline?: string | null | undefined;
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
      message: "종료 일시는 시작 일시보다 늦어야 합니다.",
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

export const createEventSchema = eventFieldsSchema
  .extend({
    clubId: z.string().trim().min(1).max(128),
    publish: z.boolean().default(false),
  })
  .strict()
  .superRefine(validateProvidedSchedule);

export const updateEventSchema = eventFieldsSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "수정할 모임 정보를 입력해 주세요.",
  })
  .superRefine(validateProvidedSchedule);

export const eventListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().min(8).max(500).optional(),
    view: z.enum(["upcoming", "past", "all"]).default("upcoming"),
    category: z.string().trim().min(1).max(80).optional(),
    region: z.string().trim().min(1).max(80).optional(),
    q: z.string().trim().min(2).max(80).optional(),
  })
  .strict();

export const managedEventListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().min(8).max(500).optional(),
    view: z.enum(["upcoming", "attendance", "drafts"]).default("upcoming"),
  })
  .strict();

export const managedClubListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().min(8).max(500).optional(),
  })
  .strict();

export const leaderApplicationListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().min(8).max(500).optional(),
  })
  .strict();

export const applicationDecisionSchema = z
  .object({
    status: z.enum([
      EventMemberStatus.APPROVED,
      EventMemberStatus.REJECTED,
    ]),
    reason: z.string().trim().min(2).max(500).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.status === EventMemberStatus.REJECTED &&
      !value.reason
    ) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "거절 사유를 2자 이상 입력해 주세요.",
      });
    }
  });

export const attendanceUpdateSchema = z
  .object({
    attendance: z.enum([
      AttendanceStatus.ATTENDED,
      AttendanceStatus.NO_SHOW,
    ]),
    reason: z.string().trim().min(2).max(500).optional(),
  })
  .strict();

export type EventListQuery = z.infer<typeof eventListQuerySchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type ManagedEventListQuery = z.infer<
  typeof managedEventListQuerySchema
>;
export type ManagedClubListQuery = z.infer<typeof managedClubListQuerySchema>;
export type LeaderApplicationListQuery = z.infer<
  typeof leaderApplicationListQuerySchema
>;
export type ApplicationDecisionInput = z.infer<typeof applicationDecisionSchema>;
export type AttendanceUpdateInput = z.infer<typeof attendanceUpdateSchema>;

// Matches the IdempotencyRecord.key VARCHAR(160) database constraint.
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,160}$/;
