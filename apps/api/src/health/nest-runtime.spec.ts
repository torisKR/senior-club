import "reflect-metadata";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { HealthController } from "./health.controller";
import { ReadinessService } from "./readiness.service";

describe("Nest runtime and TestingModule compatibility", () => {
  it("serves HTTP health and readiness through the real Express adapter", async () => {
    // esbuild does not emit constructor metadata; provide the same token explicitly.
    Reflect.defineMetadata("design:paramtypes", [ReadinessService], HealthController);
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: ReadinessService, useValue: { check: async () => ({ ready: true, latencyMs: 1 }) } }],
    }).compile();
    const app = module.createNestApplication();
    try {
      await app.init();
      const health = await request(app.getHttpServer()).get("/healthz").expect(200);
      expect(health.body.status).toBe("ok");
      expect(health.headers["cache-control"]).toBe("no-store");
      const ready = await request(app.getHttpServer()).get("/readyz").expect(200);
      expect(ready.body.checks.database).toBe("ok");
    } finally {
      await app.close();
    }
  });
});
