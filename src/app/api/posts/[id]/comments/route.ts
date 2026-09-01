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
  expireCommunityPostCaches,
  parseCreateCommentRequest,
  parsePostId,
} from "@/lib/posts/bff";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const postId = parsePostId((await context.params).id);
    if (!postId) {
      throw new ApiHttpError(400, "게시글 식별자가 올바르지 않습니다.", "INVALID_POST_ID");
    }
    const input = await parseCreateCommentRequest(request);
    const { result, refreshed } = await withBackendAccess(request, (token) =>
      backendApi().post(`/v1/posts/${encodeURIComponent(postId)}/comments`, input, {
        headers: authorizedHeaders(token),
      }),
    );
    const response = privateNextJson(result, 201);
    if (refreshed) setSessionCookies(response, refreshed);
    expireCommunityPostCaches("post-comments", "club-posts");
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}
