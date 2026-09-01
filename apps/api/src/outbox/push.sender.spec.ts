import { beforeEach, describe, expect, it, vi } from "vitest";

const firebase = vi.hoisted(() => ({
  cert: vi.fn(),
  getApps: vi.fn(),
  initializeApp: vi.fn(),
  sendEachForMulticast: vi.fn(),
}));

vi.mock("firebase-admin/app", () => ({
  cert: firebase.cert,
  getApps: firebase.getApps,
  initializeApp: firebase.initializeApp,
}));

vi.mock("firebase-admin/messaging", () => ({
  getMessaging: () => ({
    sendEachForMulticast: firebase.sendEachForMulticast,
  }),
}));

import type { ApiEnv } from "../config/env";
import type { PrismaService } from "../prisma/prisma.service";
import { FirebasePushSender } from "./push.sender";

function encodedServiceAccount() {
  return Buffer.from(
    JSON.stringify({
      project_id: "senior-club-test",
      client_email: "firebase@example.com",
      private_key: "test-private-key",
    }),
    "utf8",
  ).toString("base64");
}

function createHarness(options: { pushEnabled?: boolean } = {}) {
  const preferenceFind = vi.fn().mockResolvedValue({
    pushEnabled: options.pushEnabled ?? true,
    pushEventUpdates: true,
  });
  const tokenFind = vi.fn().mockResolvedValue([
    { id: "installation-1", token: "fcm-token-1" },
    { id: "installation-2", token: "fcm-token-2" },
  ]);
  const tokenUpdate = vi.fn().mockResolvedValue({ count: 0 });
  const prisma = {
    notificationPreference: { findUnique: preferenceFind },
    devicePushToken: { findMany: tokenFind, updateMany: tokenUpdate },
  } as unknown as PrismaService;
  const env = {
    PUSH_PROVIDER: "fcm",
    FCM_SERVICE_ACCOUNT_JSON_BASE64: encodedServiceAccount(),
  } as unknown as ApiEnv;

  return {
    sender: new FirebasePushSender(prisma, env),
    preferenceFind,
    tokenFind,
    tokenUpdate,
  };
}

describe("FirebasePushSender review requests", () => {
  beforeEach(() => {
    firebase.getApps.mockReturnValue([]);
    firebase.cert.mockReturnValue({});
    firebase.initializeApp.mockReturnValue({ name: "senior-club-api" });
    firebase.sendEachForMulticast.mockResolvedValue({
      failureCount: 0,
      responses: [{ success: true }, { success: true }],
    });
  });

  it("sends a minimal review deep link with a stable Android collapse identity", async () => {
    const harness = createHarness();

    await harness.sender.sendReviewRequest({
      notificationId: "review-request:application-1",
      userId: "member-1",
      eventId: "event-1",
      eventTitle: "봄날 사진 산책",
    });

    expect(harness.preferenceFind).toHaveBeenCalledWith({
      where: { userId: "member-1" },
      select: { pushEnabled: true, pushEventUpdates: true },
    });
    expect(firebase.sendEachForMulticast).toHaveBeenCalledWith({
      tokens: ["fcm-token-1", "fcm-token-2"],
      notification: {
        title: "모임 후기를 남겨주세요",
        body: "봄날 사진 산책",
      },
      data: {
        type: "REVIEW_REQUEST",
        notificationId: "review-request:application-1",
        eventId: "event-1",
        route: "/reviews/new?eventId=event-1",
      },
      android: {
        priority: "high",
        collapseKey: "review-request:application-1",
        notification: {
          channelId: "event-updates",
          tag: "review-request:application-1",
        },
      },
    });
  });

  it("labels a canceled application as canceled instead of newly received", async () => {
    const harness = createHarness();

    await harness.sender.sendApplicationUpdate({
      userId: "member-1",
      eventId: "event-1",
      eventTitle: "봄날 사진 산책",
      status: "CANCELED",
    });

    expect(firebase.sendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({
        notification: {
          title: "모임 신청이 취소됐어요",
          body: "봄날 사진 산책",
        },
      }),
    );
  });

  it("honors event push preferences before reading device tokens", async () => {
    const harness = createHarness({ pushEnabled: false });

    await harness.sender.sendReviewRequest({
      notificationId: "review-request:application-1",
      userId: "member-1",
      eventId: "event-1",
      eventTitle: "봄날 사진 산책",
    });

    expect(harness.tokenFind).not.toHaveBeenCalled();
    expect(firebase.sendEachForMulticast).not.toHaveBeenCalled();
  });

  it("disables invalid FCM installations without exposing provider errors", async () => {
    firebase.sendEachForMulticast.mockResolvedValueOnce({
      failureCount: 1,
      responses: [
        {
          success: false,
          error: { code: "messaging/registration-token-not-registered" },
        },
        { success: true },
      ],
    });
    const harness = createHarness();

    await harness.sender.sendReviewRequest({
      notificationId: "review-request:application-1",
      userId: "member-1",
      eventId: "event-1",
      eventTitle: "봄날 사진 산책",
    });

    expect(harness.tokenUpdate).toHaveBeenCalledWith({
      where: { id: { in: ["installation-1"] } },
      data: { disabledAt: expect.any(Date) },
    });
  });
});
