import { getAuthenticatedHttpClient } from '@/auth/auth-session-manager';

export const devicesApi = {
  async registerAndroid(token: string, appVersion?: string) {
    const response = await getAuthenticatedHttpClient().requestJson<{
      id: string;
      platform: 'ANDROID';
      deviceId: string | null;
      appVersion: string | null;
      enabledAt: string;
    }>('/v1/devices', {
      method: 'POST',
      auth: 'required',
      json: {
        token,
        platform: 'ANDROID',
        ...(appVersion ? { appVersion } : {}),
      },
    });
    return response.body;
  },

  async unregister(token: string) {
    await getAuthenticatedHttpClient().requestJson<{ success: true }>('/v1/devices', {
      method: 'DELETE',
      auth: 'required',
      json: { token },
    });
  },
};

