import { Inject, Injectable } from "@nestjs/common";

import type { AuthenticatedPrincipal } from "../auth/auth.contracts";
import type { ApiEnv } from "../config/env";
import { API_ENV } from "../config/env.module";
import { ConsentDocumentType, Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type {
  NotificationPreferenceInput,
  RegisterDeviceInput,
} from "./devices.contracts";

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async register(input: RegisterDeviceInput, principal: AuthenticatedPrincipal) {
    return this.prisma.$transaction(async (transaction) => {
      if (input.deviceId) {
        await transaction.devicePushToken.updateMany({
          where: {
            userId: principal.userId,
            deviceId: input.deviceId,
            token: { not: input.token },
          },
          data: { disabledAt: new Date(), deviceId: null },
        });
      }
      const installation = await transaction.devicePushToken.upsert({
        where: { token: input.token },
        update: {
          userId: principal.userId,
          platform: input.platform,
          deviceId: input.deviceId ?? null,
          appVersion: input.appVersion ?? null,
          enabledAt: new Date(),
          disabledAt: null,
          lastSeenAt: new Date(),
        },
        create: {
          userId: principal.userId,
          token: input.token,
          platform: input.platform,
          ...(input.deviceId ? { deviceId: input.deviceId } : {}),
          ...(input.appVersion ? { appVersion: input.appVersion } : {}),
        },
        select: {
          id: true,
          platform: true,
          deviceId: true,
          appVersion: true,
          enabledAt: true,
        },
      });
      await transaction.notificationPreference.upsert({
        where: { userId: principal.userId },
        update: { pushEnabled: true },
        create: { userId: principal.userId, pushEnabled: true },
      });
      return {
        ...installation,
        enabledAt: installation.enabledAt.toISOString(),
      };
    });
  }

  async unregister(token: string, principal: AuthenticatedPrincipal) {
    await this.prisma.devicePushToken.updateMany({
      where: { token, userId: principal.userId, disabledAt: null },
      data: { disabledAt: new Date() },
    });
    return { success: true as const };
  }

  async preferences(principal: AuthenticatedPrincipal) {
    return this.prisma.notificationPreference.upsert({
      where: { userId: principal.userId },
      update: {},
      create: { userId: principal.userId },
    });
  }

  async updatePreferences(
    input: NotificationPreferenceInput,
    principal: AuthenticatedPrincipal,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const preferenceData: Prisma.NotificationPreferenceUpdateInput = {};
      if (input.pushEnabled !== undefined) preferenceData.pushEnabled = input.pushEnabled;
      if (input.pushEventUpdates !== undefined) preferenceData.pushEventUpdates = input.pushEventUpdates;
      if (input.pushChatMessages !== undefined) preferenceData.pushChatMessages = input.pushChatMessages;
      if (input.emailEventUpdates !== undefined) preferenceData.emailEventUpdates = input.emailEventUpdates;
      if (input.emailNewsletter !== undefined) preferenceData.emailNewsletter = input.emailNewsletter;
      if (input.quietHoursStart !== undefined) preferenceData.quietHoursStart = input.quietHoursStart;
      if (input.quietHoursEnd !== undefined) preferenceData.quietHoursEnd = input.quietHoursEnd;
      const preference = await transaction.notificationPreference.upsert({
        where: { userId: principal.userId },
        update: preferenceData,
        create: {
          userId: principal.userId,
          pushEnabled: input.pushEnabled ?? false,
          pushEventUpdates: input.pushEventUpdates ?? true,
          pushChatMessages: input.pushChatMessages ?? true,
          emailEventUpdates: input.emailEventUpdates ?? true,
          emailNewsletter: input.emailNewsletter ?? false,
          quietHoursStart: input.quietHoursStart ?? null,
          quietHoursEnd: input.quietHoursEnd ?? null,
        },
      });
      if (input.emailNewsletter !== undefined) {
        const now = new Date();
        await transaction.consentRecord.upsert({
          where: {
            userId_documentType_version: {
              userId: principal.userId,
              documentType: ConsentDocumentType.MARKETING_EMAIL,
              version: this.env.CONSENT_DOCUMENT_VERSION,
            },
          },
          update: {
            granted: input.emailNewsletter,
            recordedAt: now,
            withdrawnAt: input.emailNewsletter ? null : now,
          },
          create: {
            userId: principal.userId,
            documentType: ConsentDocumentType.MARKETING_EMAIL,
            version: this.env.CONSENT_DOCUMENT_VERSION,
            granted: input.emailNewsletter,
            source: "settings",
            withdrawnAt: input.emailNewsletter ? null : now,
          },
        });
      }
      return preference;
    });
  }
}
