import { describe, expect, it, vi } from "vitest";

import { parseApiEnv } from "../config/env";
import type { DatabaseHealthProbe } from "../prisma/database-health-probe";
import { ReadinessService } from "./readiness.service";

const DATABASE_URL = "postgresql://user:password@localhost:5432/senior_club";

function createService(database: DatabaseHealthProbe, timeoutMs = 100) {
  const env = parseApiEnv({
    NODE_ENV: "test",
    DATABASE_URL,
    DATABASE_CONNECT_TIMEOUT_MS: String(timeoutMs),
    READINESS_TIMEOUT_MS: String(timeoutMs),
  });
  return new ReadinessService(database, env);
}

describe("ReadinessService", () => {
  it("reports ready after a successful database probe", async () => {
    const ping = vi.fn().mockResolvedValue(undefined);
    const result = await createService({ ping }).check();

    expect(result.ready).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(ping).toHaveBeenCalledOnce();
  });

  it("reports not ready without leaking the probe error", async () => {
    const ping = vi.fn().mockRejectedValue(new Error("database-secret"));
    const result = await createService({ ping }).check();

    expect(result).toMatchObject({ ready: false });
    expect(result).not.toHaveProperty("error");
  });
});

