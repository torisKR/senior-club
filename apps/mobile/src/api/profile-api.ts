import { createHttpClient } from '@/api/http-client';
import {
  type ApiProfile,
  type InterestListResponse,
  toInterest,
  toProfileState,
  type UpdateProfileInput,
} from '@/api/profile-api-core';
import { getAuthenticatedHttpClient } from '@/auth/auth-session-manager';
import { getMobileEnvironment } from '@/config/env';

export * from '@/api/profile-api-core';

let publicClient: ReturnType<typeof createHttpClient> | null = null;
let publicClientUrl: string | null = null;

function getPublicClient() {
  const { apiUrl } = getMobileEnvironment();
  if (!publicClient || publicClientUrl !== apiUrl) {
    publicClientUrl = apiUrl;
    publicClient = createHttpClient({ baseUrl: apiUrl });
  }
  return publicClient;
}

export const profileApi = {
  async listInterests(signal?: AbortSignal) {
    const response = await getPublicClient().requestJson<InterestListResponse>('/v1/interests', {
      auth: 'none',
      signal,
    });
    return response.body.data.map(toInterest);
  },

  async me(signal?: AbortSignal) {
    const response = await getAuthenticatedHttpClient().requestJson<ApiProfile>('/v1/me', {
      auth: 'required',
      signal,
    });
    return toProfileState(response.body);
  },

  async update(input: UpdateProfileInput, signal?: AbortSignal) {
    const response = await getAuthenticatedHttpClient().requestJson<ApiProfile>(
      '/v1/me/profile',
      {
        method: 'PATCH',
        auth: 'required',
        json: input,
        signal,
      },
    );
    return toProfileState(response.body);
  },
};
