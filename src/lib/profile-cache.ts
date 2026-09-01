export const PROFILE_STORAGE_KEY = "club-senior-profile";
export const PROFILE_SESSION_SYNC_KEY = "senior-club-profile-session-sync-v1";
export const PROFILE_CACHE_CHANGE_EVENT = "senior-club-profile-cache-change";

type ProfileCacheStorage = Pick<Storage, "setItem" | "removeItem">;

function notifyProfileCacheChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PROFILE_CACHE_CHANGE_EVENT));
  }
}

export type ServerProfileForCache = {
  id?: unknown;
  name?: unknown;
  birthYear?: unknown;
  region?: unknown;
  onboardingCompletedAt?: unknown;
  interests?: unknown;
};

export type CachedServerProfile = {
  source: "server";
  userId: string;
  name: string;
  birthYear: number;
  region: string;
  ageGroup: string;
  interests: string[];
  onboardedAt: string;
};

function ageGroupForBirthYear(birthYear: number, currentYear: number) {
  const age = currentYear - birthYear;
  if (age >= 80) return "80대 이상";
  return `${Math.max(0, Math.floor(age / 10) * 10)}대`;
}

function interestSlugs(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((interest) => {
    if (
      typeof interest !== "object" ||
      interest === null ||
      !("slug" in interest) ||
      typeof interest.slug !== "string"
    ) {
      return [];
    }
    const slug = interest.slug.trim();
    return slug ? [slug] : [];
  });
}

export function toCachedServerProfile(
  profile: ServerProfileForCache,
  currentYear = new Date().getUTCFullYear(),
): CachedServerProfile | null {
  const userId = typeof profile.id === "string" ? profile.id.trim() : "";
  const name = typeof profile.name === "string" ? profile.name.trim() : "";
  const region =
    typeof profile.region === "string" ? profile.region.trim() : "";
  const birthYear = profile.birthYear;
  const onboardedAt = profile.onboardingCompletedAt;

  if (
    !userId ||
    !name ||
    !region ||
    typeof birthYear !== "number" ||
    !Number.isInteger(birthYear) ||
    birthYear < 1900 ||
    birthYear > currentYear - 18 ||
    typeof onboardedAt !== "string" ||
    Number.isNaN(Date.parse(onboardedAt))
  ) {
    return null;
  }

  return {
    source: "server",
    userId,
    name,
    birthYear,
    region,
    ageGroup: ageGroupForBirthYear(birthYear, currentYear),
    interests: interestSlugs(profile.interests).slice(0, 3),
    onboardedAt,
  };
}

/**
 * Mirrors an authoritative API profile for legacy home personalization only.
 * Incomplete server profiles remove the mirror so stale account data is never
 * treated as a source of truth.
 */
export function syncServerProfileCache(
  storage: ProfileCacheStorage,
  profile: ServerProfileForCache,
  currentYear?: number,
) {
  try {
    const cached = toCachedServerProfile(profile, currentYear);
    if (!cached) {
      storage.removeItem(PROFILE_STORAGE_KEY);
      notifyProfileCacheChanged();
      return null;
    }
    storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(cached));
    notifyProfileCacheChanged();
    return cached;
  } catch {
    return null;
  }
}

export function clearServerProfileCache(storage: ProfileCacheStorage) {
  try {
    storage.removeItem(PROFILE_STORAGE_KEY);
    notifyProfileCacheChanged();
  } catch {
    // Storage can be unavailable in locked-down browsers; auth still succeeds.
  }
}

export function syncServerProfileCacheFromSession(
  storage: ProfileCacheStorage,
  session: unknown,
  currentYear?: number,
) {
  if (typeof session !== "object" || session === null) return false;
  const payload = session as { authenticated?: unknown; user?: unknown };
  if (payload.authenticated === false) {
    clearServerProfileCache(storage);
    return true;
  }
  if (
    payload.authenticated !== true ||
    typeof payload.user !== "object" ||
    payload.user === null
  ) {
    return false;
  }
  syncServerProfileCache(storage, payload.user, currentYear);
  return true;
}
