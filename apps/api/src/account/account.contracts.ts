import { z } from "zod";

export const requestAccountDeletionSchema = z
  .object({
    confirmation: z.literal("계정 삭제", {
      error: "확인을 위해 ‘계정 삭제’를 입력해 주세요.",
    }),
    reason: z.string().trim().min(2).max(500).optional(),
  })
  .strict();

export type RequestAccountDeletionInput = z.infer<
  typeof requestAccountDeletionSchema
>;
