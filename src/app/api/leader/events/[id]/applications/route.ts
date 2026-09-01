import {
  apiErrorResponse,
  authorizedHeaders,
  backendApi,
  privateNextJson,
  setSessionCookies,
  withBackendAccess,
} from "@/lib/auth/bff";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const query = new URL(request.url).search;
    const { result, refreshed } = await withBackendAccess(request, (token) =>
      backendApi().get(
        `/v1/events/${encodeURIComponent(id)}/applications${query}`,
        {
          cache: "no-store",
          headers: authorizedHeaders(token),
        },
      ),
    );
    const response = privateNextJson(result);
    if (refreshed) setSessionCookies(response, refreshed);
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}
