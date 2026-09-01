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
  parseEmptyEventActionRequest,
  parseEventMutationResponse,
} from "@/lib/leader-events/bff";
import { parseLeaderEventId } from "@/lib/leader-events/contracts";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    await parseEmptyEventActionRequest(request);
    const { id: requestedId } = await context.params;
    const eventId = parseLeaderEventId(requestedId);
    if (!eventId) {
      throw new ApiHttpError(
        400,
        "모임 식별자가 올바르지 않습니다.",
        "INVALID_EVENT_ID",
      );
    }
    const { result, refreshed } = await withBackendAccess(request, (token) =>
      backendApi().post(
        `/v1/events/${encodeURIComponent(eventId)}/cancel`,
        {},
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
