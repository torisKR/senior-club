import { ApiHttpError } from "@/lib/api";
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
  parseEventMutationResponse,
  parseLeaderEventDetailResponse,
  parseUpdateLeaderEventRequest,
} from "@/lib/leader-events/bff";
import { parseLeaderEventId } from "@/lib/leader-events/contracts";

type RouteContext = { params: Promise<{ id: string }> };

async function eventIdFrom(context: RouteContext) {
  const { id: requestedId } = await context.params;
  const eventId = parseLeaderEventId(requestedId);
  if (!eventId) {
    throw new ApiHttpError(
      400,
      "모임 식별자가 올바르지 않습니다.",
      "INVALID_EVENT_ID",
    );
  }
  return eventId;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const eventId = await eventIdFrom(context);
    const { result, refreshed } = await withBackendAccess(request, (token) =>
      backendApi().get(`/v1/leader/events/${encodeURIComponent(eventId)}`, {
        cache: "no-store",
        headers: authorizedHeaders(token),
      }),
    );
    const response = privateNextJson(
      parseLeaderEventDetailResponse(result, eventId),
    );
    if (refreshed) setSessionCookies(response, refreshed);
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const eventId = await eventIdFrom(context);
    const input = await parseUpdateLeaderEventRequest(request);
    const { result, refreshed } = await withBackendAccess(request, (token) =>
      backendApi().patch(
        `/v1/events/${encodeURIComponent(eventId)}`,
        input,
        { headers: authorizedHeaders(token) },
      ),
    );
    const response = privateNextJson(
      parseEventMutationResponse(result, eventId),
    );
    if (refreshed) setSessionCookies(response, refreshed);
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}
