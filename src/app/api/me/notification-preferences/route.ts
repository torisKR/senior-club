import {
  assertSameOrigin,
  authorizedHeaders,
  backendApi,
  apiErrorResponse,
  privateNextJson,
  setSessionCookies,
  withBackendAccess,
} from "@/lib/auth/bff";

export async function GET(request: Request) {
  try {
    const { result, refreshed } = await withBackendAccess(request, (token) =>
      backendApi().get("/v1/me/notification-preferences", {
        headers: authorizedHeaders(token),
      }),
    );
    const response = privateNextJson(result);
    if (refreshed) setSessionCookies(response, refreshed);
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const body = (await request.json()) as Record<string, unknown>;
    const { result, refreshed } = await withBackendAccess(request, (token) =>
      backendApi().patch(
        "/v1/me/notification-preferences",
        body,
        { headers: authorizedHeaders(token) },
      ),
    );
    const response = privateNextJson(result);
    if (refreshed) setSessionCookies(response, refreshed);
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}
