import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();

vi.mock("@/lib/api", () => ({
  createJsonApiClient: () => ({ get }),
}));

import { GET } from "./route";

describe("web readiness route", () => {
  beforeEach(() => {
    get.mockReset();
  });

  it("reports ready only when the API and database are ready", async () => {
    get.mockResolvedValue({
      status: "ready",
      service: "senior-club-api",
      checks: { database: "ok" },
      latencyMs: 12,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ready",
      service: "senior-club-web",
      checks: { web: "ok", api: "ok", database: "ok" },
      upstreamLatencyMs: 12,
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("fails closed when the upstream probe is unavailable", async () => {
    get.mockRejectedValue(new Error("offline"));

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: "not_ready",
      service: "senior-club-web",
      checks: { web: "ok", api: "unavailable", database: "unknown" },
    });
  });

  it("rejects a non-ready upstream response", async () => {
    get.mockResolvedValue({ status: "ready", checks: { database: "failed" } });

    const response = await GET();

    expect(response.status).toBe(503);
  });
});
