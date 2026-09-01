import {
  apiErrorResponse,
  assertSameOrigin,
  authorizedHeaders,
  backendApi,
  privateNextJson,
  setSessionCookies,
  withBackendAccess,
} from "@/lib/auth/bff";
import {
  notificationReadEndpoint,
  readEmptyJsonBody,
} from "@/lib/notifications-bff";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    await readEmptyJsonBody(request);
    const { id } = await context.params;
    const endpoint = notificationReadEndpoint(id);
    const { result, refreshed } = await withBackendAccess(request, (token) =>
      backendApi().patch(endpoint, {}, {
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
