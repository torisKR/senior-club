import { Inject, Injectable, Logger } from "@nestjs/common";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

import type { ApiEnv } from "../config/env";
import { API_ENV } from "../config/env.module";
import { PrismaService } from "../prisma/prisma.service";

export interface PushSender {
  sendApplicationUpdate(input: {
    userId: string;
    eventId: string;
    eventTitle: string;
    status: string;
  }): Promise<void>;
  sendReviewRequest(input: {
    notificationId: string;
    userId: string;
    eventId: string;
    eventTitle: string;
  }): Promise<void>;
}

export const PUSH_SENDER = Symbol("PUSH_SENDER");

@Injectable()
export class FirebasePushSender implements PushSender {
  private readonly logger = new Logger(FirebasePushSender.name);
  private app: App | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async sendApplicationUpdate(input: {
    userId: string;
    eventId: string;
    eventTitle: string;
    status: string;
  }) {
    const statusLabel =
      input.status === "APPROVED"
        ? "승인됐어요"
        : input.status === "REJECTED"
          ? "결과가 도착했어요"
          : input.status === "CANCELED"
            ? "취소됐어요"
          : "접수됐어요";
    await this.sendEventNotification({
      userId: input.userId,
      title: `모임 신청이 ${statusLabel}`,
      body: input.eventTitle,
      data: {
        type: "event",
        eventId: input.eventId,
        route: `/events/${input.eventId}`,
      },
      collapseKey: `event-application-${input.eventId}`,
    });
  }

  async sendReviewRequest(input: {
    notificationId: string;
    userId: string;
    eventId: string;
    eventTitle: string;
  }) {
    await this.sendEventNotification({
      userId: input.userId,
      title: "모임 후기를 남겨주세요",
      body: input.eventTitle,
      data: {
        type: "REVIEW_REQUEST",
        notificationId: input.notificationId,
        eventId: input.eventId,
        route: `/reviews/new?eventId=${input.eventId}`,
      },
      collapseKey: input.notificationId,
      notificationTag: input.notificationId,
    });
  }

  private async sendEventNotification(input: {
    userId: string;
    title: string;
    body: string;
    data: Record<string, string>;
    collapseKey: string;
    notificationTag?: string;
  }) {
    if (this.env.PUSH_PROVIDER === "disabled") return;
    const preference = await this.prisma.notificationPreference.findUnique({
      where: { userId: input.userId },
      select: { pushEnabled: true, pushEventUpdates: true },
    });
    if (!preference?.pushEnabled || !preference.pushEventUpdates) return;

    const installations = await this.prisma.devicePushToken.findMany({
      where: { userId: input.userId, disabledAt: null },
      select: { id: true, token: true },
      take: 500,
    });
    if (installations.length === 0) return;

    const response = await getMessaging(this.firebaseApp()).sendEachForMulticast({
      tokens: installations.map((entry) => entry.token),
      notification: {
        title: input.title,
        body: input.body,
      },
      data: input.data,
      android: {
        priority: "high",
        collapseKey: input.collapseKey,
        notification: {
          channelId: "event-updates",
          ...(input.notificationTag ? { tag: input.notificationTag } : {}),
        },
      },
    });

    const invalidIds: string[] = [];
    response.responses.forEach((result, index) => {
      const code = result.error?.code;
      if (
        !result.success &&
        (code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token")
      ) {
        const installation = installations[index];
        if (installation) invalidIds.push(installation.id);
      }
    });
    if (invalidIds.length > 0) {
      await this.prisma.devicePushToken.updateMany({
        where: { id: { in: invalidIds } },
        data: { disabledAt: new Date() },
      });
    }
    if (response.failureCount > invalidIds.length) {
      this.logger.warn(
        `FCM partial failure: ${response.failureCount}/${installations.length}`,
      );
    }
  }

  private firebaseApp() {
    if (this.app) return this.app;
    const existing = getApps().find((entry) => entry.name === "senior-club-api");
    if (existing) {
      this.app = existing;
      return existing;
    }
    const encoded = this.env.FCM_SERVICE_ACCOUNT_JSON_BASE64;
    if (!encoded) throw new Error("Firebase service account is not configured");
    const raw = JSON.parse(
      Buffer.from(encoded, "base64").toString("utf8"),
    ) as {
      project_id: string;
      client_email: string;
      private_key: string;
    };
    this.app = initializeApp(
      {
        credential: cert({
          projectId: raw.project_id,
          clientEmail: raw.client_email,
          privateKey: raw.private_key,
        }),
      },
      "senior-club-api",
    );
    return this.app;
  }
}
