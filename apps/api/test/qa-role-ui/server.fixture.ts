import "reflect-metadata";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HttpStatus, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { databaseTestUrl } from "../../scripts/database-qa.mjs";
import { ApiException } from "../../src/common/http/api.exception";
import { requestIdMiddleware } from "../../src/common/http/request-id.middleware";
import { createCorsOptions } from "../../src/config/cors.config";
import { API_ENV } from "../../src/config/env.module";
import type { ApiEnv } from "../../src/config/env";
import { ConfiguredIoAdapter } from "../../src/config/socket-io.adapter";
import { AuthProvider, UserRole } from "../../src/generated/prisma/client";
import { PrismaService } from "../../src/prisma/prisma.service";
import { KakaoTokenVerifier } from "../../src/auth/kakao-token-verifier";

const databaseUrl = databaseTestUrl();
if (!databaseUrl) throw new Error("Role UI fixture requires the existing disposable DB guard");
const root = process.env.ROLE_UI_TEMP_ROOT;
if (!root?.startsWith("/private/tmp/senior-role-ui-") && !root?.startsWith("/tmp/senior-role-ui-")) {
  throw new Error("An explicit owned temporary directory is required");
}
const tempRoot = root!;
if (!process.env.ROLE_UI_CONTROL || process.env.ROLE_UI_CONTROL.length < 32) throw new Error("Missing QA control key");
let app: INestApplication;
let externalFetchAttempts = 0;
let providerChecks = 0;
const authRefreshStatuses: number[] = [];
const authRefreshTrace: Array<{ id: number; receivedAt: string; finishedAt?: string; status?: number }> = [];
const roleIds = { member: "seed-user-member", leader: "seed-user-leader", admin: "seed-user-admin", outsider: "role-ui-outsider" };
const eventId = "event-bukhansan-dullegil";

async function snapshot() {
  const prisma = app.get(PrismaService);
  return {
    providerChecks, externalFetchAttempts, authRefreshStatuses, authRefreshTrace,
    migrations: await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL`,
    users: await prisma.user.findMany({ where: { id: { in: Object.values(roleIds) } }, select: { id: true, role: true, name: true, phoneNumber: true, onboardingCompletedAt: true } }),
    application: await prisma.eventMember.findUnique({ where: { eventId_userId: { eventId, userId: roleIds.member } }, select: { id: true, status: true, reviewedById: true } }),
    sessions: await prisma.authSession.findMany({ where: { userId: { in: Object.values(roleIds) } }, select: { id: true, userId: true, revokedAt: true } }),
    posts: await prisma.post.findMany({ where: { OR: [{ id: "role-ui-reported-post" }, { title: "격리 QA 회원 이야기" }] }, select: { id: true, title: true, userId: true, status: true } }),
    reports: await prisma.report.findMany({ where: { id: "role-ui-report" }, select: { id: true, postId: true, status: true, resolverId: true } }),
    outboxCount: await prisma.outboxEvent.count(),
  };
}

beforeAll(async () => {
  vi.stubGlobal("fetch", () => { externalFetchAttempts++; throw new Error("External provider fetch is forbidden in local role UI QA"); });
  const { AppModule } = await import("../../src/app.module");
  const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(KakaoTokenVerifier).useValue({
    async verify(token: string) {
      providerChecks++;
      const role = ["member", "leader", "admin", "outsider"].find((value) => token === `role-ui-${value}-token`);
      if (!role) throw new ApiException(HttpStatus.UNAUTHORIZED, "KAKAO_TOKEN_INVALID", "격리 QA 토큰이 유효하지 않습니다.");
      return { providerAccountId: `role-ui-${role}`, name: `격리 QA ${role}` };
    },
  }).compile();
  app = module.createNestApplication({ logger: false, httpsOptions: { key: readFileSync(join(tempRoot, "tls.key")), cert: readFileSync(join(tempRoot, "tls.crt")) } });
  const env = app.get<ApiEnv>(API_ENV);
  expect(env.DATABASE_URL).toBe(databaseUrl);
  expect(env.NODE_ENV).toBe("test");
  expect([env.EMAIL_PROVIDER, env.SMS_PROVIDER, env.PUSH_PROVIDER]).toEqual(["disabled", "disabled", "disabled"]);
  expect(env.OUTBOX_WORKER_ENABLED).toBe(false);
  app.use(helmet());
  app.use(requestIdMiddleware);
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (request.path === "/v1/auth/refresh") {
      const trace = { id: authRefreshTrace.length + 1, receivedAt: new Date().toISOString() };
      authRefreshTrace.push(trace);
      response.once("finish", () => {
        authRefreshStatuses.push(response.statusCode);
        Object.assign(trace, { finishedAt: new Date().toISOString(), status: response.statusCode });
      });
    }
    next();
  });
  app.enableCors(createCorsOptions(env.CORS_ORIGINS));
  app.useWebSocketAdapter(new ConfiguredIoAdapter(app, env));
  app.use("/__qa/state", async (req: { method: string; headers: Record<string, string> }, res: { status: (n: number) => { end: () => void }; json: (v: unknown) => void }) => {
    if (req.method !== "GET" || req.headers["x-qa-control"] !== process.env.ROLE_UI_CONTROL) return res.status(403).end();
    try { res.json(JSON.parse(JSON.stringify(await snapshot(), (_, v) => typeof v === "bigint" ? Number(v) : v))); }
    catch { res.status(500).end(); }
  });
  await app.init();
  const prisma = app.get(PrismaService);
  await prisma.user.create({ data: { id: roleIds.outsider, name: "격리 QA 다른 리더", role: UserRole.LEADER, onboardingCompletedAt: new Date() } });
  for (const [role, userId] of Object.entries(roleIds)) {
    await prisma.authIdentity.create({ data: { userId, provider: AuthProvider.KAKAO, providerAccountId: `role-ui-${role}` } });
  }
  const club = await prisma.club.findFirstOrThrow({ where: { leaderId: roleIds.leader } });
  await prisma.post.create({ data: { id: "role-ui-reported-post", clubId: club.id, userId: roleIds.leader, title: "격리 QA 검토 대상", content: "격리된 로컬 QA에서만 사용하는 관리자 검토용 합성 게시글입니다." } });
  await prisma.report.create({ data: { id: "role-ui-report", reporterId: roleIds.member, targetType: "POST", postId: "role-ui-reported-post", reason: "OTHER", detail: "격리 QA 신고 목록과 상태 변경 확인" } });
  await app.listen(43131, "127.0.0.1");
  writeFileSync(join(tempRoot, "api-ready.json"), JSON.stringify({ roleIds, eventId, clubSlug: club.slug, externalProviderStub: "KakaoTokenVerifier only", api: "https://localhost:43131" }), { mode: 0o600 });
}, 60_000);

it("serves the real Nest/Prisma stack until its owning UI runner finishes", async () => {
  const stop = join(tempRoot, "stop-api");
  const deadline = Date.now() + 25 * 60_000;
  while (!existsSync(stop) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 250));
  expect(existsSync(stop)).toBe(true);
  expect(readFileSync(stop, "utf8")).toBe("owner-finished\n");
  expect(externalFetchAttempts).toBe(0);
}, 26 * 60_000);

afterAll(async () => {
  try {
    if (app) writeFileSync(join(tempRoot, "database-final.json"), JSON.stringify(await snapshot(), (_, v) => typeof v === "bigint" ? Number(v) : v, 2), { mode: 0o600 });
  } finally {
    if (app) await app.close();
    vi.unstubAllGlobals();
  }
});
