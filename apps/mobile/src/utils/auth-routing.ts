import type { Href } from 'expo-router';

import { parseAppRoute } from '@/notifications/notification-route';

export type AuthIntent = 'apply';

const DEFAULT_RETURN_TO = '/home';

export function getSingleSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function sanitizeAuthIntent(value: string | string[] | undefined): AuthIntent | undefined {
  return getSingleSearchParam(value) === 'apply' ? 'apply' : undefined;
}

export function sanitizeReturnTo(
  value: string | string[] | undefined,
  fallback = DEFAULT_RETURN_TO,
) {
  const candidate = getSingleSearchParam(value)?.trim();
  const parsed = parseAppRoute(candidate);
  return parsed.ok ? parsed.route : fallback;
}

export function buildReturnTo(
  pathname: string,
  params: Record<string, string | string[] | undefined> = {},
) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (key === 'id' || key === 'slug' || key === 'returnTo' || key === 'intent') {
      return;
    }

    const values = Array.isArray(value) ? value : [value];
    values.forEach((item) => {
      if (item) {
        query.append(key, item);
      }
    });
  });

  const queryString = query.toString();
  return sanitizeReturnTo(queryString ? `${pathname}?${queryString}` : pathname);
}

export function buildPostAuthHref(returnTo: string, intent?: AuthIntent): Href {
  const safeReturnTo = sanitizeReturnTo(returnTo);

  if (!intent) {
    return safeReturnTo as Href;
  }

  const separator = safeReturnTo.includes('?') ? '&' : '?';
  return `${safeReturnTo}${separator}intent=${encodeURIComponent(intent)}` as Href;
}

export function buildLoginHref(returnTo: string, intent?: AuthIntent): Href {
  return {
    pathname: '/login',
    params: {
      returnTo: sanitizeReturnTo(returnTo),
      ...(intent ? { intent } : {}),
    },
  };
}

export function buildOnboardingHref(returnTo: string, intent?: AuthIntent): Href {
  return {
    pathname: '/onboarding',
    params: {
      returnTo: sanitizeReturnTo(returnTo),
      ...(intent ? { intent } : {}),
    },
  };
}
