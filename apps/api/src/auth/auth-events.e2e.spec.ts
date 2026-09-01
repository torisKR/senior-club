import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaService } from "../prisma/prisma.service";

const runDatabaseTests = process.env.RUN_DATABASE_E2E === "true";

describe.skipIf(!runDatabaseTests)("email auth and event application (database e2e)", () => {
  let app: INestApplication;
  let accessToken = "";
  let refreshToken = "";
  let applicationId = "";
  const email = `e2e-${Date.now()}@seniorclub.test`;

  beforeAll(async () => {
    const { createApplication } = await import("../bootstrap");
    app = await createApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("probes the real database", async () => {
    await request(app.getHttpServer()).get("/readyz").expect(200);
  });

  it("requests and verifies a one-time email code", async () => {
    const challenge = await request(app.getHttpServer())
      .post("/v1/auth/email/request")
      .send({ email })
      .expect(201);

    expect(challenge.body.challengeId).toEqual(expect.any(String));
    expect(challenge.body.devCode).toMatch(/^\d{6}$/);

    await request(app.getHttpServer())
      .post("/v1/auth/email/verify")
      .send({
        challengeId: challenge.body.challengeId,
        email,
        code: "999999",
        name: "통합테스트 회원",
        clientType: "WEB",
        termsAccepted: true,
        privacyAccepted: true,
      })
      .expect(401);

    const verified = await request(app.getHttpServer())
      .post("/v1/auth/email/verify")
      .send({
        challengeId: challenge.body.challengeId,
        email,
        code: challenge.body.devCode,
        name: "통합테스트 회원",
        clientType: "WEB",
        termsAccepted: true,
        privacyAccepted: true,
      })
      .expect(201);

    accessToken = verified.body.accessToken;
    refreshToken = verified.body.refreshToken;
    expect(accessToken).toEqual(expect.any(String));
    expect(refreshToken).toEqual(expect.any(String));
  });

  it("protects member data and rotates refresh tokens", async () => {
    await request(app.getHttpServer()).get("/v1/me").expect(401);
    const me = await request(app.getHttpServer())
      .get("/v1/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(me.body.email).toBe(email);

    const rotated = await request(app.getHttpServer())
      .post("/v1/auth/refresh")
      .send({ refreshToken })
      .expect(201);
    await request(app.getHttpServer())
      .post("/v1/auth/refresh")
      .send({ refreshToken })
      .expect(401);
    refreshToken = rotated.body.refreshToken;
    accessToken = rotated.body.accessToken;
  });

  it("persists onboarding profile and rolls back an unknown interest selection", async () => {
    const interests = await request(app.getHttpServer())
      .get("/v1/interests")
      .expect(200);
    expect(interests.headers["cache-control"]).toContain("public");
    expect(interests.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slug: "hiking", name: "등산" }),
        expect.objectContaining({ slug: "photo", name: "사진" }),
      ]),
    );

    const incompleteApplication = await request(app.getHttpServer())
      .post("/v1/events/event-bukhansan-dullegil/applications")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Idempotency-Key", `e2e-incomplete-profile-${Date.now()}`)
      .expect(409);
    expect(incompleteApplication.body).toMatchObject({
      error: { code: "PROFILE_ONBOARDING_REQUIRED" },
    });

    const profileInput = {
      name: "통합테스트 시니어",
      region: "서울특별시 마포구",
      birthYear: 1962,
      interestSlugs: ["hiking", "photo"],
    };
    const updated = await request(app.getHttpServer())
      .patch("/v1/me/profile")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(profileInput)
      .expect(200);
    expect(updated.body).toMatchObject({
      name: profileInput.name,
      region: profileInput.region,
      birthYear: profileInput.birthYear,
      onboardingCompletedAt: expect.any(String),
    });
    expect(
      updated.body.interests
        .map((interest: { slug: string }) => interest.slug)
        .sort(),
    ).toEqual([...profileInput.interestSlugs].sort());

    const restored = await request(app.getHttpServer())
      .get("/v1/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(restored.body).toMatchObject({
      name: profileInput.name,
      region: profileInput.region,
      birthYear: profileInput.birthYear,
      onboardingCompletedAt: updated.body.onboardingCompletedAt,
    });
    expect(
      restored.body.interests
        .map((interest: { slug: string }) => interest.slug)
        .sort(),
    ).toEqual([...profileInput.interestSlugs].sort());

    const rejected = await request(app.getHttpServer())
      .patch("/v1/me/profile")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "롤백되면 안 되는 이름",
        region: "부산광역시 해운대구",
        birthYear: 1955,
        interestSlugs: ["hiking", "unknown-interest"],
      })
      .expect(400);
    expect(rejected.body).toMatchObject({
      error: {
        code: "INVALID_INTEREST_SELECTION",
        details: { invalidSlugs: ["unknown-interest"] },
      },
    });

    const afterRollback = await request(app.getHttpServer())
      .get("/v1/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(afterRollback.body).toMatchObject({
      name: profileInput.name,
      region: profileInput.region,
      birthYear: profileInput.birthYear,
      onboardingCompletedAt: updated.body.onboardingCompletedAt,
    });
    expect(
      afterRollback.body.interests.map(
        (interest: { slug: string }) => interest.slug,
      ).sort(),
    ).toEqual([...profileInput.interestSlugs].sort());
  });

  it("applies once when the same idempotency key is retried", async () => {
    const events = await request(app.getHttpServer()).get("/v1/events").expect(200);
    expect(events.body.data.length).toBeGreaterThan(0);
    expect(
      events.body.data.some(
        (event: { id: string }) => event.id === "event-spring-photo-archive",
      ),
    ).toBe(false);

    const pastEvents = await request(app.getHttpServer())
      .get("/v1/events?view=past")
      .expect(200);
    expect(pastEvents.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "event-spring-photo-archive" }),
      ]),
    );

    const allEvents = await request(app.getHttpServer())
      .get("/v1/events?view=all")
      .expect(200);
    expect(allEvents.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "event-bukhansan-dullegil" }),
        expect.objectContaining({ id: "event-spring-photo-archive" }),
      ]),
    );

    await request(app.getHttpServer())
      .get("/v1/events?view=drafts")
      .expect(400);

    const beforeApplication = await request(app.getHttpServer())
      .get("/v1/events/event-bukhansan-dullegil/applications/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(beforeApplication.body).toEqual({ application: null });

    const key = `e2e-apply-${Date.now()}`;
    const first = await request(app.getHttpServer())
      .post("/v1/events/event-bukhansan-dullegil/applications")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Idempotency-Key", key)
      .expect(201);
    const second = await request(app.getHttpServer())
      .post("/v1/events/event-bukhansan-dullegil/applications")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Idempotency-Key", key)
      .expect(201);

    applicationId = first.body.id;
    expect(second.body.id).toBe(applicationId);
    expect(first.body.status).toBe("PENDING");

    const afterApplication = await request(app.getHttpServer())
      .get("/v1/events/event-bukhansan-dullegil/applications/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(afterApplication.body.application.id).toBe(applicationId);

    const deliveries = await app.get(PrismaService).outboxEvent.findMany({
      where: { aggregateId: applicationId },
      select: { type: true },
    });
    expect(deliveries.map((delivery) => delivery.type).sort()).toEqual([
      "EVENT_APPLICATION_EMAIL",
      "EVENT_APPLICATION_PUSH",
    ]);
  });

  it("allows only the owning leader to approve", async () => {
    await request(app.getHttpServer())
      .get("/v1/leader/events")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get("/v1/events/event-bukhansan-dullegil/applications")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(403);

    const challenge = await request(app.getHttpServer())
      .post("/v1/auth/email/request")
      .send({ email: "leader@seniorclub.kr" })
      .expect(201);
    const leader = await request(app.getHttpServer())
      .post("/v1/auth/email/verify")
      .send({
        challengeId: challenge.body.challengeId,
        email: "leader@seniorclub.kr",
        code: challenge.body.devCode,
        name: "김선영",
        clientType: "WEB",
        termsAccepted: true,
        privacyAccepted: true,
      })
      .expect(201);

    const managedEvents = await request(app.getHttpServer())
      .get("/v1/leader/events")
      .set("Authorization", `Bearer ${leader.body.accessToken}`)
      .expect(200);
    expect(managedEvents.headers["cache-control"]).toContain("private");
    expect(managedEvents.headers["cache-control"]).toContain("no-store");
    expect(managedEvents.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "event-bukhansan-dullegil",
          pendingCount: expect.any(Number),
        }),
      ]),
    );
    expect(managedEvents.body.page).toMatchObject({
      hasNextPage: false,
      nextCursor: null,
    });

    const applications = await request(app.getHttpServer())
      .get("/v1/events/event-bukhansan-dullegil/applications")
      .set("Authorization", `Bearer ${leader.body.accessToken}`)
      .expect(200);
    expect(applications.headers["cache-control"]).toContain("private");
    expect(applications.headers["cache-control"]).toContain("no-store");
    expect(applications.body.event.id).toBe("event-bukhansan-dullegil");
    expect(applications.body.event.pendingCount).toBeGreaterThanOrEqual(2);
    const listedApplication = applications.body.applications.find(
      (application: { id: string }) => application.id === applicationId,
    );
    expect(listedApplication).toMatchObject({
      id: applicationId,
      status: "PENDING",
      applicant: {
        name: "통합테스트 시니어",
        interests: expect.arrayContaining([
          expect.objectContaining({ slug: "hiking" }),
        ]),
      },
    });
    expect(listedApplication.applicant).not.toHaveProperty("email");
    expect(listedApplication.applicant).not.toHaveProperty("id");
    expect(applications.body.page).toMatchObject({
      hasNextPage: false,
      nextCursor: null,
    });

    await request(app.getHttpServer())
      .patch(`/v1/applications/${applicationId}`)
      .set("Authorization", `Bearer ${leader.body.accessToken}`)
      .send({ status: "REJECTED" })
      .expect(400);

    const approved = await request(app.getHttpServer())
      .patch(`/v1/applications/${applicationId}`)
      .set("Authorization", `Bearer ${leader.body.accessToken}`)
      .send({ status: "APPROVED" })
      .expect(200);
    expect(approved.body.status).toBe("APPROVED");
    expect(approved.body).not.toHaveProperty("userId");

    const mine = await request(app.getHttpServer())
      .get("/v1/me/applications")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(mine.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: applicationId, status: "APPROVED" }),
      ]),
    );

    const deliveries = await app.get(PrismaService).outboxEvent.findMany({
      where: { aggregateId: applicationId },
      select: { type: true },
    });
    expect(deliveries.map((delivery) => delivery.type).sort()).toEqual([
      "EVENT_APPLICATION_EMAIL",
      "EVENT_APPLICATION_EMAIL",
      "EVENT_APPLICATION_PUSH",
      "EVENT_APPLICATION_PUSH",
    ]);

    const prisma = app.get(PrismaService);
    const storedApplication = await prisma.eventMember.findUniqueOrThrow({
      where: { id: applicationId },
      select: { userId: true },
    });
    const chatRoom = await prisma.chatRoom.findUniqueOrThrow({
      where: { eventId: "event-bukhansan-dullegil" },
      select: { id: true },
    });
    const approvedMembership = await prisma.chatRoomMember.findUniqueOrThrow({
      where: {
        roomId_userId: {
          roomId: chatRoom.id,
          userId: storedApplication.userId,
        },
      },
      select: { leftAt: true },
    });
    expect(approvedMembership.leftAt).toBeNull();

    const canceled = await request(app.getHttpServer())
      .delete("/v1/events/event-bukhansan-dullegil/applications/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(canceled.body.status).toBe("CANCELED");

    const canceledMembership = await prisma.chatRoomMember.findUniqueOrThrow({
      where: {
        roomId_userId: {
          roomId: chatRoom.id,
          userId: storedApplication.userId,
        },
      },
      select: { leftAt: true },
    });
    expect(canceledMembership.leftAt).toBeInstanceOf(Date);

    const reapplied = await request(app.getHttpServer())
      .post("/v1/events/event-bukhansan-dullegil/applications")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Idempotency-Key", `e2e-reapply-${Date.now()}`)
      .expect(201);
    expect(reapplied.body).toMatchObject({
      id: applicationId,
      status: "PENDING",
    });

    await request(app.getHttpServer())
      .patch(`/v1/applications/${applicationId}`)
      .set("Authorization", `Bearer ${leader.body.accessToken}`)
      .send({ status: "APPROVED" })
      .expect(200);

    const restoredMembership = await prisma.chatRoomMember.findUniqueOrThrow({
      where: {
        roomId_userId: {
          roomId: chatRoom.id,
          userId: storedApplication.userId,
        },
      },
      select: { leftAt: true },
    });
    expect(restoredMembership.leftAt).toBeNull();

    const deliveriesAfterReapproval = await prisma.outboxEvent.findMany({
      where: { aggregateId: applicationId },
      select: { type: true },
    });
    expect(
      deliveriesAfterReapproval.filter(
        (delivery) => delivery.type === "EVENT_APPLICATION_EMAIL",
      ),
    ).toHaveLength(4);
    expect(
      deliveriesAfterReapproval.filter(
        (delivery) => delivery.type === "EVENT_APPLICATION_PUSH",
      ),
    ).toHaveLength(4);
  });

  it("revokes sessions on deletion request and allows cancellation after reauthentication", async () => {
    const deletion = await request(app.getHttpServer())
      .post("/v1/me/deletion-request")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ confirmation: "계정 삭제", reason: "통합 테스트" })
      .expect(201);
    expect(deletion.body.status).toBe("REQUESTED");
    expect(deletion.body.scheduledFor).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .get("/v1/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(401);

    const challenge = await request(app.getHttpServer())
      .post("/v1/auth/email/request")
      .send({ email })
      .expect(201);
    const verified = await request(app.getHttpServer())
      .post("/v1/auth/email/verify")
      .send({
        challengeId: challenge.body.challengeId,
        email,
        code: challenge.body.devCode,
        name: "통합테스트 회원",
        clientType: "WEB",
        termsAccepted: true,
        privacyAccepted: true,
      })
      .expect(201);
    accessToken = verified.body.accessToken;

    const current = await request(app.getHttpServer())
      .get("/v1/me/deletion-request")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(current.body.deletionRequest.id).toBe(deletion.body.id);

    await request(app.getHttpServer())
      .delete("/v1/me/deletion-request")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200, { success: true });

    const afterCancellation = await request(app.getHttpServer())
      .get("/v1/me/deletion-request")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(afterCancellation.body).toEqual({ deletionRequest: null });
  });
});
