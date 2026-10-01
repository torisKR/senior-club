import "reflect-metadata";
import { Test } from "@nestjs/testing";
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
    const controller = module.get(HealthController);
    const health = controller.health();
    expect(health.status).toBe("ok");
    expect(health.service).toBe("senior-club-api");

    const mockResponse: any = { status: (code: number) => { mockResponse.statusCode = code; } };
    const ready = await controller.ready(mockResponse);
    expect(ready.status).toBe("ready");
    expect(ready.checks.database).toBe("ok");
    expect(mockResponse.statusCode).toBe(200);
  });
});
