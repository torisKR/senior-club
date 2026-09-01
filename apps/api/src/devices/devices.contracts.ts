import { z } from "zod";

import { DevicePlatform } from "../generated/prisma/client";

export const registerDeviceSchema = z
  .object({
    token: z.string().trim().min(20).max(4_096),
    platform: z.enum(DevicePlatform),
    deviceId: z.string().trim().min(8).max(160).optional(),
    appVersion: z.string().trim().min(1).max(40).optional(),
  })
  .strict();

export const unregisterDeviceSchema = z
  .object({ token: z.string().trim().min(20).max(4_096) })
  .strict();

export const notificationPreferenceSchema = z
  .object({
    pushEnabled: z.boolean().optional(),
    pushEventUpdates: z.boolean().optional(),
    pushChatMessages: z.boolean().optional(),
    emailEventUpdates: z.boolean().optional(),
    emailNewsletter: z.boolean().optional(),
    quietHoursStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
    quietHoursEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "변경할 알림 설정이 필요합니다.",
  });

export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;
export type UnregisterDeviceInput = z.infer<typeof unregisterDeviceSchema>;
export type NotificationPreferenceInput = z.infer<typeof notificationPreferenceSchema>;
