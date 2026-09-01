import { describe, expect, it } from "vitest";

import {
  ApiConfigurationError,
  getServerApiBaseUrl,
  parseServerApiBaseUrl,
  SERVER_API_BASE_URL_ENV,
} from "@/lib/api/config";

describe("server API base URL", () => {
  it("accepts HTTPS and removes trailing slashes", () => {
    expect(
      parseServerApiBaseUrl("https://api.senior-club.example/v1///").toString(),
    ).toBe("https://api.senior-club.example/v1");
  });

  it("allows insecure HTTP only for an explicitly enabled loopback API", () => {
    expect(
      parseServerApiBaseUrl("http://127.0.0.1:4000/api", {
        allowInsecureLocalhost: true,
      }).toString(),
    ).toBe("http://127.0.0.1:4000/api");

    expect(() =>
      parseServerApiBaseUrl("http://api.senior-club.example", {
        allowInsecureLocalhost: true,
      }),
    ).toThrow(ApiConfigurationError);
  });

  it.each([
    "http://api.senior-club.example",
    "ftp://api.senior-club.example",
    "https://user:secret@api.senior-club.example",
    "https://api.senior-club.example?tenant=other",
    "https://api.senior-club.example#fragment",
    " https://api.senior-club.example",
  ])("rejects unsafe base URL %s", (value) => {
    expect(() => parseServerApiBaseUrl(value)).toThrow(ApiConfigurationError);
  });

  it("fails closed when the server environment variable is missing", () => {
    expect(() => getServerApiBaseUrl({ NODE_ENV: "production" })).toThrowError(
      expect.objectContaining({ code: "MISSING_API_BASE_URL" }),
    );
  });

  it("derives the localhost exception from the supplied environment", () => {
    const developmentEnvironment = {
      NODE_ENV: "development",
      [SERVER_API_BASE_URL_ENV]: "http://localhost:4000",
    };
    expect(getServerApiBaseUrl(developmentEnvironment).origin).toBe(
      "http://localhost:4000",
    );

    expect(() =>
      getServerApiBaseUrl({
        ...developmentEnvironment,
        NODE_ENV: "production",
      }),
    ).toThrow(ApiConfigurationError);
  });
});
