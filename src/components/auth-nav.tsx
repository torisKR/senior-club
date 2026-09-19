"use client";

import type { Route } from "next";
import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn, UserRound } from "lucide-react";
import { clsx } from "clsx";

import {
  PROFILE_CACHE_CHANGE_EVENT,
  PROFILE_STORAGE_KEY,
  clearServerProfileCache,
  readCachedServerProfile,
  syncServerProfileCacheFromSession,
  type CachedServerProfile,
} from "@/lib/profile-cache";

function subscribeToProfileCache(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(PROFILE_CACHE_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(PROFILE_CACHE_CHANGE_EVENT, onStoreChange);
  };
}

function getClientProfileSnapshot(): CachedServerProfile | null {
  return readCachedServerProfile();
}

function getServerProfileSnapshot(): CachedServerProfile | null {
  return null;
}

export function AuthNav({
  compact = false,
  pathname = "/",
}: {
  compact?: boolean;
  pathname?: string;
}) {
  const router = useRouter();
  const cachedProfile = useSyncExternalStore(
    subscribeToProfileCache,
    getClientProfileSnapshot,
    getServerProfileSnapshot,
  );
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // When mounted, if cache is empty, check session in background
  useEffect(() => {
    if (cachedProfile) return;
    const controller = new AbortController();
    fetch("/api/auth/session", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) return;
        const session = await res.json();
        syncServerProfileCacheFromSession(window.localStorage, session);
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, [cachedProfile]);

  const loginHref =
    pathname && pathname !== "/" && !pathname.startsWith("/login")
      ? `/login?returnTo=${encodeURIComponent(pathname)}`
      : "/login";

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch {
      // Proceed with local cleanup even on network failure
    } finally {
      clearServerProfileCache(window.localStorage);
      setIsLoggingOut(false);
      router.refresh();
    }
  }

  if (cachedProfile) {
    if (compact) {
      return (
        <Link
          aria-label="마이페이지"
          className={clsx(
            "relative inline-flex size-10 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] no-underline transition-colors",
            "hover:border-[var(--primary)] hover:bg-[var(--canvas)] focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[var(--sun)]",
          )}
          href="/me"
        >
          <UserRound aria-hidden="true" className="size-5 text-[var(--primary-strong)]" strokeWidth={2.25} />
        </Link>
      );
    }

    return (
      <div className="flex items-center gap-1.5">
        <Link
          className={clsx(
            "relative inline-flex min-h-13 items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[0.9rem] font-extrabold text-[var(--ink)] no-underline transition-colors",
            "hover:border-[var(--primary)] hover:bg-[var(--canvas)] focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[var(--sun)]",
          )}
          href="/me"
        >
          <UserRound aria-hidden="true" className="size-4 text-[var(--primary-strong)]" strokeWidth={2.5} />
          <span>{cachedProfile.name ? `${cachedProfile.name}님` : "내 정보"}</span>
        </Link>
        <button
          aria-label="로그아웃"
          className={clsx(
            "inline-flex min-h-13 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-[0.85rem] font-bold text-[var(--muted)] transition-colors",
            "hover:border-[var(--line)] hover:bg-[var(--canvas)] hover:text-[var(--ink)] focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[var(--sun)] disabled:opacity-50",
          )}
          disabled={isLoggingOut}
          onClick={handleLogout}
          type="button"
        >
          {isLoggingOut ? "로그아웃…" : "로그아웃"}
        </button>
      </div>
    );
  }

  // Anonymous state: show Login button
  if (compact) {
    return (
      <Link
        aria-label="로그인하기"
        className={clsx(
          "inline-flex min-h-10 items-center justify-center gap-1 rounded-xl bg-[var(--primary)] px-3 py-1.5 text-[0.85rem] font-extrabold text-white no-underline shadow-sm transition-colors",
          "hover:bg-[var(--primary-strong)] focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[var(--sun)]",
        )}
        href={loginHref as Route}
      >
        <LogIn aria-hidden="true" className="size-4" strokeWidth={2.5} />
        <span>로그인</span>
      </Link>
    );
  }

  return (
    <Link
      aria-label="로그인하기"
      className={clsx(
        "inline-flex min-h-13 items-center justify-center gap-1.5 rounded-xl bg-[var(--primary)] px-4 py-2 text-[0.95rem] font-extrabold text-white no-underline shadow-sm transition-colors",
        "hover:bg-[var(--primary-strong)] focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[var(--sun)]",
      )}
      href={loginHref as Route}
    >
      <LogIn aria-hidden="true" className="size-4" strokeWidth={2.5} />
      <span>로그인</span>
    </Link>
  );
}
