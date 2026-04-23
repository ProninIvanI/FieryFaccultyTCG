type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
};

type FriendRecordDto = {
  userId: string;
  username: string;
  createdAt: string;
};

type FriendRequestStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

type FriendRequestRecordDto = {
  id: string;
  senderUserId: string;
  senderUsername: string;
  receiverUserId: string;
  receiverUsername: string;
  status: FriendRequestStatus;
  createdAt: string;
  updatedAt: string;
};

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
};

type SocialGraphSnapshotResponse = {
  friends: CursorPage<FriendRecordDto>;
  incomingRequests: CursorPage<FriendRequestRecordDto>;
  outgoingRequests: CursorPage<FriendRequestRecordDto>;
};

type FriendRequestResponse = {
  request: FriendRequestRecordDto;
};

type FriendDeleteResponse = {
  message: string;
};

const DEFAULT_BACKEND_URL = process.env.BACKEND_API_URL ?? 'http://localhost:3001';
const DEFAULT_INTERNAL_TOKEN = process.env.INTERNAL_API_TOKEN ?? 'dev-internal-token';
const DEFAULT_LIMIT = 50;

const internalHeaders = (includeJson = false): HeadersInit => ({
  'x-internal-token': DEFAULT_INTERNAL_TOKEN,
  ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
});

const readApiError = async (response: Response): Promise<string> => {
  try {
    const payload = (await response.json()) as ApiResponse<unknown>;
    return payload.error ?? payload.message ?? 'Internal social request failed';
  } catch {
    return 'Internal social request failed';
  }
};

export interface SocialGraphSnapshot {
  friends: FriendRecordDto[];
  incomingRequests: FriendRequestRecordDto[];
  outgoingRequests: FriendRequestRecordDto[];
}

export interface SocialGraphClientLike {
  getSnapshot(userId: string, limit?: number): Promise<SocialGraphSnapshot>;
  sendFriendRequest(actorUserId: string, username: string): Promise<FriendRequestRecordDto>;
  acceptFriendRequest(actorUserId: string, requestId: string): Promise<FriendRequestRecordDto>;
  declineFriendRequest(actorUserId: string, requestId: string): Promise<FriendRequestRecordDto>;
  cancelFriendRequest(actorUserId: string, requestId: string): Promise<FriendRequestRecordDto>;
  deleteFriend(actorUserId: string, friendUserId: string): Promise<FriendDeleteResponse>;
}

export class HttpSocialGraphClient implements SocialGraphClientLike {
  async getSnapshot(userId: string, limit = DEFAULT_LIMIT): Promise<SocialGraphSnapshot> {
    const searchParams = new URLSearchParams({
      userId,
      limit: String(limit),
    });
    const response = await fetch(
      `${DEFAULT_BACKEND_URL}/api/internal/social/friends?${searchParams.toString()}`,
      {
        method: 'GET',
        headers: internalHeaders(),
      },
    );

    if (!response.ok) {
      throw new Error(await readApiError(response));
    }

    const payload = (await response.json()) as ApiResponse<SocialGraphSnapshotResponse>;
    return {
      friends: payload.data?.friends.items ?? [],
      incomingRequests: payload.data?.incomingRequests.items ?? [],
      outgoingRequests: payload.data?.outgoingRequests.items ?? [],
    };
  }

  async sendFriendRequest(actorUserId: string, username: string): Promise<FriendRequestRecordDto> {
    return this.postFriendRequest('/api/internal/social/friend-requests', {
      actorUserId,
      username,
    });
  }

  async acceptFriendRequest(actorUserId: string, requestId: string): Promise<FriendRequestRecordDto> {
    return this.postFriendRequest(
      `/api/internal/social/friend-requests/${encodeURIComponent(requestId)}/accept`,
      { actorUserId },
    );
  }

  async declineFriendRequest(actorUserId: string, requestId: string): Promise<FriendRequestRecordDto> {
    return this.postFriendRequest(
      `/api/internal/social/friend-requests/${encodeURIComponent(requestId)}/decline`,
      { actorUserId },
    );
  }

  async cancelFriendRequest(actorUserId: string, requestId: string): Promise<FriendRequestRecordDto> {
    return this.postFriendRequest(
      `/api/internal/social/friend-requests/${encodeURIComponent(requestId)}/cancel`,
      { actorUserId },
    );
  }

  async deleteFriend(actorUserId: string, friendUserId: string): Promise<FriendDeleteResponse> {
    const searchParams = new URLSearchParams({ actorUserId });
    const response = await fetch(
      `${DEFAULT_BACKEND_URL}/api/internal/social/friends/${encodeURIComponent(friendUserId)}?${searchParams.toString()}`,
      {
        method: 'DELETE',
        headers: internalHeaders(),
      },
    );

    if (!response.ok) {
      throw new Error(await readApiError(response));
    }

    const payload = (await response.json()) as ApiResponse<FriendDeleteResponse>;
    return payload.data ?? { message: 'Друг удалён' };
  }

  private async postFriendRequest(
    path: string,
    body: Record<string, string>,
  ): Promise<FriendRequestRecordDto> {
    const response = await fetch(`${DEFAULT_BACKEND_URL}${path}`, {
      method: 'POST',
      headers: internalHeaders(true),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(await readApiError(response));
    }

    const payload = (await response.json()) as ApiResponse<FriendRequestResponse>;
    if (!payload.data?.request) {
      throw new Error('Internal social request returned empty payload');
    }

    return payload.data.request;
  }
}
