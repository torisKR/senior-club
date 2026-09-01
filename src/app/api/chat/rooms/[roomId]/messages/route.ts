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
  chatMessageListEndpoint,
  parseChatMessageListQuery,
  parseSendChatMessageBody,
  readChatJsonBody,
  validateChatRoomId,
} from "@/lib/chat/contracts";

type RouteContext = { params: Promise<{ roomId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const roomId = validateChatRoomId((await params).roomId);
    const query = parseChatMessageListQuery(request.url);
    const endpoint = chatMessageListEndpoint(roomId, query);
    const { result, refreshed } = await withBackendAccess(request, (token) =>
      backendApi().get(endpoint, { headers: authorizedHeaders(token) }),
    );
    const response = privateNextJson(result);
    if (refreshed) setSessionCookies(response, refreshed);
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const roomId = validateChatRoomId((await params).roomId);
    const body = parseSendChatMessageBody(await readChatJsonBody(request));
    const endpoint = `/v1/chat/rooms/${encodeURIComponent(roomId)}/messages`;
    const { result, refreshed } = await withBackendAccess(request, (token) =>
      backendApi().post(endpoint, body, { headers: authorizedHeaders(token) }),
    );
    const response = privateNextJson(result, 201);
    if (refreshed) setSessionCookies(response, refreshed);
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}
