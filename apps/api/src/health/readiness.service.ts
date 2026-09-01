import { Inject, Injectable, Logger } from "@nestjs/common";

import type { ApiEnv } from "../config/env";
import { API_ENV } from "../config/env.module";
import {
  DATABASE_HEALTH_PROBE,
  type DatabaseHealthProbe,
} from "../prisma/database-health-probe";

export class ReadinessTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Database readiness check exceeded ${timeoutMs}ms`);
    this.name = "ReadinessTimeoutError";
  }
}

export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new ReadinessTimeoutError(timeoutMs)),
      timeoutMs,
    );
    timeout.unref();
  });

  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export interface ReadinessResult {
  readonly ready: boolean;
  readonly latencyMs: number;
}

@Injectable()
export class ReadinessService {
  private readonly logger = new Logger(ReadinessService.name);

  constructor(
    @Inject(DATABASE_HEALTH_PROBE)
    private readonly database: DatabaseHealthProbe,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async check(): Promise<ReadinessResult> {
    const startedAt = performance.now();

    try {
      await withTimeout(this.database.ping(), this.env.READINESS_TIMEOUT_MS);
      return {
        ready: true,
        latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      };
    } catch (error) {
      const errorName = error instanceof Error ? error.name : "UnknownError";
      this.logger.warn(`Database readiness check failed (${errorName})`);
      return {
        ready: false,
        latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      };
    }
  }
}

