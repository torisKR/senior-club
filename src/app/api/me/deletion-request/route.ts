import {
  assertSameOrigin,
  authorizedHeaders,
  backendApi,
  clearSessionCookies,
  privateNextJson,
  setSessionCookies,
  withBackendAccess,
  apiErrorResponse,
} from "@/lib/auth/bff";

type DeletionRequest = {
  id: string;
  status: "REQUESTED" | "PROCESSING" | "FAILED" | "CANCELED" | "COMPLETED";
  requestedAt: string;
  scheduledFor: string;
  completedAt: string | null;
};

type CurrentDeletionResponse = {
  deletionRequest: DeletionRequest | null;
};

function responseWithRefresh<T>(body: T, refreshed: Parameters<typeof setSessionCookies>[1] | null) {
  const response = privateNextJson(body);
  if (refreshed) setSessionCookies(response, refreshed);
  return response;
}

export async function GET(request: Request) {
  try {
    const { result, refreshed } = await withBackendAccess(request, (token) =>
      backendApi().get<CurrentDeletionResponse>("/v1/me/deletion-request", {
        headers: authorizedHeaders(token),
      }),
    );
    return responseWithRefresh(result, refreshed);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = (await request.json()) as {
      confirmation?: unknown;
      reason?: unknown;
    };
    const { result } = await withBackendAccess(request, (token) =>
      backendApi().post<DeletionRequest, typeof input>(
        "/v1/me/deletion-request",
        input,
        { headers: authorizedHeaders(token) },
      ),
    );

    // The API revokes every active session as soon as deletion is requested.
    const response = privateNextJson({ deletionRequest: result }, 201);
    clearSessionCookies(response);
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const { result, refreshed } = await withBackendAccess(request, (token) =>
      backendApi().delete<{ success: true }>("/v1/me/deletion-request", {
        headers: authorizedHeaders(token),
      }),
    );
    return responseWithRefresh(result, refreshed);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
