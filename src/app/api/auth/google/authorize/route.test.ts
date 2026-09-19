import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GET } from "@/app/api/auth/google/authorize/route";

describe("Google authorize", () => {
  it("sanitizes external returnTo and disables caching", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "key");
    const response = await GET(
      new Request(
        "https://club.test/api/auth/google/authorize?returnTo=https%3A%2F%2Fevil.test",
      ),
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
    const location = new URL(response.headers.get("location")!);
    const state = JSON.parse(
      Buffer.from(location.searchParams.get("state")!, "base64url").toString(),
    );
    expect(state.returnTo).toBe("/");
    vi.unstubAllEnvs();
  });
});
