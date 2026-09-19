import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GET } from "@/app/api/auth/kakao/authorize/route";

describe("Kakao authorize", () => {
  it("sanitizes external returnTo and disables caching", async () => {
    vi.stubEnv("KAKAO_REST_API_KEY", "key");
    const response = await GET(new Request("https://club.test/api/auth/kakao/authorize?returnTo=https%3A%2F%2Fevil.test"));
    expect(response.headers.get("cache-control")).toContain("no-store");
    const location = new URL(response.headers.get("location")!);
    const state = JSON.parse(Buffer.from(location.searchParams.get("state")!, "base64url").toString());
    expect(state.returnTo).toBe("/");
    vi.unstubAllEnvs();
  });
});
