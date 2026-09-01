import {
  assertSameOrigin,
  backendApi,
  apiErrorResponse,
  clearSessionCookies,
  privateNextJson,
  refreshToken,
} from "@/lib/auth/bff";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const token = refreshToken(request);
    if (token) {
      await backendApi().post<{ success: true }, { refreshToken: string }>(
        "/v1/auth/logout",
        { refreshToken: token },
      );
    }
    const response = privateNextJson({ success: true });
    clearSessionCookies(response);
    return response;
  } catch (error) {
    const response = apiErrorResponse(error);
    clearSessionCookies(response);
    return response;
  }
}
