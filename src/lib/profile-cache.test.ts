import { describe, expect, it, vi } from "vitest";

import {
  PROFILE_STORAGE_KEY,
  clearServerProfileCache,
  syncServerProfileCache,
  syncServerProfileCacheFromSession,
  toCachedServerProfile,
} from "@/lib/profile-cache";

const completeProfile = {
  id: "user-1",
  name: "김정희",
  birthYear: 1962,
  region: "서울",
  onboardingCompletedAt: "2026-07-30T01:00:00.000Z",
  interests: [
    { slug: "hiking" },
    { slug: "photo" },
    { slug: "history" },
  ],
};

describe("server profile compatibility cache", () => {
  it("derives the legacy display fields from an authoritative server profile", () => {
    expect(toCachedServerProfile(completeProfile, 2026)).toEqual({
      source: "server",
      userId: "user-1",
      name: "김정희",
      birthYear: 1962,
      region: "서울",
      ageGroup: "60대",
      interests: ["hiking", "photo", "history"],
      onboardedAt: "2026-07-30T01:00:00.000Z",
    });
  });

  it("removes stale cache data when the server profile is incomplete", () => {
    const storage = {
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };

    expect(
      syncServerProfileCache(storage, { ...completeProfile, birthYear: null }, 2026),
    ).toBeNull();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).toHaveBeenCalledWith(PROFILE_STORAGE_KEY);
  });

  it("writes and explicitly clears only the compatibility profile key", () => {
    const storage = {
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };

    syncServerProfileCache(storage, completeProfile, 2026);
    expect(storage.setItem).toHaveBeenCalledWith(
      PROFILE_STORAGE_KEY,
      expect.stringContaining('"source":"server"'),
    );

    clearServerProfileCache(storage);
    expect(storage.removeItem).toHaveBeenLastCalledWith(PROFILE_STORAGE_KEY);
  });

  it("restores a cross-device profile from the authenticated session payload", () => {
    const storage = {
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };

    expect(
      syncServerProfileCacheFromSession(
        storage,
        { authenticated: true, user: completeProfile },
        2026,
      ),
    ).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(
      PROFILE_STORAGE_KEY,
      expect.stringContaining('"userId":"user-1"'),
    );
  });
});
