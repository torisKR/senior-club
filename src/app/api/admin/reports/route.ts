import {
  apiErrorResponse,
  authorizedHeaders,
  backendApi,
  privateNextJson,
  setSessionCookies,
  withBackendAccess,
} from "@/lib/auth/bff";

export async function GET(request: Request) {
  try {
    const { result, refreshed } = await withBackendAccess(request, (token) =>
      backendApi().get("/v1/admin/reports", {
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
