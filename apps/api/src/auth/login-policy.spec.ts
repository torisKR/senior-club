import "reflect-metadata";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { DisabledLoginGuard, loginPolicy } from "./login-policy";
import { AccessTokenGuard } from "./access-token.guard";

const legacyPaths = ["email/request", "email/verify", "phone/request", "phone/verify", "google"];

describe("Kakao-only login policy", () => {
  it("allows Kakao and denies every legacy provider", () => {
    expect(() => loginPolicy.assertAllowed("kakao")).not.toThrow();
    for (const provider of ["email", "phone", "google"] as const) {
      expect(() => loginPolicy.assertAllowed(provider)).toThrow();
    }
  });

  it("blocks internal legacy service entry points before touching dependencies", async () => {
    const auth = new AuthService(undefined!, undefined!, undefined!, undefined!, undefined!, undefined!);
    for (const call of [
      () => auth.requestEmailCode(undefined!), () => auth.verifyEmailCode(undefined!, {}),
      () => auth.requestPhoneCode(undefined!), () => auth.verifyPhoneCode(undefined!, {}),
      () => auth.loginWithGoogle(undefined!, {}),
    ]) {
      await expect(call()).rejects.toMatchObject({ status: 403, response: { error: { code: "AUTH_PROVIDER_DISABLED" } } });
    }
  });

  it("guards real HTTP legacy routes even with malformed bodies, while retaining refresh/logout", async () => {
    const auth = { refreshSession: vi.fn().mockResolvedValue({ refreshed: true }), logout: vi.fn().mockResolvedValue({ success: true }) };
    Reflect.defineMetadata("design:paramtypes", [AuthService], AuthController);
    const module = await Test.createTestingModule({ controllers: [AuthController], providers: [{ provide: AuthService, useValue: auth }, DisabledLoginGuard] })
      .overrideGuard(AccessTokenGuard).useValue({ canActivate: () => false }).compile();
    const app = module.createNestApplication({ logger: false });
    try {
      await app.init();
      for (const path of legacyPaths) {
        const response = await request(app.getHttpServer()).post(`/v1/auth/${path}`).send({ invalid: true }).expect(403);
        expect(response.body.error.code).toBe("AUTH_PROVIDER_DISABLED");
      }
      const refreshToken = "x".repeat(64);
      await request(app.getHttpServer()).post("/v1/auth/refresh").send({ refreshToken }).expect(201, { refreshed: true });
      await request(app.getHttpServer()).post("/v1/auth/logout").send({ refreshToken }).expect(201, { success: true });
      expect(auth.refreshSession).toHaveBeenCalledWith(refreshToken);
    } finally { await app.close(); }
  });
});
