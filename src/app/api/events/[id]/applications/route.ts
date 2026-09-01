import { ApiHttpError } from "@/lib/api";
import {
  assertSameOrigin,
  authorizedHeaders,
  backendApi,
  apiErrorResponse,
  privateNextJson,
  setSessionCookies,
  withBackendAccess,
} from "@/lib/auth/bff";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { result, refreshed } = await withBackendAccess(request, (token) =>
      backendApi().get(`/v1/events/${encodeURIComponent(id)}/applications/me`, {
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

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    await request.json();
    const { id } = await context.params;
    const key = request.headers.get("idempotency-key");
    if (!key) {
      throw new ApiHttpError(400, "요청 식별자가 필요합니다.", "IDEMPOTENCY_KEY_REQUIRED");
    }
    const { result, refreshed } = await withBackendAccess(request, (token) =>
      backendApi().post(
        `/v1/events/${encodeURIComponent(id)}/applications`,
        {},
        { headers: authorizedHeaders(token, key) },
      ),
    );
    const response = privateNextJson(result, 201);
    if (refreshed) setSessionCookies(response, refreshed);
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    await request.json();
    const { id } = await context.params;
    const { result, refreshed } = await withBackendAccess(request, (token) =>
      backendApi().delete(`/v1/events/${encodeURIComponent(id)}/applications/me`, {
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
