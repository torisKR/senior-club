import { afterEach, describe, expect, it, vi } from "vitest";
import { browserSessionStillCurrent, logoutBrowserSession, readBrowserSession } from "./browser-session";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function deferredResponse() {
  let resolve!: (response: Response) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Response>((yes, no) => { resolve = yes; reject = no; });
  return { resolve, reject, promise };
}

describe("browser session rotation coordination", () => {
  it("three mounted readers issue one request and can each consume their response body", async () => {
    const pending = deferredResponse();
    const transport = vi.fn<typeof fetch>().mockReturnValue(pending.promise);
    const readers = Array.from({ length: 3 }, () => readBrowserSession({ fetchImplementation: transport }));
    expect(transport).toHaveBeenCalledOnce();
    pending.resolve(Response.json({ authenticated: true, user: { id: "member" } }));
    const responses = await Promise.all(readers);
    expect(await Promise.all(responses.map((response) => response.json()))).toEqual(
      Array.from({ length: 3 }, () => ({ authenticated: true, user: { id: "member" } })),
    );
    expect(responses.every(browserSessionStillCurrent)).toBe(true);
  });

  it("unmounting one reader does not abort the shared rotating request or another reader", async () => {
    const pending = deferredResponse();
    const transport = vi.fn<typeof fetch>().mockReturnValue(pending.promise);
    const controller = new AbortController();
    const first = readBrowserSession({ fetchImplementation: transport, signal: controller.signal });
    const second = readBrowserSession({ fetchImplementation: transport });
    const cancelled = expect(first).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await cancelled;
    expect(transport.mock.calls[0][1]?.signal?.aborted).toBe(false);
    pending.resolve(Response.json({ authenticated: true }));
    expect(await (await second).json()).toEqual({ authenticated: true });
    expect(transport).toHaveBeenCalledOnce();
  });

  it("an already cancelled component never starts rotation", async () => {
    const transport = vi.fn<typeof fetch>();
    const signal = AbortSignal.abort();
    await expect(readBrowserSession({ fetchImplementation: transport, signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("failed requests are released so an explicit retry can reach the server", async () => {
    const transport = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError("Offline"))
      .mockResolvedValueOnce(Response.json({ authenticated: false }));
    await expect(readBrowserSession({ fetchImplementation: transport })).rejects.toThrow("Offline");
    const response = await readBrowserSession({ fetchImplementation: transport });
    expect(await response.json()).toEqual({ authenticated: false });
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("logout waits for rotating cookies and invalidates old readers before revocation", async () => {
    const pending = deferredResponse();
    const transport = vi.fn<typeof fetch>().mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(Response.json({ success: true }));
    const reader = readBrowserSession({ fetchImplementation: transport });
    const cancelled = expect(reader).rejects.toMatchObject({ name: "AbortError" });
    const logout = logoutBrowserSession(transport);
    const duplicateLogout = logoutBrowserSession(transport);
    expect(transport).toHaveBeenCalledOnce();
    pending.resolve(Response.json({ authenticated: true }));
    await cancelled;
    expect((await logout).ok).toBe(true);
    expect((await duplicateLogout).ok).toBe(true);
    expect(transport.mock.calls.map(([url]) => url)).toEqual(["/api/auth/session", "/api/auth/logout"]);
    expect(transport.mock.calls[1][1]?.method).toBe("POST");
  });

  it("a received body cannot repopulate a profile after logout has started", async () => {
    const logoutReply = deferredResponse();
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ authenticated: true }))
      .mockReturnValueOnce(logoutReply.promise);
    const response = await readBrowserSession({ fetchImplementation: transport });
    expect(browserSessionStillCurrent(response)).toBe(true);
    const logout = logoutBrowserSession(transport);
    expect(browserSessionStillCurrent(response)).toBe(false);
    const newReader = readBrowserSession({ fetchImplementation: transport });
    const cancelled = expect(newReader).rejects.toMatchObject({ name: "AbortError" });
    logoutReply.resolve(Response.json({ success: true }));
    await logout;
    await cancelled;
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("uses the same exclusive browser lock for session reads and logout when available", async () => {
    const lock = vi.fn(async (_name: string, _options: unknown, operation: () => Promise<Response>) => operation());
    vi.stubGlobal("navigator", { locks: { request: lock } });
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ authenticated: true }));
    await readBrowserSession({ fetchImplementation: transport });
    await logoutBrowserSession(transport);
    expect(lock).toHaveBeenCalledTimes(2);
    expect(lock.mock.calls.map(([name, options]) => [name, options])).toEqual([
      ["senior-club-browser-session", { mode: "exclusive" }],
      ["senior-club-browser-session", { mode: "exclusive" }],
    ]);
  });

  it("bounds an unresponsive transport and releases the session flight", async () => {
    vi.useFakeTimers();
    const transport = vi.fn<typeof fetch>().mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(new DOMException("Timeout", "AbortError")), { once: true });
    })).mockResolvedValueOnce(Response.json({ authenticated: false }));
    const pending = readBrowserSession({ fetchImplementation: transport });
    const timedOut = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(15_000);
    await timedOut;
    expect((await readBrowserSession({ fetchImplementation: transport })).ok).toBe(true);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("keeps the timeout active when headers arrive but the response body stalls", async () => {
    vi.useFakeTimers();
    const transport = vi.fn<typeof fetch>().mockImplementationOnce(async (_url, init) => new Response(new ReadableStream({
      start(controller) {
        init!.signal!.addEventListener("abort", () => controller.error(new DOMException("Body timeout", "AbortError")), { once: true });
      },
    })));
    const pending = readBrowserSession({ fetchImplementation: transport });
    const timedOut = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(15_000);
    await timedOut;
  });
});
