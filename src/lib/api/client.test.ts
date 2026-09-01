import { describe, expect, it, vi } from "vitest";

import {
  ApiClientProtocolError,
  ApiClientRequestError,
  ApiClientTimeoutError,
  ApiHttpError,
  createJsonApiClient,
  resolveApiEndpoint,
} from "@/lib/api/client";

describe("typed JSON API client", () => {
  it("joins an endpoint below the configured base path", () => {
    expect(
      resolveApiEndpoint(
        new URL("https://api.senior-club.example/v1"),
        "/events?limit=20",
      ).toString(),
    ).toBe("https://api.senior-club.example/v1/events?limit=20");
  });

  it.each([
    "https://evil.example/events",
    "//evil.example/events",
    "../admin",
    "/%2e%2e/admin",
    "/%252e%252e/admin",
    "/events/%255cadmin",
    "/events/%252fadmin",
    "/events\\..\\admin",
    "#secret",
  ])("rejects endpoint escape attempt %s", (endpoint) => {
    expect(() =>
      resolveApiEndpoint(
        new URL("https://api.senior-club.example/v1"),
        endpoint,
      ),
    ).toThrow(ApiClientRequestError);
  });

  it("sends typed JSON with safe fetch defaults", async () => {
    const fetchSpy = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => Response.json({ data: { id: "application-1" } }));
    const client = createJsonApiClient({
      baseUrl: "https://api.senior-club.example/v1",
      fetchImplementation: fetchSpy as unknown as typeof fetch,
    });

    const response = await client.post<
      { data: { id: string } },
      { eventId: string }
    >("/applications", { eventId: "event-1" });

    expect(response.data.id).toBe("application-1");
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [requestUrl, requestInit] = fetchSpy.mock.calls[0];
    expect(requestUrl.toString()).toBe(
      "https://api.senior-club.example/v1/applications",
    );
    expect(requestInit).toMatchObject({
      body: JSON.stringify({ eventId: "event-1" }),
      cache: "no-store",
      method: "POST",
      redirect: "error",
    });
    expect(new Headers(requestInit?.headers).get("accept")).toBe(
      "application/json",
    );
    expect(new Headers(requestInit?.headers).get("content-type")).toBe(
      "application/json",
    );
  });

  it("rejects a JSON body on GET before fetch", async () => {
    const fetchImplementation = vi.fn() as unknown as typeof fetch;
    const client = createJsonApiClient({
      baseUrl: "https://api.senior-club.example",
      fetchImplementation,
    });

    await expect(
      client.request("/events", { method: "GET", body: { unsafe: true } }),
    ).rejects.toBeInstanceOf(ApiClientRequestError);
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("rejects a value that JSON.stringify cannot represent", async () => {
    const fetchImplementation = vi.fn() as unknown as typeof fetch;
    const client = createJsonApiClient({
      baseUrl: "https://api.senior-club.example",
      fetchImplementation,
    });

    await expect(
      client.post("/events", Symbol("not-json")),
    ).rejects.toBeInstanceOf(ApiClientRequestError);
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("returns an empty 204 response without requiring a content type", async () => {
    const client = createJsonApiClient({
      baseUrl: "https://api.senior-club.example",
      fetchImplementation: vi.fn(async () =>
        new Response(null, { status: 204 }),
      ) as unknown as typeof fetch,
    });

    await expect(client.delete<void>("/session")).resolves.toBeUndefined();
  });

  it("maps the documented API error envelope without exposing another body", async () => {
    const client = createJsonApiClient({
      baseUrl: "https://api.senior-club.example",
      fetchImplementation: vi.fn(async () =>
        Response.json(
          {
            error: {
              code: "AUTHENTICATION_REQUIRED",
              message: "로그인이 필요합니다.",
              requestId: "req-1",
            },
          },
          { status: 401 },
        ),
      ) as unknown as typeof fetch,
    });

    await expect(client.get("/me")).rejects.toMatchObject({
      name: "ApiHttpError",
      status: 401,
      code: "AUTHENTICATION_REQUIRED",
      requestId: "req-1",
      message: "로그인이 필요합니다.",
    } satisfies Partial<ApiHttpError>);
  });

  it("rejects non-JSON and malformed JSON responses", async () => {
    const htmlClient = createJsonApiClient({
      baseUrl: "https://api.senior-club.example",
      fetchImplementation: vi.fn(async () =>
        new Response("<html>proxy error</html>", {
          headers: { "Content-Type": "text/html" },
        }),
      ) as unknown as typeof fetch,
    });
    await expect(htmlClient.get("/me")).rejects.toBeInstanceOf(
      ApiClientProtocolError,
    );

    const malformedClient = createJsonApiClient({
      baseUrl: "https://api.senior-club.example",
      fetchImplementation: vi.fn(async () =>
        new Response("{", {
          headers: { "Content-Type": "application/json" },
        }),
      ) as unknown as typeof fetch,
    });
    await expect(malformedClient.get("/me")).rejects.toBeInstanceOf(
      ApiClientProtocolError,
    );
  });

  it("aborts a stalled upstream request at the configured timeout", async () => {
    const fetchImplementation = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    ) as unknown as typeof fetch;
    const client = createJsonApiClient({
      baseUrl: "https://api.senior-club.example",
      fetchImplementation,
      requestTimeoutMs: 10,
    });

    await expect(client.get("/readyz")).rejects.toMatchObject({
      name: "ApiClientTimeoutError",
      timeoutMs: 10,
    } satisfies Partial<ApiClientTimeoutError>);
  });

  it("preserves a caller abort instead of misreporting it as a timeout", async () => {
    const controller = new AbortController();
    const callerAbort = new DOMException("navigation ended", "AbortError");
    const fetchImplementation = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    ) as unknown as typeof fetch;
    const client = createJsonApiClient({
      baseUrl: "https://api.senior-club.example",
      fetchImplementation,
      requestTimeoutMs: 1_000,
    });

    const request = client.get("/events", { signal: controller.signal });
    controller.abort(callerAbort);

    await expect(request).rejects.toBe(callerAbort);
  });

  it("rejects invalid timeout configuration before any request", () => {
    for (const requestTimeoutMs of [0, 60_001, 1.5, Number.NaN]) {
      expect(() =>
        createJsonApiClient({
          baseUrl: "https://api.senior-club.example",
          requestTimeoutMs,
        }),
      ).toThrow(ApiClientRequestError);
    }
  });
});
