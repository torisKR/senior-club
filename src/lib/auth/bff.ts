import "server-only";

import { NextResponse } from "next/server";

import {
  ApiConfigurationError,
  ApiHttpError,
  createJsonApiClient,
} from "@/lib/api";
import { createPrivateNoStoreHeaders } from "@/lib/api/private-response";
import {
  ACCESS_TOKEN_COOKIE_NAME,
  extractAccessTokenFromRequest,
  extractSessionTokenFromRequest,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
} from "@/lib/auth/session";

export interface BackendIssuedSession {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  sessionId: string;
  user: {
    id: string;
    email: string;
    phoneNumber?: string | null;
    name: string;
    role: "MEMBER" | "LEADER" | "ADMIN";
    onboardingCompletedAt: string | null;
  };
}

export class RefreshedBackendOperationError extends Error {
  constructor(
    public readonly upstreamError: unknown,
    public readonly refreshedSession: BackendIssuedSession,
  ) {
    super("Backend operation failed after session refresh");
    this.name = "RefreshedBackendOperationError";
  }
}

export function backendApi() {
  return createJsonApiClient();
}

export function privateNextJson<T>(body: T, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: createPrivateNoStoreHeaders(),
  });
}

export function setSessionCookies(
  response: NextResponse,
  session: BackendIssuedSession,
) {
  response.cookies.set(ACCESS_TOKEN_COOKIE_NAME, session.accessToken, {
    ...SESSION_COOKIE_OPTIONS,
    expires: new Date(session.accessTokenExpiresAt),
  });
  response.cookies.set(SESSION_COOKIE_NAME, session.refreshToken, {
    ...SESSION_COOKIE_OPTIONS,
    expires: new Date(session.refreshTokenExpiresAt),
  });
}

export function clearSessionCookies(response: NextResponse) {
  response.cookies.set(ACCESS_TOKEN_COOKIE_NAME, "", {
    ...SESSION_COOKIE_OPTIONS,
    expires: new Date(0),
  });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...SESSION_COOKIE_OPTIONS,
    expires: new Date(0),
  });
}

export function accessToken(request: Request) {
  return extractAccessTokenFromRequest(request);
}

export function refreshToken(request: Request) {
  return extractSessionTokenFromRequest(request);
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = new URL(request.url).origin;
  if (origin !== expected) {
    throw new ApiHttpError(
      403,
      "요청 출처를 확인할 수 없습니다.",
      "INVALID_ORIGIN",
    );
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLocaleLowerCase("en-US").startsWith("application/json")) {
    throw new ApiHttpError(
      415,
      "JSON 요청만 사용할 수 있습니다.",
      "UNSUPPORTED_MEDIA_TYPE",
    );
  }
}

export function apiErrorResponse(error: unknown): NextResponse {
  if (error instanceof RefreshedBackendOperationError) {
    const response = apiErrorResponse(error.upstreamError);
    setSessionCookies(response, error.refreshedSession);
    return response;
  }
  if (error instanceof ApiHttpError) {
    return privateNextJson(
      {
        error: {
          code: error.code ?? "API_REQUEST_FAILED",
          message: error.message,
          ...(error.requestId ? { requestId: error.requestId } : {}),
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      },
      error.status,
    );
  }
  if (error instanceof ApiConfigurationError) {
    return privateNextJson(
      {
        error: {
          code: "SERVICE_NOT_CONFIGURED",
          message: "로그인 서버 설정을 확인하고 있습니다. 잠시 후 다시 시도해 주세요.",
        },
      },
      503,
    );
  }
  return privateNextJson(
    {
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "로그인 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      },
    },
    502,
  );
}

export async function refreshBackendSession(request: Request) {
  const token = refreshToken(request);
  if (!token) {
    throw new ApiHttpError(401, "로그인이 필요합니다.", "AUTHENTICATION_REQUIRED");
  }
  return backendApi().post<BackendIssuedSession, { refreshToken: string }>(
    "/v1/auth/refresh",
    { refreshToken: token },
  );
}

export function authorizedHeaders(token: string, idempotencyKey?: string) {
  return {
    Authorization: `Bearer ${token}`,
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
  };
}

/** Runs one authenticated API operation and rotates cookies after a single 401. */
export async function withBackendAccess<T>(
  request: Request,
  operation: (token: string) => Promise<T>,
) {
  let refreshed: BackendIssuedSession | null = null;
  let token = accessToken(request);
  if (!token) {
    refreshed = await refreshBackendSession(request);
    token = refreshed.accessToken;
  }

  try {
    return { result: await operation(token), refreshed };
  } catch (error) {
    if (refreshed) {
      throw new RefreshedBackendOperationError(error, refreshed);
    }
    if (!(error instanceof ApiHttpError) || error.status !== 401) {
      throw error;
    }
    refreshed = await refreshBackendSession(request);
    try {
      return { result: await operation(refreshed.accessToken), refreshed };
    } catch (refreshedError) {
      throw new RefreshedBackendOperationError(refreshedError, refreshed);
    }
  }
}
