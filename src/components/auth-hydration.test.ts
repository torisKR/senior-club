// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { AuthNav } from "./auth-nav";
import LoginPage from "@/app/login/page";
import { EventApplication } from "./event-application";
import { clearServerProfileCache, syncServerProfileCache } from "@/lib/profile-cache";

let root: Root | undefined;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ authenticated: false })));
  window.localStorage.clear();
  window.history.replaceState({}, "", "/login");
  container = document.createElement("div");
  document.body.appendChild(container);
});
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("authentication client rendering", () => {
  it("applies and cancels through mocked API responses, not a live database", async () => {
    const application = { id: "qa-application", eventId: "qa-event", userId: "qa-user",
      status: "PENDING", appliedAt: "2026-01-01T00:00:00Z" };
    const request = vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === "POST") return Response.json(application);
      if (init?.method === "DELETE") return Response.json({ ...application, status: "CANCELED" });
      return Response.json({ application: null });
    });
    vi.stubGlobal("fetch", request);
    root = createRoot(container);
    await act(async () => root!.render(React.createElement(EventApplication, {
      eventId: "qa-event", eventTitle: "QA 모임", capacity: 10, participantCount: 2,
    })));
    const clickButton = async (text: string) => {
      const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.trim() === text);
      expect(button).toBeDefined();
      await act(async () => button!.click());
    };
    await clickButton("모임 신청하기");
    expect(container.textContent).toContain("승인 대기");
    expect(request).toHaveBeenCalledWith("/api/events/qa-event/applications", expect.objectContaining({
      method: "POST", headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
    }));
    await clickButton("신청 취소");
    expect(container.textContent).toContain("정말 신청을 취소할까요?");
    await clickButton("신청 취소하기");
    expect(container.textContent).toContain("모임 신청을 취소했습니다.");
  });

  it("logs out and removes the cached profile with a mocked session endpoint", async () => {
    syncServerProfileCache(localStorage, {
      id: "qa-user", name: "QA회원", birthYear: 1960, region: "서울",
      onboardingCompletedAt: "2026-01-01T00:00:00Z", interests: [],
    });
    root = createRoot(container);
    await act(async () => root!.render(React.createElement(AuthNav)));
    await act(async () => (container.querySelector('[aria-label="로그아웃"]') as HTMLButtonElement).click());
    expect(fetch).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({ method: "POST" }));
    expect(localStorage.getItem("club-senior-profile")).toBeNull();
    expect(container.textContent).toContain("로그인");
    expect(router.refresh).toHaveBeenCalled();
  });
  it("renders a cached profile without an update loop and observes cache changes", async () => {
    const errors: unknown[] = [];
    syncServerProfileCache(localStorage, {
      id: "qa-user", name: "QA회원", birthYear: 1960, region: "서울",
      onboardingCompletedAt: "2026-01-01T00:00:00Z", interests: [],
    });
    root = createRoot(container, { onUncaughtError: (error) => errors.push(error) });
    await act(async () => root!.render(React.createElement(AuthNav)));
    expect(errors).toEqual([]);
    expect(container.textContent).toContain("QA회원님");
    await act(async () => {
      syncServerProfileCache(localStorage, {
        id: "qa-user", name: "변경회원", birthYear: 1960, region: "서울",
        onboardingCompletedAt: "2026-01-01T00:00:00Z", interests: [],
      });
    });
    expect(container.textContent).toContain("변경회원님");
    await act(async () => clearServerProfileCache(localStorage));
    expect(container.textContent).toContain("로그인");
    expect(container.textContent).not.toContain("변경회원님");
  });

  it("hydrates an OAuth error URL without replacing the server tree", async () => {
    window.history.replaceState({}, "", "/login?error=qa-oauth-error");
    const browserWindow = window;
    vi.stubGlobal("window", undefined);
    const html = renderToString(React.createElement(LoginPage));
    vi.stubGlobal("window", browserWindow);
    // Trusted HTML rendered from this local component, not user-supplied markup.
    container.innerHTML = html;
    const recoverable: unknown[] = [];
    await act(async () => {
      root = hydrateRoot(container, React.createElement(LoginPage), {
        onRecoverableError: (error) => recoverable.push(error),
      });
    });
    expect(recoverable).toEqual([]);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("qa-oauth-error");
    await act(async () => {
      (container.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    });
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
