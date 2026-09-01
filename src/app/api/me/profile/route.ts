import {
  apiErrorResponse,
  assertSameOrigin,
  authorizedHeaders,
  backendApi,
  privateNextJson,
  setSessionCookies,
  withBackendAccess,
} from "@/lib/auth/bff";

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const body = (await request.json()) as Record<string, unknown>;
    const { result, refreshed } = await withBackendAccess(request, (token) =>
      backendApi().patch("/v1/me/profile", body, {
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
