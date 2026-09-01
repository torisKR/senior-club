import { afterEach, describe, expect, it } from "vitest";

import { getSiteUrl } from "@/lib/site-url";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("getSiteUrl", () => {
  it("uses the explicit public URL first", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://club.example";
    process.env.VERCEL_URL = "preview.vercel.app";
    expect(getSiteUrl()).toBe("https://club.example");
  });

  it("normalizes a Vercel hostname", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    process.env.VERCEL_URL = "club-senior-preview.vercel.app";
    expect(getSiteUrl()).toBe("https://club-senior-preview.vercel.app");
  });

  it("uses the stable Vercel production origin before a preview origin", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "senior-club.vercel.app";
    process.env.VERCEL_URL = "senior-club-feature-123.vercel.app";

    expect(getSiteUrl()).toBe("https://senior-club.vercel.app");
  });

  it("removes trailing slashes before composing metadata URLs", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://club.example///";
    expect(getSiteUrl()).toBe("https://club.example");
  });

  it("allows an HTTP origin only for local development", () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3100";
    expect(getSiteUrl()).toBe("http://localhost:3100");

    process.env.NEXT_PUBLIC_APP_URL = "http://senior-club.example";
    expect(() => getSiteUrl()).toThrow("HTTPS");
  });

  it.each([
    "https://user:secret@senior-club.example",
    "https://senior-club.example/app",
    "https://senior-club.example?campaign=launch",
    "https://senior-club.example#home",
  ])("rejects a canonical value that is not a clean origin: %s", (value) => {
    process.env.NEXT_PUBLIC_APP_URL = value;
    expect(() => getSiteUrl()).toThrow();
  });
});
