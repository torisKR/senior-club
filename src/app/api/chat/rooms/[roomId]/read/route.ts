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
  parseEmptyJsonObject,
  readChatJsonBody,
  validateChatRoomId,
} from "@/lib/chat/contracts";

type RouteContext = { params: Promise<{ roomId: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const roomId = validateChatRoomId((await params).roomId);
    parseEmptyJsonObject(await readChatJsonBody(request));
    const endpoint = `/v1/chat/rooms/${encodeURIComponent(roomId)}/read`;
    const { result, refreshed } = await withBackendAccess(request, (token) =>
      backendApi().patch(endpoint, {}, { headers: authorizedHeaders(token) }),
    );
    const response = privateNextJson(result);
    if (refreshed) setSessionCookies(response, refreshed);
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}
