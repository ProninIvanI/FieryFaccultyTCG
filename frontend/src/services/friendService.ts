import { apiClient } from '@/services/api';
import { Friend, FriendListPayload, FriendRequest, FriendRequestListPayload, FriendRequestPayload } from '@/types';

type FriendServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const DEFAULT_ERROR = 'Не удалось выполнить операцию с друзьями';

const readError = (error?: string): string => error ?? DEFAULT_ERROR;

export const friendService = {
  async listFriends(params?: { limit?: number; cursor?: string }): Promise<FriendServiceResult<Friend[]>> {
    const search = new URLSearchParams();
    if (params?.limit) {
      search.set('limit', String(params.limit));
    }
    if (params?.cursor) {
      search.set('cursor', params.cursor);
    }

    const suffix = search.toString() ? `?${search.toString()}` : '';
    const response = await apiClient.get<FriendListPayload>(`/api/friends${suffix}`);
    if (!response.success || !response.data) {
      return { ok: false, error: readError(response.error) };
    }

    return { ok: true, data: response.data.friends.items };
  },

  async listIncomingRequests(params?: { limit?: number; cursor?: string }): Promise<FriendServiceResult<FriendRequest[]>> {
    const search = new URLSearchParams();
    if (params?.limit) {
      search.set('limit', String(params.limit));
    }
    if (params?.cursor) {
      search.set('cursor', params.cursor);
    }

    const suffix = search.toString() ? `?${search.toString()}` : '';
    const response = await apiClient.get<FriendRequestListPayload>(`/api/friends/requests/incoming${suffix}`);
    if (!response.success || !response.data) {
      return { ok: false, error: readError(response.error) };
    }

    return { ok: true, data: response.data.requests.items };
  },

  async listOutgoingRequests(params?: { limit?: number; cursor?: string }): Promise<FriendServiceResult<FriendRequest[]>> {
    const search = new URLSearchParams();
    if (params?.limit) {
      search.set('limit', String(params.limit));
    }
    if (params?.cursor) {
      search.set('cursor', params.cursor);
    }

    const suffix = search.toString() ? `?${search.toString()}` : '';
    const response = await apiClient.get<FriendRequestListPayload>(`/api/friends/requests/outgoing${suffix}`);
    if (!response.success || !response.data) {
      return { ok: false, error: readError(response.error) };
    }

    return { ok: true, data: response.data.requests.items };
  },

  async sendRequest(username: string): Promise<FriendServiceResult<FriendRequest>> {
    const response = await apiClient.post<FriendRequestPayload>('/api/friends/requests', { username });
    if (!response.success || !response.data) {
      return { ok: false, error: readError(response.error) };
    }

    return { ok: true, data: response.data.request };
  },

  async acceptRequest(requestId: string): Promise<FriendServiceResult<FriendRequest>> {
    const response = await apiClient.post<FriendRequestPayload>(`/api/friends/requests/${requestId}/accept`);
    if (!response.success || !response.data) {
      return { ok: false, error: readError(response.error) };
    }

    return { ok: true, data: response.data.request };
  },

  async declineRequest(requestId: string): Promise<FriendServiceResult<FriendRequest>> {
    const response = await apiClient.post<FriendRequestPayload>(`/api/friends/requests/${requestId}/decline`);
    if (!response.success || !response.data) {
      return { ok: false, error: readError(response.error) };
    }

    return { ok: true, data: response.data.request };
  },

  async cancelRequest(requestId: string): Promise<FriendServiceResult<FriendRequest>> {
    const response = await apiClient.post<FriendRequestPayload>(`/api/friends/requests/${requestId}/cancel`);
    if (!response.success || !response.data) {
      return { ok: false, error: readError(response.error) };
    }

    return { ok: true, data: response.data.request };
  },

  async deleteFriend(friendUserId: string): Promise<FriendServiceResult<null>> {
    const response = await apiClient.delete(`/api/friends/${friendUserId}`);
    if (!response.success) {
      return { ok: false, error: readError(response.error) };
    }

    return { ok: true, data: null };
  },
};
