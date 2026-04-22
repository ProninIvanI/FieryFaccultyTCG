export type FriendRequestStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface Friend {
  userId: string;
  username: string;
  createdAt: string;
}

export interface FriendRequest {
  id: string;
  senderUserId: string;
  senderUsername: string;
  receiverUserId: string;
  receiverUsername: string;
  status: FriendRequestStatus;
  createdAt: string;
  updatedAt: string;
}

export interface FriendListPayload {
  friends: CursorPage<Friend>;
}

export interface FriendRequestListPayload {
  requests: CursorPage<FriendRequest>;
}

export interface FriendRequestPayload {
  request: FriendRequest;
}
