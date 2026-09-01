import { z } from "zod";

import {
  ReportReason,
  ReportStatus,
  ReportTargetType,
} from "../generated/prisma/client";

/** Maximum number of users one account may block. */
export const MAX_USER_BLOCKS = 500;

/** Stable HTTP 409 error code for a new block attempted at the account limit. */
export const USER_BLOCK_LIMIT_REACHED_CODE = "USER_BLOCK_LIMIT_REACHED";

/** Stable HTTP 409 error code when legacy data already exceeds the block limit. */
export const USER_BLOCK_LIST_OVERFLOW_CODE = "USER_BLOCK_LIST_OVERFLOW";

export const createReportSchema = z
  .object({
    targetType: z.enum(ReportTargetType),
    targetId: z.string().min(1).max(128),
    reason: z.enum(ReportReason),
    detail: z.string().trim().min(2).max(1_000).optional(),
  })
  .strict();

export const resolveReportSchema = z
  .object({
    status: z.enum([
      ReportStatus.IN_REVIEW,
      ReportStatus.RESOLVED,
      ReportStatus.DISMISSED,
    ]),
    resolutionNote: z.string().trim().min(2).max(1_000).optional(),
  })
  .strict();

export const createBlockSchema = z
  .object({
    blockedUserId: z.string().min(1).max(128),
    reason: z.string().trim().min(2).max(500).optional(),
  })
  .strict();

export type CreateReportInput = z.infer<typeof createReportSchema>;
export type ResolveReportInput = z.infer<typeof resolveReportSchema>;
export type CreateBlockInput = z.infer<typeof createBlockSchema>;
