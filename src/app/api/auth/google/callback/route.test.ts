import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("retired Google web login", () => {
  it("returns to Kakao login with no OAuth or external redirect", async () => {
    const response = GET(new Request("https://club.test/api/auth/google/callback?returnTo=https%3A%2F%2Fevil.test&code=unused"));
    const target = new URL(response.headers.get("location")!);
    expect(target.origin).toBe("https://club.test");
    expect(target.pathname).toBe("/login");
    expect(target.searchParams.get("returnTo")).toBe("/");
    expect(target.searchParams.get("error")).toContain("카카오");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("set-cookie")).toContain("google_oauth_state=;");
  });
});
