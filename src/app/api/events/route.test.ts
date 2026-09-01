import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPublicEventCatalog } = vi.hoisted(() => ({
  getPublicEventCatalog: vi.fn(),
}));

vi.mock("@/lib/events/server", () => ({ getPublicEventCatalog }));

import { GET } from "@/app/api/events/route";

describe("GET /api/events", () => {
  beforeEach(() => {
    getPublicEventCatalog.mockReset();
    getPublicEventCatalog.mockResolvedValue({
      events: [{ id: "event-live", category: "photo" }],
      nextCursor: null,
      hasNextPage: false,
    });
  });

  it("uses the backend catalog and keeps legacy public filters compatible", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/events?category=사진&status=recruiting",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=120");
    expect(getPublicEventCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ category: "photo", view: "upcoming" }),
    );
    expect(body.meta.source).toBe("backend");
    expect(body.data).toEqual([{ id: "event-live", category: "photo" }]);
  });

  it("forwards the explicit past view", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/events?view=past&limit=10"),
    );

    expect(response.status).toBe(200);
    expect(getPublicEventCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ view: "past", limit: 10 }),
    );
  });

  it("rejects unknown filters before calling the backend", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/events?category=낚시"),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_CATEGORY");
    expect(getPublicEventCatalog).not.toHaveBeenCalled();
  });

  it("fails closed instead of returning fixtures when the backend is down", async () => {
    getPublicEventCatalog.mockRejectedValue(new Error("offline"));

    const response = await GET(
      new NextRequest("http://localhost/api/events?view=all"),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).error.code).toBe("UPSTREAM_UNAVAILABLE");
  });
});
