import { z } from "zod";

export const notificationListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().min(8).max(500).optional(),
  })
  .strict();

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
