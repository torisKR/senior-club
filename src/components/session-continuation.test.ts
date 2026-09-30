// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(), read: vi.fn(), current: vi.fn(), clearCache: vi.fn(),
}));
const router = { replace: mocks.replace };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/auth/browser-session", () => ({
  readBrowserSession: mocks.read, browserSessionStillCurrent: mocks.current,
}));
vi.mock("@/lib/profile-cache", () => ({ clearServerProfileCache: mocks.clearCache }));

import { SessionContinuation } from "./session-continuation";

let container: HTMLDivElement;
let root: Root;
const completed = "2026-07-30T00:00:00.000Z";
function session(user: Record<string, unknown> = { id: "member", onboardingCompletedAt: completed }) {
  return Response.json({ authenticated: true, user });
}
async function mount(returnTo = "/me?tab=profile#contact") {
  await act(async () => root.render(React.createElement(SessionContinuation, { returnTo })));
}

describe("mounted session continuation", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.clearAllMocks();
    mocks.current.mockReturnValue(true);
    mocks.read.mockImplementation(() => Promise.resolve(session()));
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("restores the original intent through the coordinated browser request", async () => {
    await mount();
    expect(mocks.read).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
    expect(mocks.replace).toHaveBeenCalledWith("/me?tab=profile#contact");
    expect(mocks.clearCache).not.toHaveBeenCalled();
  });

  it("preserves onboarding for an incomplete member", async () => {
    mocks.read.mockResolvedValue(session({ id: "member", onboardingCompletedAt: null }));
    await mount("/events/event-1?intent=apply");
    expect(mocks.replace).toHaveBeenCalledWith("/onboarding?returnTo=%2Fevents%2Fevent-1%3Fintent%3Dapply");
  });

  it("clears the optional mirror and returns an anonymous reader to Kakao login", async () => {
    mocks.read.mockResolvedValue(Response.json({ authenticated: false }));
    await mount();
    expect(mocks.clearCache).toHaveBeenCalledWith(window.localStorage);
    expect(mocks.replace).toHaveBeenCalledWith("/login?returnTo=%2Fme%3Ftab%3Dprofile%23contact");
  });

  it("shows a retryable error and navigates only after the retry succeeds", async () => {
    mocks.read.mockRejectedValueOnce(new Error("Network unavailable"));
    await mount();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("다시 시도");
    expect(mocks.replace).not.toHaveBeenCalled();
    const button = container.querySelector("button")!;
    await act(async () => button.click());
    expect(mocks.read).toHaveBeenCalledTimes(2);
    expect(mocks.replace).toHaveBeenCalledWith("/me?tab=profile#contact");
  });

  it.each([
    () => Response.json({ authenticated: true, user: {} }),
    () => new Response("Unavailable", { status: 503 }),
  ])("does not navigate on malformed or unsuccessful session data %#", async (response) => {
    mocks.read.mockResolvedValue(response());
    await mount();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("ignores a session invalidated by logout", async () => {
    mocks.current.mockReturnValue(false);
    await mount();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.clearCache).not.toHaveBeenCalled();
  });

  it("cannot navigate to a nested authentication loop or another origin", async () => {
    await mount("https://evil.example/me");
    expect(mocks.replace).toHaveBeenCalledWith("/");
    mocks.replace.mockClear();
    await mount("/onboarding?returnTo=%2Fauth%2Fcontinue");
    expect(mocks.replace).toHaveBeenCalledWith("/");
  });

  it("aborts only its own observer on unmount and does not navigate later", async () => {
    let resolve!: (value: Response) => void;
    mocks.read.mockImplementation(({ signal }: { signal: AbortSignal }) => new Promise<Response>((done, reject) => {
      resolve = done;
      signal.addEventListener("abort", () => reject(new DOMException("Unmounted", "AbortError")), { once: true });
    }));
    await mount();
    const signal = mocks.read.mock.calls[0][0].signal as AbortSignal;
    await act(async () => root.render(null));
    expect(signal.aborted).toBe(true);
    await act(async () => resolve(session()));
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
