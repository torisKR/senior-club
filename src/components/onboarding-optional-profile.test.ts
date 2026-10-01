// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
import { OnboardingFlow } from "./onboarding-flow";

const user = { id: "qa-kakao", email: null, name: "카카오 회원", role: "MEMBER", onboardingCompletedAt: null, birthYear: 1960, region: "서울", phoneNumber: null, interests: [] };
const interest = { id: "qa-interest", slug: "hiking", name: "등산", icon: "mountain" };
let root: Root;
let container: HTMLDivElement;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.scrollTo = vi.fn();
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/auth/session") return Response.json({ authenticated: true, user });
    if (url === "/api/interests") return Response.json({ data: [interest] });
    if (url === "/api/me/profile" && init?.method === "PATCH") return Response.json({ ...user, ...JSON.parse(init.body as string), onboardingCompletedAt: "2026-09-30T00:00:00Z", interests: [interest] });
    throw new Error(`Unexpected API ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

async function click(text: string) {
  const button = Array.from(container.querySelectorAll("button")).find(button => button.textContent?.includes(text));
  expect(button).toBeDefined();
  await act(async () => button!.click());
}

function change(id: string, value: string) {
  const input = container.querySelector(`#${id}`) as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("Kakao member optional profile details", () => {
  it("onboards an account without email, nickname input or phone input", async () => {
    await act(async () => root.render(React.createElement(OnboardingFlow, { returnTo: "/clubs" })));
    expect(container.textContent).toContain("무엇을 함께하고 싶으세요?");
    expect(router.replace).not.toHaveBeenCalled();
    await click("등산");
    await click("다음");
    await act(async () => change("display-name", ""));
    expect((container.querySelector("#display-name") as HTMLInputElement).required).toBe(false);
    expect((container.querySelector("#profile-phone") as HTMLInputElement).required).toBe(false);
    await click("설정 완료하고 둘러보기");
    const saved = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(saved).toBeDefined();
    expect(JSON.parse(saved![1].body)).toMatchObject({ name: "카카오 회원", phoneNumber: null, region: "서울", birthYear: 1960, interestSlugs: ["hiking"] });
    expect(router.replace).toHaveBeenCalledWith("/clubs");
    expect(router.refresh).toHaveBeenCalled();
  });
});
