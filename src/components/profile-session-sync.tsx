"use client";

import { useEffect } from "react";

import {
  PROFILE_SESSION_SYNC_KEY,
  syncServerProfileCacheFromSession,
} from "@/lib/profile-cache";

type SessionSyncOptions = {
  fetchImplementation?: typeof fetch;
  markerStorage: Pick<Storage, "setItem">;
  profileStorage: Pick<Storage, "setItem" | "removeItem">;
  signal?: AbortSignal;
};

export async function synchronizeProfileSession({
  fetchImplementation = fetch,
  markerStorage,
  profileStorage,
  signal,
}: SessionSyncOptions) {
  const response = await fetchImplementation("/api/auth/session", {
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  if (!response.ok) return false;

  const synchronized = syncServerProfileCacheFromSession(
    profileStorage,
    await response.json(),
  );
  if (!synchronized) return false;
  try {
    markerStorage.setItem(PROFILE_SESSION_SYNC_KEY, "done");
  } catch {
    // The authoritative profile was still applied without the optimization.
  }
  return true;
}

/** Restores the server-owned profile mirror once per browser tab. */
export function ProfileSessionSync() {
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(PROFILE_SESSION_SYNC_KEY) === "done") {
        return;
      }
    } catch {
      // Continue without the optimization when sessionStorage is unavailable.
    }

    const controller = new AbortController();
    void synchronizeProfileSession({
      markerStorage: window.sessionStorage,
      profileStorage: window.localStorage,
      signal: controller.signal,
    }).catch(() => undefined);

    return () => controller.abort();
  }, []);

  return null;
}
