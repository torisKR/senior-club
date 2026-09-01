import { z } from "zod";

const chatCursorSchema = z.string().min(8).max(500);

export const chatRoomListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: chatCursorSchema.optional(),
  })
  .strict();

export const chatMessageListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: chatCursorSchema.optional(),
    after: chatCursorSchema.optional(),
  })
  .strict()
  .superRefine((query, context) => {
    if (query.cursor && query.after) {
      context.addIssue({
        code: "custom",
        path: ["after"],
        message: "cursor와 after는 함께 사용할 수 없습니다.",
      });
    }
  });

export const sendChatMessageSchema = z
  .object({
    clientMessageId: z.string().trim().min(8).max(100),
    message: z.string().trim().min(1).max(2_000),
    replyToId: z.string().min(1).max(128).optional(),
  })
  .strict();

export const joinChatRoomSchema = z
  .object({ roomId: z.string().min(1).max(128) })
  .strict();

export const socketSendMessageSchema = sendChatMessageSchema
  .extend({ roomId: z.string().min(1).max(128) })
  .strict();

export type ChatMessageListQuery = z.infer<typeof chatMessageListQuerySchema>;
export type ChatRoomListQuery = z.infer<typeof chatRoomListQuerySchema>;
export type SendChatMessageInput = z.infer<typeof sendChatMessageSchema>;
