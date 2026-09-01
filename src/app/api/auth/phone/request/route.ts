import { assertSameOrigin, backendApi, apiErrorResponse, privateNextJson } from "@/lib/auth/bff";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = (await request.json()) as { phoneNumber?: unknown };
    const result = await backendApi().post<
      { challengeId: string; phoneNumber: string; expiresAt: string; retryAfterSeconds: number; devCode?: string },
      { phoneNumber: unknown }
    >("/v1/auth/phone/request", { phoneNumber: body.phoneNumber });
    return privateNextJson(result, 201);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
