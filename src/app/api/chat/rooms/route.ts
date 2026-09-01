import {
  apiErrorResponse,
  authorizedHeaders,
  backendApi,
  privateNextJson,
  setSessionCookies,
  withBackendAccess,
} from "@/lib/auth/bff";
import {
  chatRoomListEndpoint,
  parseChatRoomListQuery,
} from "@/lib/chat/contracts";

export async function GET(request: Request) {
  try {
    const endpoint = chatRoomListEndpoint(parseChatRoomListQuery(request.url));
    const { result, refreshed } = await withBackendAccess(request, (token) =>
      backendApi().get(endpoint, {
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
