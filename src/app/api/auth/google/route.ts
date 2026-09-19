import {
  assertSameOrigin,
  backendApi,
  type BackendIssuedSession,
  apiErrorResponse,
  privateNextJson,
  setSessionCookies,
} from "@/lib/auth/bff";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = (await request.json()) as Record<string, unknown>;
    const session = await backendApi().post<
      BackendIssuedSession,
      Record<string, unknown>
    >("/v1/auth/google", { ...body, clientType: "WEB" });
    const response = privateNextJson(
      {
        user: session.user,
        accessTokenExpiresAt: session.accessTokenExpiresAt,
      },
      201,
    );
    setSessionCookies(response, session);
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}
