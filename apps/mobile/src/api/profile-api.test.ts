import { beforeEach, describe, expect, it, vi } from 'vitest';

import { profileApi } from './profile-api';
import type { ApiProfile, UpdateProfileInput } from './profile-api-core';

const clientMocks = vi.hoisted(() => ({
  authenticatedRequest: vi.fn(),
  publicRequest: vi.fn(),
}));

vi.mock('@/auth/auth-session-manager', () => ({
  getAuthenticatedHttpClient: () => ({ requestJson: clientMocks.authenticatedRequest }),
}));

vi.mock('@/config/env', () => ({
  getMobileEnvironment: () => ({
    apiUrl: 'https://api.example.com',
    appEnvironment: 'production',
  }),
}));

vi.mock('@/api/http-client', () => ({
  createHttpClient: () => ({ requestJson: clientMocks.publicRequest }),
}));

const profileResponse: ApiProfile = {
  id: 'user-1',
  email: 'member@example.com',
  name: '김시니어',
  birthYear: 1962,
  region: '서울',
  gender: null,
  avatarUrl: null,
  bio: null,
  role: 'MEMBER',
  onboardingCompletedAt: '2026-07-30T00:00:00.000Z',
  interests: [
    { id: 'interest-hiking', slug: 'hiking', name: '등산', icon: 'mountain' },
  ],
};

describe('profileApi request contract', () => {
  beforeEach(() => {
    clientMocks.authenticatedRequest.mockReset();
    clientMocks.publicRequest.mockReset();
  });

  it('loads the public interest envelope without authentication', async () => {
    clientMocks.publicRequest.mockResolvedValue({
      body: {
        data: [
          { id: 'interest-hiking', slug: 'hiking', name: '등산', icon: 'mountain' },
        ],
      },
    });

    await expect(profileApi.listInterests()).resolves.toEqual([
      expect.objectContaining({ id: 'hiking', name: '등산' }),
    ]);
    expect(clientMocks.publicRequest).toHaveBeenCalledWith('/v1/interests', {
      auth: 'none',
      signal: undefined,
    });
    expect(clientMocks.authenticatedRequest).not.toHaveBeenCalled();
  });

  it('recovers profile state from the authenticated /v1/me contract', async () => {
    clientMocks.authenticatedRequest.mockResolvedValue({ body: profileResponse });

    await expect(profileApi.me()).resolves.toEqual(
      expect.objectContaining({
        selectedInterestIds: ['hiking'],
        onboardingCompleted: true,
      }),
    );
    expect(clientMocks.authenticatedRequest).toHaveBeenCalledWith('/v1/me', {
      auth: 'required',
      signal: undefined,
    });
  });

  it('sends the exact authenticated profile PATCH body', async () => {
    const input: UpdateProfileInput = {
      name: '김시니어',
      region: '서울',
      birthYear: 1962,
      interestSlugs: ['hiking'],
    };
    clientMocks.authenticatedRequest.mockResolvedValue({ body: profileResponse });

    await expect(profileApi.update(input)).resolves.toEqual(
      expect.objectContaining({ onboardingCompleted: true }),
    );
    expect(clientMocks.authenticatedRequest).toHaveBeenCalledWith('/v1/me/profile', {
      method: 'PATCH',
      auth: 'required',
      json: input,
      signal: undefined,
    });
  });
});
