import { ApiHttpError } from "@/lib/api";
import { parseReportResolution } from "@/lib/admin/report-resolution";
import {
  apiErrorResponse,
  assertSameOrigin,
  authorizedHeaders,
  backendApi,
  privateNextJson,
  setSessionCookies,
  withBackendAccess,
} from "@/lib/auth/bff";

type RouteContext = { params: Promise<{ id: string }> };

const SAFE_REPORT_ID = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/;
export async function PATCH(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    if (!SAFE_REPORT_ID.test(id)) {
      throw new ApiHttpError(400, "신고 식별자가 올바르지 않습니다.", "INVALID_REPORT_ID");
    }
    const input = parseReportResolution(await request.json());
    const { result, refreshed } = await withBackendAccess(request, (token) =>
      backendApi().patch(`/v1/admin/reports/${encodeURIComponent(id)}`, input, {
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
