import {
  apiErrorResponse,
  assertSameOrigin,
  authorizedHeaders,
  backendApi,
  privateNextJson,
  setSessionCookies,
  withBackendAccess,
} from "@/lib/auth/bff";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const body = (await request.json()) as Record<string, unknown>;
    const { id } = await context.params;
    const { result, refreshed } = await withBackendAccess(request, (token) =>
      backendApi().patch(
        `/v1/applications/${encodeURIComponent(id)}/attendance`,
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
