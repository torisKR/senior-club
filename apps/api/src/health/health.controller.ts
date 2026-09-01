import { Controller, Get, Header, Res } from "@nestjs/common";
import type { Response } from "express";

import { ReadinessService } from "./readiness.service";

const SERVICE_NAME = "senior-club-api";
const STARTED_AT = Date.now();

@Controller()
export class HealthController {
  constructor(private readonly readiness: ReadinessService) {}

  @Get("healthz")
  @Header("Cache-Control", "no-store")
  health() {
    return {
      status: "ok" as const,
      service: SERVICE_NAME,
      uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1_000),
      timestamp: new Date().toISOString(),
    };
  }

  @Get("readyz")
  @Header("Cache-Control", "no-store")
  async ready(@Res({ passthrough: true }) response: Response) {
    const result = await this.readiness.check();
    response.status(result.ready ? 200 : 503);

    return {
      status: result.ready ? ("ready" as const) : ("not_ready" as const),
      service: SERVICE_NAME,
      checks: {
        database: result.ready ? ("ok" as const) : ("error" as const),
      },
      latencyMs: result.latencyMs,
      timestamp: new Date().toISOString(),
    };
  }
}

