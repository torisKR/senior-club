import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { HttpStatus, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import helmet from "helmet";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { databaseTestUrl } from "../../scripts/database-qa.mjs";
import { ApiException } from "../common/http/api.exception";
import { requestIdMiddleware } from "../common/http/request-id.middleware";
import { createCorsOptions } from "../config/cors.config";
import type { ApiEnv } from "../config/env";
import { API_ENV } from "../config/env.module";
import { ConfiguredIoAdapter } from "../config/socket-io.adapter";
import { AuthProvider, UserRole } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { KakaoTokenVerifier, type KakaoIdentity } from "./kakao-token-verifier";
import { FirebaseReviewerService } from "./firebase-reviewer.service";

const databaseUrl = databaseTestUrl();

describe.skipIf(!databaseUrl)("Kakao auth and event application (database e2e)", () => {
  let app: INestApplication;
  let accessToken = "";
  let refreshToken = "";
  let applicationId = "";
  let memberId = "";
  let outsiderId = "";
  let reviewerId = "";
  let existingRoomIds: string[] = [];
  let existingRoleConsentIds: string[] = [];
  let existingRolePreferenceIds: string[] = [];
  let roleLoginTimes: Array<{ id: string; lastLoginAt: Date | null }> = [];
  let fixturesStarted = false;
  const roleUserIds = ["seed-user-leader", "seed-user-admin"];
  const runId = `events-qa-${randomUUID()}`;
  const email = `${runId}@seniorclub.test`;
  const identities = new Map<string, KakaoIdentity>([
    ["qa-member-token", { providerAccountId: `${runId}-member`, name: "통합테스트 회원" }],
    ["qa-leader-token", { providerAccountId: `${runId}-leader`, name: "김선영" }],
    ["qa-outsider-token", { providerAccountId: `${runId}-outsider`, name: "다른 모임 리더" }],
    ["qa-admin-token", { providerAccountId: `${runId}-admin`, name: "시니어클럽 관리자" }],
  ]);
  const kakaoVerifier = {
    verify: vi.fn(async (token: string): Promise<KakaoIdentity> => {
      const identity = identities.get(token);
      if (!identity) throw new ApiException(HttpStatus.UNAUTHORIZED, "KAKAO_TOKEN_INVALID", "테스트 카카오 토큰이 유효하지 않습니다.");
      return identity;
    }),
  };
  const reviewerVerifier = { verify: vi.fn(async () => ({ uid: `${runId}-reviewer` })) };
  const externalFetch = vi.fn(() => { throw new Error("External providers are forbidden in DB QA"); });
  const login = (token: string) => request(app.getHttpServer())
    .post("/v1/auth/kakao")
    .send({ accessToken: token, clientType: "WEB", termsAccepted: true, privacyAccepted: true });

  beforeAll(async () => {
    // Import AppModule directly: bootstrap imports dotenv/config. All application
    // services, guards, Prisma transactions and session issuance remain real.
    vi.stubGlobal("fetch", externalFetch);
    const { AppModule } = await import("../app.module");
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(KakaoTokenVerifier).useValue(kakaoVerifier)
      .overrideProvider(FirebaseReviewerService).useValue(reviewerVerifier).compile();
    app = module.createNestApplication();
    const env = app.get<ApiEnv>(API_ENV);
    expect(env.DATABASE_URL).toBe(databaseUrl);
    expect(env.NODE_ENV).toBe("test");
    app.use(helmet());
    app.use(requestIdMiddleware);
    app.enableCors(createCorsOptions(env.CORS_ORIGINS));
    app.useWebSocketAdapter(new ConfiguredIoAdapter(app, env));
    await app.init();
    // One loopback listener avoids Supertest reopening/closing the same server
    // between requests while Node 24 may still hold a keep-alive connection.
    await app.listen(0, "127.0.0.1");

    const prisma = app.get(PrismaService);
    existingRoomIds = (await prisma.chatRoom.findMany({ select: { id: true } })).map(({ id }) => id);
    existingRoleConsentIds = (await prisma.consentRecord.findMany({ where: { userId: { in: roleUserIds } }, select: { id: true } })).map(({ id }) => id);
    existingRolePreferenceIds = (await prisma.notificationPreference.findMany({ where: { userId: { in: roleUserIds } }, select: { userId: true } })).map(({ userId }) => userId);
    roleLoginTimes = await prisma.user.findMany({ where: { id: { in: roleUserIds } }, select: { id: true, lastLoginAt: true } });
    fixturesStarted = true;
    // Existing role fixtures are linked by provider identity, never by email or
    // by a request-controlled role. A leader with no club tests ownership scope.
    const outsider = await prisma.user.create({
      data: { name: "다른 모임 리더", role: UserRole.LEADER, onboardingCompletedAt: new Date() },
    });
    outsiderId = outsider.id;
    await prisma.authIdentity.createMany({ data: [
      { userId: "seed-user-leader", provider: AuthProvider.KAKAO, providerAccountId: `${runId}-leader` },
      { userId: "seed-user-admin", provider: AuthProvider.KAKAO, providerAccountId: `${runId}-admin` },
      { userId: outsiderId, provider: AuthProvider.KAKAO, providerAccountId: `${runId}-outsider` },
    ] });
    const future = await prisma.event.findUniqueOrThrow({ where: { id: "event-bukhansan-dullegil" } });
    const past = await prisma.event.findUniqueOrThrow({ where: { id: "event-spring-photo-archive" } });
    // Fail clearly on stale fixtures; seed uses dates relative to the QA run.
    expect(future.startAt.getTime()).toBeGreaterThan(Date.now());
    expect((past.endAt ?? past.startAt).getTime()).toBeLessThan(Date.now());
  });

  afterAll(async () => {
    try {
      if (!app || !fixturesStarted) return;
      const prisma = app.get(PrismaService);
      const userIds = [memberId, outsiderId, reviewerId].filter(Boolean);
      const sessions = await prisma.authSession.findMany({
        where: { user: { authIdentities: { some: { providerAccountId: { startsWith: runId } } } } },
        select: { id: true },
      });
      const applications = await prisma.eventMember.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
      const deletions = await prisma.accountDeletionRequest.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
      await prisma.outboxEvent.deleteMany({ where: { OR: [
        { aggregateType: "EventMember", aggregateId: { in: applications.map(({ id }) => id) } },
        { aggregateType: "AccountDeletionRequest", aggregateId: { in: deletions.map(({ id }) => id) } },
      ] } });
      await prisma.notification.deleteMany({ where: { OR: [
        { actorId: { in: userIds } }, { recipientId: { in: userIds } },
      ] } });
      await prisma.chatRoomMember.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.chatRoom.deleteMany({ where: {
        eventId: { in: ["event-bukhansan-dullegil", "event-seoulforest-photo"] },
        id: { notIn: existingRoomIds },
      } });
      await prisma.eventMember.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.authSession.deleteMany({ where: { id: { in: sessions.map(({ id }) => id) } } });
      await prisma.authIdentity.deleteMany({ where: { providerAccountId: { startsWith: runId } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.consentRecord.deleteMany({ where: { userId: { in: roleUserIds }, id: { notIn: existingRoleConsentIds } } });
      await prisma.notificationPreference.deleteMany({ where: { userId: { in: roleUserIds, notIn: existingRolePreferenceIds } } });
      for (const { id, lastLoginAt } of roleLoginTimes) {
        await prisma.user.update({ where: { id }, data: { lastLoginAt } });
      }
      expect(externalFetch).not.toHaveBeenCalled();
    } finally {
      if (app) await app.close();
      vi.unstubAllGlobals();
    }
  });

  it("creates one ordinary reviewer member during concurrent logins and uses real member/session guards", async () => {
    const loginReviewer = () => request(app.getHttpServer()).post("/v1/auth/reviewer")
      .send({ idToken: "fixture-reviewer-token-proof", clientType: "ANDROID", termsAccepted: true, privacyAccepted: true });
    const [first, second] = await Promise.all([loginReviewer(), loginReviewer()]);
    expect(first.status).toBe(201); expect(second.status).toBe(201);
    reviewerId = first.body.user.id;
    expect(second.body.user.id).toBe(reviewerId);
    expect(first.body.user.role).toBe("MEMBER");
    const prisma = app.get(PrismaService);
    expect(await prisma.authIdentity.count({ where: { provider: AuthProvider.EMAIL, providerAccountId: `firebase-reviewer:${runId}-reviewer` } })).toBe(1);
    expect(await prisma.consentRecord.count({ where: { userId: reviewerId, granted: true } })).toBe(2);
    await request(app.getHttpServer()).get("/v1/me").set("Authorization", `Bearer ${first.body.accessToken}`).expect(200);
    await request(app.getHttpServer()).get("/v1/admin/reports").set("Authorization", `Bearer ${first.body.accessToken}`).expect(403);
    await request(app.getHttpServer()).post("/v1/auth/logout").send({ refreshToken: first.body.refreshToken }).expect(201);
    await request(app.getHttpServer()).post("/v1/auth/refresh").send({ refreshToken: first.body.refreshToken }).expect(401);
    const refreshed = await request(app.getHttpServer()).post("/v1/auth/refresh").send({ refreshToken: second.body.refreshToken }).expect(201);
    expect(refreshed.body.user).not.toHaveProperty("authIdentities");
    await prisma.user.update({ where: { id: reviewerId }, data: { role: UserRole.ADMIN } });
    await request(app.getHttpServer()).get("/v1/admin/reports").set("Authorization", `Bearer ${refreshed.body.accessToken}`).expect(401);
    await request(app.getHttpServer()).post("/v1/auth/refresh").send({ refreshToken: refreshed.body.refreshToken }).expect(401);
    await loginReviewer().expect(403);
    await prisma.user.update({ where: { id: reviewerId }, data: { role: UserRole.MEMBER, status: "SUSPENDED" } });
    await loginReviewer().expect(403);
    await prisma.user.update({ where: { id: reviewerId }, data: { status: "ACTIVE" } });
  });

  it("probes the real database", async () => {
    await request(app.getHttpServer()).get("/readyz").expect(200);
  });

  it("keeps legacy logins disabled without creating challenges or sessions", async () => {
    const prisma = app.get(PrismaService);
    const counts = async () => [await prisma.emailVerification.count(), await prisma.phoneVerification.count(),
      await prisma.authSession.count(), await prisma.outboxEvent.count()];
    const before = await counts();
    for (const path of ["email/request", "email/verify", "phone/request", "phone/verify", "google"]) {
      const rejected = await request(app.getHttpServer()).post(`/v1/auth/${path}`).send({}).expect(403);
      expect(rejected.body).toMatchObject({ error: { code: "AUTH_PROVIDER_DISABLED" } });
    }
    expect(await counts()).toEqual(before);
    expect(kakaoVerifier.verify).not.toHaveBeenCalled();
  });

  it("rejects invalid Kakao tokens and persists the real member identity, consent and session", async () => {
    const prisma = app.get(PrismaService);
    const before = await prisma.authSession.count();
    await login("invalid-token").expect(401);
    expect(await prisma.authSession.count()).toBe(before);
    const verified = await login("qa-member-token").expect(201);

    accessToken = verified.body.accessToken;
    refreshToken = verified.body.refreshToken;
    memberId = verified.body.user.id;
    expect(accessToken).toEqual(expect.any(String));
    expect(refreshToken).toEqual(expect.any(String));
    expect(verified.body.user).toMatchObject({ email: "", role: "MEMBER", onboardingCompletedAt: null });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: memberId } })).toMatchObject({ email: null });
    expect(kakaoVerifier.verify).toHaveBeenLastCalledWith("qa-member-token");
    const identity = await prisma.authIdentity.findUniqueOrThrow({ where: {
      provider_providerAccountId: { provider: AuthProvider.KAKAO, providerAccountId: `${runId}-member` },
    } });
    expect(identity.userId).toBe(memberId);
    const session = await prisma.authSession.findUniqueOrThrow({ where: { id: verified.body.sessionId } });
    expect(session.userId).toBe(memberId);
    expect(session.refreshTokenHash).not.toBe(refreshToken);
    expect(session.revokedAt).toBeNull();
    const consent = await prisma.consentRecord.findMany({ where: { userId: memberId } });
    expect(consent.map(({ documentType }) => documentType).sort()).toEqual(["PRIVACY", "TERMS"]);
    expect(consent.every(({ granted, withdrawnAt }) => granted && withdrawnAt === null)).toBe(true);
  });

  it("protects member data and rotates refresh tokens", async () => {
    await request(app.getHttpServer()).get("/v1/me").expect(401);
    const me = await request(app.getHttpServer())
      .get("/v1/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(me.body).toMatchObject({ id: memberId, email: "", role: "MEMBER" });

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
    expect(refreshToken).toEqual(expect.any(String));
    expect(rotated.body.user.id).toBe(memberId);
    await request(app.getHttpServer()).get("/v1/me")
      .set("Authorization", `Bearer ${accessToken}`).expect(200);
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

  it("queues only push for an applicant without email and supports a contact-email fixture", async () => {
    const applied = await request(app.getHttpServer())
      .post("/v1/events/event-seoulforest-photo/applications")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Idempotency-Key", `${runId}-no-email`).expect(201);
    const prisma = app.get(PrismaService);
    const deliveries = await prisma.outboxEvent.findMany({ where: { aggregateId: applied.body.id } });
    expect(deliveries.map(({ type }) => type)).toEqual(["EVENT_APPLICATION_PUSH"]);
    expect(deliveries[0]?.payload).toMatchObject({ email: null, recipientUserId: memberId });
    expect(deliveries[0]).toMatchObject({ status: "PENDING", attempts: 0 });
    await request(app.getHttpServer()).delete("/v1/events/event-seoulforest-photo/applications/me")
      .set("Authorization", `Bearer ${accessToken}`).expect(200);
    // Contact email is optional under Kakao login. Supply it only in this local
    // fixture to retain the existing email + push transaction assertions below.
    await prisma.user.update({ where: { id: memberId }, data: { email } });
    const me = await request(app.getHttpServer()).get("/v1/me")
      .set("Authorization", `Bearer ${accessToken}`).expect(200);
    expect(me.body.email).toBe(email);
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

    const closed = await request(app.getHttpServer())
      .post("/v1/events/event-spring-photo-archive/applications")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Idempotency-Key", `${runId}-past-event`).expect(404);
    expect(closed.body).toMatchObject({ error: { code: "EVENT_NOT_AVAILABLE" } });
    expect(await app.get(PrismaService).eventMember.count({ where: { eventId: "event-spring-photo-archive", userId: memberId } })).toBe(0);

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
    expect(await app.get(PrismaService).eventMember.count({ where: { eventId: "event-bukhansan-dullegil", userId: memberId } })).toBe(1);

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

  it("rejects members and non-owning leaders, and allows the owning leader to approve", async () => {
    await request(app.getHttpServer())
      .get("/v1/leader/events")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get("/v1/events/event-bukhansan-dullegil/applications")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(403);

    await request(app.getHttpServer()).patch(`/v1/applications/${applicationId}`)
      .set("Authorization", `Bearer ${accessToken}`).send({ status: "APPROVED" }).expect(403);
    const outsider = await login("qa-outsider-token").expect(201);
    expect(outsider.body.user).toMatchObject({ id: outsiderId, role: "LEADER" });
    const unrelatedEvents = await request(app.getHttpServer()).get("/v1/leader/events")
      .set("Authorization", `Bearer ${outsider.body.accessToken}`).expect(200);
    expect(unrelatedEvents.body.data).toEqual([]);
    await request(app.getHttpServer()).get("/v1/events/event-bukhansan-dullegil/applications")
      .set("Authorization", `Bearer ${outsider.body.accessToken}`).expect(404);
    const forbidden = await request(app.getHttpServer()).patch(`/v1/applications/${applicationId}`)
      .set("Authorization", `Bearer ${outsider.body.accessToken}`).send({ status: "APPROVED" }).expect(403);
    expect(forbidden.body).toMatchObject({ error: { code: "LEADER_SCOPE_REQUIRED" } });
    expect(await app.get(PrismaService).eventMember.findUniqueOrThrow({ where: { id: applicationId } }))
      .toMatchObject({ status: "PENDING", reviewedById: null });

    const leader = await login("qa-leader-token").expect(201);
    expect(leader.body.user).toMatchObject({ id: "seed-user-leader", role: "LEADER" });

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

    const admin = await login("qa-admin-token").expect(201);
    expect(admin.body.user).toMatchObject({ id: "seed-user-admin", role: "ADMIN" });
    const adminEvents = await request(app.getHttpServer()).get("/v1/leader/events")
      .set("Authorization", `Bearer ${admin.body.accessToken}`).expect(200);
    expect(adminEvents.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "event-bukhansan-dullegil" }),
    ]));
    const adminApplications = await request(app.getHttpServer()).get("/v1/events/event-bukhansan-dullegil/applications")
      .set("Authorization", `Bearer ${admin.body.accessToken}`).expect(200);
    expect(adminApplications.body.applications).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: applicationId, status: "PENDING" }),
    ]));
    await request(app.getHttpServer())
      .patch(`/v1/applications/${applicationId}`)
      .set("Authorization", `Bearer ${admin.body.accessToken}`)
      .send({ status: "APPROVED" })
      .expect(200);
    expect(await prisma.eventMember.findUniqueOrThrow({ where: { id: applicationId } }))
      .toMatchObject({ status: "APPROVED", reviewedById: "seed-user-admin" });

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

    await request(app.getHttpServer()).post("/v1/auth/refresh").send({ refreshToken }).expect(401);
    const sessions = await app.get(PrismaService).authSession.findMany({ where: { userId: memberId } });
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.every(({ revokedAt }) => revokedAt !== null)).toBe(true);
    const verified = await login("qa-member-token").expect(201);
    expect(verified.body.user.id).toBe(memberId);
    accessToken = verified.body.accessToken;
    refreshToken = verified.body.refreshToken;

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
    expect(await app.get(PrismaService).accountDeletionRequest.findUniqueOrThrow({ where: { id: deletion.body.id } }))
      .toMatchObject({ userId: memberId, status: "CANCELED", completedAt: null });
    expect(await app.get(PrismaService).user.findUniqueOrThrow({ where: { id: memberId } }))
      .toMatchObject({ deletionRequestedAt: null });
    expect(await app.get(PrismaService).authIdentity.count({ where: { userId: memberId, provider: AuthProvider.KAKAO } })).toBe(1);
  });
});
