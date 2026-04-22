type FriendshipStatusResponse = {
  success: boolean;
  data?: {
    areFriends?: boolean;
  };
};

const DEFAULT_BACKEND_URL = process.env.BACKEND_API_URL ?? 'http://localhost:3001';
const DEFAULT_INTERNAL_TOKEN = process.env.INTERNAL_API_TOKEN ?? 'dev-internal-token';

export interface FriendshipClientLike {
  areFriends(userId: string, friendUserId: string): Promise<boolean>;
}

export class HttpFriendshipClient implements FriendshipClientLike {
  async areFriends(userId: string, friendUserId: string): Promise<boolean> {
    const searchParams = new URLSearchParams({
      userId,
      friendUserId,
    });
    const response = await fetch(
      `${DEFAULT_BACKEND_URL}/api/internal/friends/status?${searchParams.toString()}`,
      {
        method: 'GET',
        headers: {
          'x-internal-token': DEFAULT_INTERNAL_TOKEN,
        },
      },
    );

    if (!response.ok) {
      return false;
    }

    const payload = (await response.json()) as FriendshipStatusResponse;
    return payload.data?.areFriends === true;
  }
}
