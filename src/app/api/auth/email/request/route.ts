import { assertSameOrigin, backendApi, apiErrorResponse, privateNextJson } from "@/lib/auth/bff";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = (await request.json()) as { email?: unknown };
    const result = await backendApi().post<
      { challengeId: string; expiresAt: string; retryAfterSeconds: number; devCode?: string },
      { email: unknown }
    >("/v1/auth/email/request", { email: body.email });
    return privateNextJson(result, 201);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
