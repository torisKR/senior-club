import "reflect-metadata";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { parseApiEnv } from "../config/env";
import { AuthProvider } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ProfileController } from "../profile/profile.controller";
import { ProfileService } from "../profile/profile.service";
import { AccessTokenGuard } from "./access-token.guard";
import { AuthController, MeController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { FirebasePhoneService } from "./firebase-phone.service";
import { GoogleTokenVerifier } from "./google-token-verifier";
import { KakaoTokenVerifier } from "./kakao-token-verifier";
import { DisabledLoginGuard, loginPolicy } from "./login-policy";
import { TokenService } from "./token.service";

// Deliberately never uses the application's DATABASE_URL or loads .env.
// Opt in with RUN_AUTH_POSTGRES_TESTS=true and an explicit disposable DB URL.
const enabled = process.env.RUN_AUTH_POSTGRES_TESTS === "true";
const databaseUrl = process.env.AUTH_POSTGRES_TEST_URL;

describe.skipIf(!enabled)("auth/profile with real PostgreSQL adapter", () => {
  const namespace = `auth-qa-${randomUUID()}`;
  const userIds = new Set<string>();
  let prisma: PrismaService;
  let auth: AuthService;
  let profiles: ProfileService;
  let app: INestApplication;
  let accessToken: string;
  let refreshToken: string;
  let memberId: string;
  let interestId: string;
  let replacementInterestId: string;
  const phoneNumber = `+8210${Date.now().toString().slice(-8)}`;
  const alternatePhone = `+8211${Date.now().toString().slice(-8)}`;
  const firebase = { verifyPhoneIdToken: vi.fn().mockResolvedValue({ uid: `${namespace}-firebase`, phoneNumber }) };

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("AUTH_POSTGRES_TEST_URL must point to a disposable database");
    const url = new URL(databaseUrl);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
      throw new Error("Auth regression tests only accept an explicitly supplied loopback disposable database");
    }
    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: databaseUrl, DATABASE_POOL_MAX: "8", KAKAO_APP_ID: "1539455", EMAIL_PROVIDER: "disabled", SMS_PROVIDER: "disabled", PUSH_PROVIDER: "disabled", OUTBOX_WORKER_ENABLED: "false" });
    prisma = new PrismaService(env);
    await prisma.ping();
    const tokens = new TokenService(env);
    auth = new AuthService(prisma, tokens,
      { verify: vi.fn(async (accessToken: string) => ({ providerAccountId: `${namespace}:${accessToken}`, name: "카카오 테스트" })) } as unknown as KakaoTokenVerifier,
      { verify: vi.fn(async () => ({ providerAccountId: `${namespace}:google`, name: "구글 테스트" })) } as unknown as GoogleTokenVerifier,
      firebase as unknown as FirebasePhoneService, env);
    profiles = new ProfileService(prisma);
    // Vitest does not emit constructor metadata. Register the production
    // controllers' constructor types explicitly for the real Express routes.
    Reflect.defineMetadata("design:paramtypes", [AuthService], AuthController);
    Reflect.defineMetadata("design:paramtypes", [AuthService], MeController);
    Reflect.defineMetadata("design:paramtypes", [ProfileService], ProfileController);
    const module = await Test.createTestingModule({
      controllers: [AuthController, MeController, ProfileController],
      providers: [
        { provide: AuthService, useValue: auth }, { provide: ProfileService, useValue: profiles },
        { provide: PrismaService, useValue: prisma }, { provide: TokenService, useValue: tokens },
        { provide: AccessTokenGuard, useValue: new AccessTokenGuard(tokens, prisma) }, DisabledLoginGuard,
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    await app.init();
    const interest = await prisma.interest.create({ data: { slug: namespace, name: "테스트 관심사", icon: "test", sortOrder: 999 } });
    interestId = interest.id;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (prisma) {
      // Clean up only records carrying this run's namespace.
      const owned = await prisma.authIdentity.findMany({ where: { providerAccountId: { startsWith: namespace } }, select: { userId: true } });
      owned.forEach(({ userId }) => userIds.add(userId));
      await prisma.user.deleteMany({ where: { id: { in: [...userIds] } } });
      if (interestId) await prisma.interest.deleteMany({ where: { id: { in: [interestId, replacementInterestId].filter(Boolean) } } });
    }
    if (app) await app.close();
    else if (prisma) await prisma.$disconnect();
  });

  it("reproduces the void decoding error that executeRaw avoids", async () => {
    await expect(prisma.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${namespace}))`).rejects.toMatchObject({ code: "P2010" });
    await expect(prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${namespace}))`).resolves.toEqual(expect.any(Number));
  });

  it("serializes eight simultaneous Kakao logins into one identity and distinct sessions", async () => {
    const sessions = await Promise.all(Array.from({ length: 8 }, () => auth.loginWithKakao({ accessToken: "concurrent", clientType: "WEB", termsAccepted: true, privacyAccepted: true }, {})));
    const ids = new Set(sessions.map((session) => session.user.id));
    expect(ids.size).toBe(1);
    memberId = sessions[0]!.user.id;
    userIds.add(memberId);
    accessToken = sessions[0]!.accessToken;
    refreshToken = sessions[0]!.refreshToken;
    expect(new Set(sessions.map((session) => session.sessionId)).size).toBe(8);
    expect(await prisma.authIdentity.count({ where: { provider: AuthProvider.KAKAO, providerAccountId: `${namespace}:concurrent` } })).toBe(1);
    expect(await prisma.authSession.count({ where: { userId: memberId } })).toBe(8);
    expect(await prisma.consentRecord.count({ where: { userId: memberId } })).toBe(2);
  });

  it("retains the Google executeRaw regression fix behind the disabled production policy", async () => {
    // Only this test opens the old implementation to exercise its PG lock.
    // There is no runtime/environment setting that enables Google login.
    const enforcePolicy = loginPolicy.assertAllowed;
    const policy = vi.spyOn(loginPolicy, "assertAllowed").mockImplementation((provider) => {
      if (provider !== "google") enforcePolicy(provider);
    });
    try {
      const sessions = await Promise.all(Array.from({ length: 4 }, () => auth.loginWithGoogle({ idToken: "test", clientType: "WEB", termsAccepted: true, privacyAccepted: true }, {})));
      sessions.forEach(({ user }) => userIds.add(user.id));
      expect(new Set(sessions.map(({ user }) => user.id)).size).toBe(1);
      expect(await prisma.authIdentity.count({ where: { provider: AuthProvider.GOOGLE, providerAccountId: `${namespace}:google` } })).toBe(1);
    } finally { policy.mockRestore(); }
  });

  it.each(["email/request", "email/verify", "phone/request", "phone/verify", "google"])("blocks legacy %s before body validation and DB writes", async (path) => {
    const before = await prisma.authSession.count();
    const response = await request(app.getHttpServer()).post(`/v1/auth/${path}`).send({}).expect(403);
    expect(response.body.error.code).toBe("AUTH_PROVIDER_DISABLED");
    expect(await prisma.authSession.count()).toBe(before);
  });

  it("allows session refresh/profile and rejects refresh-token replay", async () => {
    const me = await request(app.getHttpServer()).get("/v1/me").set("Authorization", `Bearer ${accessToken}`).expect(200);
    expect(me.body.phoneVerifiedAt).toBeNull();
    const rotated = await request(app.getHttpServer()).post("/v1/auth/refresh").send({ refreshToken }).expect(201);
    await request(app.getHttpServer()).post("/v1/auth/refresh").send({ refreshToken }).expect(401);
    accessToken = rotated.body.accessToken;
    refreshToken = rotated.body.refreshToken;
  });

  it("persists manual unverified phone, proof, same normalized contact, changed contact, and removal", async () => {
    const patch = (phone: string | null | undefined) => request(app.getHttpServer()).patch("/v1/me/profile").set("Authorization", `Bearer ${accessToken}`).send({ name: "프로필 회원", region: "서울특별시 마포구", birthYear: 1962, interestSlugs: [namespace], ...(phone === undefined ? {} : { phoneNumber: phone }) });
    const manual = await patch(phoneNumber).expect(200);
    expect(manual.body.phoneNumber).toBe(phoneNumber);
    expect(manual.body.phoneVerifiedAt).toBeNull();
    await request(app.getHttpServer()).post("/v1/auth/firebase/verify-phone").send({ idToken: "valid-firebase-phone-proof-token" }).expect(401);
    const proof = await request(app.getHttpServer()).post("/v1/auth/firebase/verify-phone").set("Authorization", `Bearer ${accessToken}`).send({ idToken: "valid-firebase-phone-proof-token" }).expect(201);
    const verifiedAt = proof.body.user.phoneVerifiedAt;
    expect(verifiedAt).toEqual(expect.any(String));
    const sameLocalNumber = `0${phoneNumber.slice(3)}`;
    expect((await patch(sameLocalNumber).expect(200)).body.phoneVerifiedAt).toBe(verifiedAt);
    expect((await patch(undefined).expect(200)).body.phoneVerifiedAt).toBe(verifiedAt);
    const me = await request(app.getHttpServer()).get("/v1/me").set("Authorization", `Bearer ${accessToken}`).expect(200);
    expect(me.body.phoneVerifiedAt).toBe(verifiedAt);
    expect((await patch(alternatePhone).expect(200)).body.phoneVerifiedAt).toBeNull();
    const removed = await patch(null).expect(200);
    expect(removed.body.phoneNumber).toBeNull();
    expect(removed.body.phoneVerifiedAt).toBeNull();
  });

  it("maps actual unique violations and rolls back profile/interest writes for both contact paths", async () => {
    const other = await prisma.user.create({ data: { name: "중복 번호 소유자", phoneNumber } });
    userIds.add(other.id);
    const replacement = await prisma.interest.create({ data: { slug: `${namespace}-replacement`, name: "롤백 테스트 관심사", icon: "test", sortOrder: 999 } });
    replacementInterestId = replacement.id;
    const before = await prisma.user.findUniqueOrThrow({ where: { id: memberId }, include: { interests: true } });
    const conflict = await request(app.getHttpServer()).patch("/v1/me/profile").set("Authorization", `Bearer ${accessToken}`).send({ name: "롤백되어야 할 이름", region: "부산광역시", birthYear: 1955, interestSlugs: [replacement.slug], phoneNumber }).expect(409);
    expect(conflict.body.error.code).toBe("PHONE_ALREADY_IN_USE");
    const after = await prisma.user.findUniqueOrThrow({ where: { id: memberId }, include: { interests: true } });
    expect(after.name).toBe(before.name);
    expect(after.region).toBe(before.region);
    expect(after.phoneNumber).toBeNull();
    expect(after.interests).toEqual(before.interests);
    const proof = await request(app.getHttpServer()).post("/v1/auth/firebase/verify-phone").set("Authorization", `Bearer ${accessToken}`).send({ idToken: "duplicate-firebase-phone-proof-token" }).expect(409);
    expect(proof.body.error.code).toBe("PHONE_ALREADY_IN_USE");
    expect(await prisma.user.findUniqueOrThrow({ where: { id: memberId } })).toMatchObject({ phoneNumber: null, phoneVerifiedAt: null });
  });

  it("fails closed when Firebase proof verification is unavailable and preserves manual contact", async () => {
    const { ApiException } = await import("../common/http/api.exception");
    firebase.verifyPhoneIdToken.mockRejectedValueOnce(new ApiException(503, "FIREBASE_NOT_CONFIGURED", "휴대폰 인증 서비스를 사용할 수 없습니다."));
    const response = await request(app.getHttpServer()).post("/v1/auth/firebase/verify-phone").set("Authorization", `Bearer ${accessToken}`).send({ idToken: "unavailable-firebase-proof-token" }).expect(503);
    expect(response.body.error.code).toBe("FIREBASE_NOT_CONFIGURED");
    expect(await prisma.user.findUniqueOrThrow({ where: { id: memberId } })).toMatchObject({ phoneNumber: null, phoneVerifiedAt: null });
  });
});
