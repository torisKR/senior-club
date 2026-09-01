import { getAuthenticatedHttpClient } from '@/auth/auth-session-manager';

export interface AccountDeletionRequest {
  id: string;
  status: 'REQUESTED' | 'PROCESSING' | 'COMPLETED' | 'CANCELED' | 'FAILED';
  requestedAt: string;
  scheduledFor: string;
  completedAt: string | null;
}

export const accountApi = {
  async requestDeletion(reason?: string) {
    const response = await getAuthenticatedHttpClient().requestJson<AccountDeletionRequest>(
      '/v1/me/deletion-request',
      {
        method: 'POST',
        auth: 'required',
        json: {
          confirmation: '계정 삭제',
          ...(reason?.trim() ? { reason: reason.trim() } : {}),
        },
      },
    );
    return response.body;
  },
};
