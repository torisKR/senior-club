import "server-only";

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Route } from "next";

import { ApiHttpError } from "@/lib/api";
import { backendApi } from "@/lib/auth/bff";
import { sanitizeReturnTo } from "@/lib/auth/return-to";
import { extractAccessToken } from "@/lib/auth/session";

export type BackendUserRole = "MEMBER" | "LEADER" | "ADMIN";

export type BackendUser = {
  id: string;
  email: string;
  phoneNumber?: string | null;
  name: string;
  role: BackendUserRole;
  onboardingCompletedAt: string | null;
  birthYear?: number | null;
  region?: string | null;
  avatarUrl?: string | null;
  interests?: Array<{ id: string; slug: string; name: string; icon: string }>;
  notificationPreference?: {
    pushEnabled: boolean;
    pushEventUpdates: boolean;
    pushChatMessages: boolean;
    emailEventUpdates: boolean;
    emailNewsletter: boolean;
  } | null;
};

function loginRoute(returnTo: string): Route {
  const safeReturnTo = sanitizeReturnTo(returnTo);
  return `/login?returnTo=${encodeURIComponent(safeReturnTo)}` as Route;
}

/**
 * Protects server-rendered private shells. Authoritative resource checks still
 * live in the API; this prevents fixture/private UI from being rendered before
 * a live session has been verified.
 */
export async function requireServerUser(
  returnTo: string,
  allowedRoles: readonly BackendUserRole[] = ["MEMBER", "LEADER", "ADMIN"],
) {
  const requestHeaders = await headers();
  const token = extractAccessToken(requestHeaders.get("cookie"));
  if (!token) redirect(loginRoute(returnTo));

  try {
    const user = await backendApi().get<BackendUser>("/v1/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!allowedRoles.includes(user.role)) notFound();
    return user;
  } catch (error) {
    if (error instanceof ApiHttpError && error.status === 401) {
      redirect(loginRoute(returnTo));
    }
    throw error;
  }
}
