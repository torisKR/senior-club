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
  parseClubSlug,
  parseCreatePostRequest,
} from "@/lib/posts/bff";

type RouteContext = { params: Promise<{ slug: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const slug = parseClubSlug((await context.params).slug);
    if (!slug) {
      throw new ApiHttpError(400, "커뮤니티 주소가 올바르지 않습니다.", "INVALID_CLUB_SLUG");
    }
    const input = await parseCreatePostRequest(request);
    const { result, refreshed } = await withBackendAccess(request, (token) =>
      backendApi().post(`/v1/clubs/${encodeURIComponent(slug)}/posts`, input, {
        headers: authorizedHeaders(token),
      }),
    );
    const response = privateNextJson(result, 201);
    if (refreshed) setSessionCookies(response, refreshed);
    expireCommunityPostCaches("club-posts");
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}
