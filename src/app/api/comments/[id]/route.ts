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
  parsePostId,
  parseUpdateCommentRequest,
} from "@/lib/posts/bff";

type RouteContext = { params: Promise<{ id: string }> };

async function safeCommentId(context: RouteContext) {
  const id = parsePostId((await context.params).id);
  if (!id) {
    throw new ApiHttpError(400, "댓글 식별자가 올바르지 않습니다.", "INVALID_COMMENT_ID");
  }
  return id;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const id = await safeCommentId(context);
    const input = await parseUpdateCommentRequest(request);
    const { result, refreshed } = await withBackendAccess(request, (token) =>
      backendApi().patch(`/v1/comments/${encodeURIComponent(id)}`, input, {
        headers: authorizedHeaders(token),
      }),
    );
    const response = privateNextJson(result);
    if (refreshed) setSessionCookies(response, refreshed);
    expireCommunityPostCaches("post-comments");
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const id = await safeCommentId(context);
    const { result, refreshed } = await withBackendAccess(request, (token) =>
      backendApi().delete(`/v1/comments/${encodeURIComponent(id)}`, {
        headers: authorizedHeaders(token),
      }),
    );
    const response = privateNextJson(result);
    if (refreshed) setSessionCookies(response, refreshed);
    expireCommunityPostCaches("post-comments", "club-posts");
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}
