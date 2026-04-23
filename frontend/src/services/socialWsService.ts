import { WS_URL } from '@/constants';
import {
  Friend,
  FriendRequest,
  MatchInvite,
  SocialClientMessage,
  SocialConnectionStatus,
  SocialServerMessage,
  SocialServiceEvent,
} from '@/types';

type EventListener = (event: SocialServiceEvent) => void;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isOptionalString = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === 'string';

const isPresenceState = (value: unknown): value is 'offline' | 'online' | 'in_match' =>
  value === 'offline' || value === 'online' || value === 'in_match';

const isFriend = (value: unknown): value is Friend =>
  isRecord(value) &&
  typeof value.userId === 'string' &&
  typeof value.username === 'string' &&
  typeof value.createdAt === 'string';

const isFriendRequestStatus = (
  value: unknown,
): value is 'pending' | 'accepted' | 'declined' | 'cancelled' =>
  value === 'pending' || value === 'accepted' || value === 'declined' || value === 'cancelled';

const isFriendRequest = (value: unknown): value is FriendRequest =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.senderUserId === 'string' &&
  typeof value.senderUsername === 'string' &&
  typeof value.receiverUserId === 'string' &&
  typeof value.receiverUsername === 'string' &&
  isFriendRequestStatus(value.status) &&
  typeof value.createdAt === 'string' &&
  typeof value.updatedAt === 'string';

const isMatchInviteStatus = (
  value: unknown,
): value is 'pending' | 'accepted' | 'consumed' | 'declined' | 'cancelled' | 'expired' =>
  value === 'pending' ||
  value === 'accepted' ||
  value === 'consumed' ||
  value === 'declined' ||
  value === 'cancelled' ||
  value === 'expired';

const isMatchInvite = (value: unknown): value is MatchInvite =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.inviterUserId === 'string' &&
  isOptionalString(value.inviterUsername) &&
  typeof value.targetUserId === 'string' &&
  isMatchInviteStatus(value.status) &&
  isOptionalString(value.sessionId) &&
  (value.seed === undefined || typeof value.seed === 'number') &&
  typeof value.createdAt === 'string' &&
  typeof value.updatedAt === 'string' &&
  typeof value.expiresAt === 'string';

const isSocialSubscribedMessage = (
  value: unknown,
): value is Extract<SocialServerMessage, { type: 'social.subscribed' }> =>
  isRecord(value) &&
  value.type === 'social.subscribed' &&
  typeof value.userId === 'string' &&
  isOptionalString(value.username);

const isSocialPresenceMessage = (
  value: unknown,
): value is Extract<SocialServerMessage, { type: 'social.presence' }> =>
  isRecord(value) &&
  value.type === 'social.presence' &&
  Array.isArray(value.presences) &&
  value.presences.every(
    (presence) =>
      isRecord(presence) &&
      typeof presence.userId === 'string' &&
      isPresenceState(presence.status),
  );

const isSocialFriendsSnapshotMessage = (
  value: unknown,
): value is Extract<SocialServerMessage, { type: 'social.friends.snapshot' }> =>
  isRecord(value) &&
  value.type === 'social.friends.snapshot' &&
  Array.isArray(value.friends) &&
  value.friends.every(isFriend) &&
  Array.isArray(value.incomingRequests) &&
  value.incomingRequests.every(isFriendRequest) &&
  Array.isArray(value.outgoingRequests) &&
  value.outgoingRequests.every(isFriendRequest);

const isInviteSnapshotMessage = (
  value: unknown,
): value is Extract<SocialServerMessage, { type: 'social.invites.snapshot' }> =>
  isRecord(value) &&
  value.type === 'social.invites.snapshot' &&
  Array.isArray(value.invites) &&
  value.invites.every(isMatchInvite);

const isInviteReceivedMessage = (
  value: unknown,
): value is Extract<SocialServerMessage, { type: 'matchInvite.received' }> =>
  isRecord(value) &&
  value.type === 'matchInvite.received' &&
  isMatchInvite(value.invite);

const isInviteUpdatedMessage = (
  value: unknown,
): value is Extract<SocialServerMessage, { type: 'matchInvite.updated' }> =>
  isRecord(value) &&
  value.type === 'matchInvite.updated' &&
  isMatchInvite(value.invite);

const isInviteRejectedMessage = (
  value: unknown,
): value is Extract<SocialServerMessage, { type: 'matchInvite.rejected' }> =>
  isRecord(value) &&
  value.type === 'matchInvite.rejected' &&
  typeof value.code === 'string' &&
  typeof value.error === 'string' &&
  isOptionalString(value.inviteId);

const isSocialFriendsRejectedMessage = (
  value: unknown,
): value is Extract<SocialServerMessage, { type: 'social.friends.rejected' }> =>
  isRecord(value) &&
  value.type === 'social.friends.rejected' &&
  typeof value.code === 'string' &&
  typeof value.error === 'string' &&
  typeof value.requestType === 'string' &&
  isOptionalString(value.requestId) &&
  isOptionalString(value.friendUserId);

