import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  requireServerUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
  useRouter: vi.fn(),
}));
vi.mock("@/lib/auth/server", () => ({
  requireServerUser: mocks.requireServerUser,
}));

import EditLeaderEventPage from "@/app/leader/events/[id]/edit/page";
import NewLeaderEventPage from "@/app/leader/events/new/page";
import LeaderPage from "@/app/leader/page";

describe("leader page access gates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireServerUser.mockResolvedValue({
      id: "leader-1",
      onboardingCompletedAt: "2026-07-30T00:00:00.000Z",
    });
  });

  it("guards the operation room with leader/admin roles", async () => {
    await LeaderPage();
    expect(mocks.requireServerUser).toHaveBeenCalledWith("/leader", [
      "LEADER",
      "ADMIN",
    ]);
  });

  it("guards new and edit pages with their exact return paths", async () => {
    await NewLeaderEventPage();
    await EditLeaderEventPage({
      params: Promise.resolve({ id: "event-managed-1" }),
      searchParams: Promise.resolve({}),
    });

    expect(mocks.requireServerUser).toHaveBeenNthCalledWith(
      1,
      "/leader/events/new",
      ["LEADER", "ADMIN"],
    );
    expect(mocks.requireServerUser).toHaveBeenNthCalledWith(
      2,
      "/leader/events/event-managed-1/edit",
      ["LEADER", "ADMIN"],
    );
  });

  it("fails closed on an unsafe edit id before checking a session", async () => {
    await expect(
      EditLeaderEventPage({
        params: Promise.resolve({ id: "../admin" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.requireServerUser).not.toHaveBeenCalled();
  });

  it("sends an incomplete leader to onboarding with the exact intent", async () => {
    mocks.requireServerUser.mockResolvedValue({
      id: "leader-1",
      onboardingCompletedAt: null,
    });

    await expect(NewLeaderEventPage()).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.redirect).toHaveBeenCalledWith(
      "/onboarding?returnTo=%2Fleader%2Fevents%2Fnew",
    );
  });
});
