import type { Route } from "next";

import {
  DEFAULT_RETURN_TO,
  sanitizeReturnTo,
} from "@/lib/auth/return-to";

export { DEFAULT_RETURN_TO };

export const DEMO_SESSION_STORAGE_KEY = "club-senior-session";

const DEMO_SESSION_VERSION = 1 as const;

export type DemoSession = {
  version: typeof DEMO_SESSION_VERSION;
  mode: "demo";
  userId: string;
  email: string;
  name: string;
  startedAt: string;
};

export type DemoSessionInput = {
  email: string;
  name: string;
  now?: string;
};

export type DemoSessionStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

export function normalizeDemoEmail(email: string) {
  return email.trim().toLocaleLowerCase("en-US");
}

export function isValidDemoEmail(email: string) {
  const normalized = normalizeDemoEmail(email);
  return (
    normalized.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  );
}

export function normalizeDemoName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

/**
 * Creates a repeatable browser-demo identifier without storing the email in a
 * localStorage key. This is identity convenience only, not authentication or
 * a security boundary.
 */
export function getStableDemoUserId(email: string) {
  const normalized = normalizeDemoEmail(email);
  let hash = 0x811c9dc5;

  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `demo-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function createDemoSession({
  email,
  name,
  now = new Date().toISOString(),
}: DemoSessionInput): DemoSession {
  const normalizedEmail = normalizeDemoEmail(email);
  const normalizedName = normalizeDemoName(name);

  if (!isValidDemoEmail(normalizedEmail)) {
    throw new Error("유효한 이메일 주소가 필요합니다.");
  }

  if (normalizedName.length < 2 || normalizedName.length > 40) {
    throw new Error("이름은 2자 이상 40자 이하로 입력해 주세요.");
  }

  if (!Number.isFinite(Date.parse(now))) {
    throw new Error("유효한 로그인 시각이 필요합니다.");
  }

  return {
    version: DEMO_SESSION_VERSION,
    mode: "demo",
    userId: getStableDemoUserId(normalizedEmail),
    email: normalizedEmail,
    name: normalizedName,
    startedAt: now,
  };
}

export function parseDemoSession(serialized: string | null | undefined) {
  if (!serialized) return null;

  try {
    const value = JSON.parse(serialized) as Partial<DemoSession>;
    if (
      value.version !== DEMO_SESSION_VERSION ||
      value.mode !== "demo" ||
      typeof value.userId !== "string" ||
      typeof value.email !== "string" ||
      typeof value.name !== "string" ||
      typeof value.startedAt !== "string"
    ) {
      return null;
    }

    const email = normalizeDemoEmail(value.email);
    const name = normalizeDemoName(value.name);
    if (
      !isValidDemoEmail(email) ||
      name.length < 2 ||
      name.length > 40 ||
      !Number.isFinite(Date.parse(value.startedAt)) ||
      value.userId !== getStableDemoUserId(email)
    ) {
      return null;
    }

    return {
      version: DEMO_SESSION_VERSION,
      mode: "demo",
      userId: value.userId,
      email,
      name,
      startedAt: value.startedAt,
    } satisfies DemoSession;
  } catch {
    return null;
  }
}

export function readDemoSession(storage: DemoSessionStorage) {
  try {
    return parseDemoSession(storage.getItem(DEMO_SESSION_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function saveDemoSession(
  storage: DemoSessionStorage,
  session: DemoSession,
) {
  storage.setItem(DEMO_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearDemoSession(storage: DemoSessionStorage) {
  storage.removeItem(DEMO_SESSION_STORAGE_KEY);
}

/** Compatibility alias for fixture-only callers. */
export function getSafeReturnTo(
  value: string | null | undefined,
  fallback: string = DEFAULT_RETURN_TO,
): Route {
  return sanitizeReturnTo(value, fallback);
}

export function buildDemoLoginHref(returnTo: string): Route {
  const safeReturnTo = getSafeReturnTo(returnTo);
  return `/login?returnTo=${encodeURIComponent(safeReturnTo)}` as Route;
}

export function buildDemoOnboardingHref(returnTo: string): Route {
  const safeReturnTo = getSafeReturnTo(returnTo);
  return `/onboarding?returnTo=${encodeURIComponent(safeReturnTo)}` as Route;
}
