import { z } from "zod";

const normalizedSearchText = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s+/g, " "));

export const clubSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "커뮤니티 주소가 올바르지 않습니다.",
  );

export const clubListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().min(8).max(500).optional(),
    category: clubSlugSchema.optional(),
    region: normalizedSearchText.pipe(z.string().min(1).max(80)).optional(),
    q: normalizedSearchText.pipe(z.string().min(2).max(80)).optional(),
  })
  .strict();

export type ClubListQuery = z.infer<typeof clubListQuerySchema>;

