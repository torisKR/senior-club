import {
  apiErrorResponse,
  assertSameOrigin,
  authorizedHeaders,
  backendApi,
  privateNextJson,
  setSessionCookies,
  withBackendAccess,
} from "@/lib/auth/bff";
import { readEmptyJsonBody } from "@/lib/notifications-bff";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await readEmptyJsonBody(request);
    const { result, refreshed } = await withBackendAccess(request, (token) =>
      backendApi().post("/v1/me/notifications/read-all", {}, {
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
