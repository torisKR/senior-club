import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

describe("Google OAuth helpers", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-google-client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-google-client-secret");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("builds an encoded authorize URL", async () => {
    const { getGoogleAuthorizeUrl } = await import("./google");
    const url = new URL(
      getGoogleAuthorizeUrl("https://example.test/callback", "state-123"),
    );
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.pathname).toBe("/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("test-google-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://example.test/callback",
    );
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-123");
  });

  it("exchanges a code with bounded fetch and returns tokens", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: "mock-access-token",
            id_token: "mock-id-token",
          }),
          { status: 200 },
        ),
      ),
    );
    const { exchangeGoogleCodeForToken } = await import("./google");
    await expect(
      exchangeGoogleCodeForToken("code-xyz", "https://example.test/callback"),
    ).resolves.toEqual({
      access_token: "mock-access-token",
      id_token: "mock-id-token",
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/token",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
