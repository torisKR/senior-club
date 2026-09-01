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
  parseReviewEventId,
  parseReviewRequest,
} from "@/lib/reviews/bff";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const { id: requestedId } = await context.params;
    const eventId = parseReviewEventId(requestedId);
    if (!eventId) {
      throw new ApiHttpError(
        400,
        "모임 식별자가 올바르지 않습니다.",
        "INVALID_EVENT_ID",
      );
    }
    const input = await parseReviewRequest(request);

    const { result, refreshed } = await withBackendAccess(request, (token) =>
      backendApi().post(
        `/v1/events/${encodeURIComponent(eventId)}/reviews`,
        input,
        { headers: authorizedHeaders(token) },
      ),
    );
    const response = privateNextJson(result, 201);
    if (refreshed) setSessionCookies(response, refreshed);
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}
