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
  leaderEventsBackendPath,
  parseCreateLeaderEventRequest,
  parseEventIdempotencyKey,
  parseEventMutationResponse,
} from "@/lib/leader-events/bff";

export async function GET(request: Request) {
  try {
    const backendPath = leaderEventsBackendPath(request.url);
    const { result, refreshed } = await withBackendAccess(request, (token) =>
      backendApi().get(backendPath, {
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

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const idempotencyKey = parseEventIdempotencyKey(request);
    const input = await parseCreateLeaderEventRequest(request);
    const { result, refreshed } = await withBackendAccess(request, (token) =>
      backendApi().post("/v1/events", input, {
        headers: authorizedHeaders(token, idempotencyKey),
      }),
    );
    const response = privateNextJson(parseEventMutationResponse(result), 201);
    if (refreshed) setSessionCookies(response, refreshed);
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}
