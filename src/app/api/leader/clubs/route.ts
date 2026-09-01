import {
  apiErrorResponse,
  authorizedHeaders,
  backendApi,
  privateNextJson,
  setSessionCookies,
  withBackendAccess,
} from "@/lib/auth/bff";
import {
  managedClubsBackendPath,
  parseManagedClubsResponse,
} from "@/lib/leader-events/bff";

export async function GET(request: Request) {
  try {
    const backendPath = managedClubsBackendPath(request.url);
    const { result, refreshed } = await withBackendAccess(request, (token) =>
      backendApi().get(backendPath, {
        cache: "no-store",
        headers: authorizedHeaders(token),
      }),
    );
    const response = privateNextJson(parseManagedClubsResponse(result));
    if (refreshed) setSessionCookies(response, refreshed);
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}