const parseServerMessage = (raw: string): SocialServerMessage | null => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isSocialSubscribedMessage(parsed)) {
      return parsed;
    }
    if (isSocialPresenceMessage(parsed)) {
      return parsed;
    }
    if (isSocialFriendsSnapshotMessage(parsed)) {
      return parsed;
    }
    if (isInviteSnapshotMessage(parsed)) {
      return parsed;
    }
    if (isSocialFriendsRejectedMessage(parsed)) {
      return parsed;
    }
    if (isInviteReceivedMessage(parsed)) {
      return parsed;
    }
    if (isInviteUpdatedMessage(parsed)) {
      return parsed;
    }
    if (isInviteRejectedMessage(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
};

class SocialWsService {
  private socket: WebSocket | null = null;
  private connectPromise: Promise<void> | null = null;
  private status: SocialConnectionStatus = 'idle';
  private listeners = new Set<EventListener>();
  private authToken: string | null = null;

  getStatus(): SocialConnectionStatus {
    return this.status;
  }

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    listener({ type: 'status', status: this.status });
    return () => {
      this.listeners.delete(listener);
    };
  }

  async connect(token: string, url = WS_URL): Promise<void> {
    if (typeof WebSocket === 'undefined') {
      return;
    }

    this.authToken = token;

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.send({ type: 'social.subscribe', token });
      return;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.updateStatus('connecting');

    this.connectPromise = new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url);
      this.socket = socket;

      socket.addEventListener('open', () => {
        this.updateStatus('connected');
        this.send({ type: 'social.subscribe', token });
        resolve();
      });

      socket.addEventListener('message', (event) => {
        this.handleMessage(event.data);
      });

      socket.addEventListener('error', () => {
        this.updateStatus('error');
        this.emit({ type: 'error', error: 'WebSocket connection error' });
        reject(new Error('WebSocket connection error'));
      });

      socket.addEventListener('close', () => {
        this.socket = null;
        this.connectPromise = null;
        this.updateStatus('disconnected');
      });
    }).finally(() => {
      this.connectPromise = null;
    });

    return this.connectPromise;
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
    this.connectPromise = null;
    this.updateStatus('disconnected');
  }

  async queryPresence(userIds: string[]): Promise<void> {
    if (userIds.length === 0) {
      return;
    }

    if (this.authToken) {
      await this.connect(this.authToken);
    }

    this.send({
      type: 'social.presence.query',
      userIds,
    });
  }

  async queryFriendsSnapshot(): Promise<void> {
    if (this.authToken) {
      await this.connect(this.authToken);
    }

    this.send({
      type: 'social.friends.query',
    });
  }

  async sendFriendRequest(username: string): Promise<void> {
    if (this.authToken) {
      await this.connect(this.authToken);
    }

    this.send({
      type: 'friendRequest.send',
      username,
    });
  }

  async respondToFriendRequest(requestId: string, action: 'accept' | 'decline'): Promise<void> {
    if (this.authToken) {
      await this.connect(this.authToken);
    }

    this.send({
      type: action === 'accept' ? 'friendRequest.accept' : 'friendRequest.decline',
      requestId,
    });
  }

  async cancelFriendRequest(requestId: string): Promise<void> {
    if (this.authToken) {
      await this.connect(this.authToken);
    }

    this.send({
      type: 'friendRequest.cancel',
      requestId,
    });
  }

  async deleteFriend(friendUserId: string): Promise<void> {
    if (this.authToken) {
      await this.connect(this.authToken);
    }

    this.send({
      type: 'friend.delete',
      friendUserId,
    });
  }

  async sendMatchInvite(targetUserId: string): Promise<void> {
    if (this.authToken) {
      await this.connect(this.authToken);
    }

    this.send({
      type: 'matchInvite.send',
      targetUserId,
    });
  }

  async respondToInvite(inviteId: string, action: 'accept' | 'decline'): Promise<void> {
    if (this.authToken) {
      await this.connect(this.authToken);
    }

    this.send({
      type: 'matchInvite.respond',
      inviteId,
      action,
    });
  }

  async cancelInvite(inviteId: string): Promise<void> {
    if (this.authToken) {
      await this.connect(this.authToken);
    }

    this.send({
      type: 'matchInvite.cancel',
      inviteId,
    });
  }

  private send(message: SocialClientMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    this.socket.send(JSON.stringify(message));
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== 'string') {
      return;
    }

    const parsed = parseServerMessage(data);
    if (!parsed) {
      return;
    }

    if (parsed.type === 'social.subscribed') {
      this.emit({
        type: 'subscribed',
        userId: parsed.userId,
        username: parsed.username,
      });
      return;
    }

    if (parsed.type === 'social.presence') {
      this.emit({
        type: 'presence',
        presences: parsed.presences,
      });
      return;
    }

    if (parsed.type === 'social.friends.snapshot') {
      this.emit({
        type: 'friendsSnapshot',
        friends: parsed.friends,
        incomingRequests: parsed.incomingRequests,
        outgoingRequests: parsed.outgoingRequests,
      });
      return;
    }

    if (parsed.type === 'social.invites.snapshot') {
      this.emit({
        type: 'inviteSnapshot',
        invites: parsed.invites,
      });
      return;
    }

    if (parsed.type === 'matchInvite.received') {
      this.emit({
        type: 'inviteReceived',
        invite: parsed.invite,
      });
      return;
    }

    if (parsed.type === 'matchInvite.updated') {
      this.emit({
        type: 'inviteUpdated',
        invite: parsed.invite,
      });
      return;
    }

    if (parsed.type === 'social.friends.rejected') {
      this.emit({
        type: 'friendsRejected',
        code: parsed.code,
        error: parsed.error,
        requestType: parsed.requestType,
        requestId: parsed.requestId,
        friendUserId: parsed.friendUserId,
      });
      return;
    }

    this.emit({
      type: 'inviteRejected',
      code: parsed.code,
      error: parsed.error,
      inviteId: parsed.inviteId,
    });
  }

  private updateStatus(status: SocialConnectionStatus): void {
    this.status = status;
    this.emit({ type: 'status', status });
  }

  private emit(event: SocialServiceEvent): void {
    this.listeners.forEach((listener) => listener(event));
  }
}

export const socialWsService = new SocialWsService();
