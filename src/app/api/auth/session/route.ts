import { ApiHttpError } from "@/lib/api";
import {
  accessToken,
  backendApi,
  type BackendIssuedSession,
  apiErrorResponse,
  clearSessionCookies,
  privateNextJson,
  refreshBackendSession,
  setSessionCookies,
} from "@/lib/auth/bff";

type Me = BackendIssuedSession["user"] & Record<string, unknown>;

async function fetchMe(token: string) {
  return backendApi().get<Me>("/v1/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function GET(request: Request) {
  let refreshed: BackendIssuedSession | null = null;
  try {
    let token = accessToken(request);
    let me: Me;
    if (token) {
      try {
        me = await fetchMe(token);
      } catch (error) {
        if (!(error instanceof ApiHttpError) || error.status !== 401) throw error;
        refreshed = await refreshBackendSession(request);
        token = refreshed.accessToken;
        me = await fetchMe(token);
      }
    } else {
      refreshed = await refreshBackendSession(request);
      me = await fetchMe(refreshed.accessToken);
    }

    const response = privateNextJson({ authenticated: true, user: me });
    if (refreshed) setSessionCookies(response, refreshed);
    return response;
  } catch (error) {
    if (error instanceof ApiHttpError && error.status === 401) {
      const response = privateNextJson({ authenticated: false });
      clearSessionCookies(response);
      return response;
    }
    return apiErrorResponse(error);
  }
}
