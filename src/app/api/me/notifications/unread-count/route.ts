import {
  apiErrorResponse,
  authorizedHeaders,
  backendApi,
  privateNextJson,
  setSessionCookies,
  withBackendAccess,
} from "@/lib/auth/bff";
import { unreadCountEndpoint } from "@/lib/notifications-bff";

export async function GET(request: Request) {
  try {
    const endpoint = unreadCountEndpoint(request);
    const { result, refreshed } = await withBackendAccess(request, (token) =>
      backendApi().get(endpoint, {
        cache: "no-store",
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
