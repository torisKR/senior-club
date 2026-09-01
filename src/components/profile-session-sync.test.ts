import { describe, expect, it, vi } from "vitest";

import { synchronizeProfileSession } from "@/components/profile-session-sync";
import {
  PROFILE_SESSION_SYNC_KEY,
  PROFILE_STORAGE_KEY,
} from "@/lib/profile-cache";

describe("cross-device profile session synchronization", () => {
  it("hydrates an empty browser cache from /api/auth/session exactly once", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        authenticated: true,
        user: {
          id: "remote-user",
          name: "이정희",
          birthYear: 1958,
          region: "부산",
          onboardingCompletedAt: "2026-07-30T02:00:00.000Z",
          interests: [{ slug: "reading" }],
        },
      }),
    );
    const profileStorage = {
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const markerStorage = { setItem: vi.fn() };

    await expect(
      synchronizeProfileSession({
        fetchImplementation,
        markerStorage,
        profileStorage,
      }),
    ).resolves.toBe(true);

    expect(fetchImplementation).toHaveBeenCalledOnce();
    expect(fetchImplementation).toHaveBeenCalledWith(
      "/api/auth/session",
      expect.objectContaining({ cache: "no-store", credentials: "same-origin" }),
    );
    expect(profileStorage.setItem).toHaveBeenCalledWith(
      PROFILE_STORAGE_KEY,
      expect.stringContaining('"userId":"remote-user"'),
    );
    expect(markerStorage.setItem).toHaveBeenCalledWith(
      PROFILE_SESSION_SYNC_KEY,
      "done",
    );
  });
});
