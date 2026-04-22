export type PresenceState = 'offline' | 'online' | 'in_match';

export type MatchInviteStatus =
  | 'pending'
  | 'accepted'
  | 'consumed'
  | 'declined'
  | 'cancelled'
  | 'expired';

export interface SocialSubscribeMessage {
  type: 'social.subscribe';
  token: string;
}

export interface SocialPresenceQueryMessage {
  type: 'social.presence.query';
  userIds: string[];
}

export interface MatchInviteSendMessage {
  type: 'matchInvite.send';
  targetUserId: string;
}

export interface MatchInviteRespondMessage {
  type: 'matchInvite.respond';
  inviteId: string;
  action: 'accept' | 'decline';
}

export interface MatchInviteCancelMessage {
  type: 'matchInvite.cancel';
  inviteId: string;
}

export type SocialClientMessage =
  | SocialSubscribeMessage
  | SocialPresenceQueryMessage
  | MatchInviteSendMessage
  | MatchInviteRespondMessage
  | MatchInviteCancelMessage;

export interface SocialSubscribedServerMessage {
  type: 'social.subscribed';
  userId: string;
  username?: string;
}

export interface SocialPresenceServerMessage {
  type: 'social.presence';
  presences: Array<{ userId: string; status: PresenceState }>;
}

export interface SocialInvitesSnapshotServerMessage {
  type: 'social.invites.snapshot';
  invites: MatchInvite[];
}

export interface MatchInvite {
  id: string;
  inviterUserId: string;
  inviterUsername?: string;
  targetUserId: string;
  status: MatchInviteStatus;
  sessionId?: string;
  seed?: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface MatchInviteReceivedServerMessage {
  type: 'matchInvite.received';
  invite: MatchInvite;
}

export interface MatchInviteUpdatedServerMessage {
  type: 'matchInvite.updated';
  invite: MatchInvite;
}

export interface MatchInviteRejectedServerMessage {
  type: 'matchInvite.rejected';
  code:
    | 'unauthorized'
    | 'invalid_payload'
    | 'target_offline'
    | 'target_in_match'
    | 'not_friends'
    | 'self_invite'
    | 'duplicate_pending'
    | 'not_found'
    | 'forbidden'
    | 'invite_not_pending';
  error: string;
  inviteId?: string;
}

export interface SocialErrorEvent {
  type: 'error';
  error: string;
}

export type SocialServerMessage =
  | SocialSubscribedServerMessage
  | SocialPresenceServerMessage
  | SocialInvitesSnapshotServerMessage
  | MatchInviteReceivedServerMessage
  | MatchInviteUpdatedServerMessage
  | MatchInviteRejectedServerMessage;

export type SocialConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

export type SocialServiceEvent =
  | { type: 'status'; status: SocialConnectionStatus }
  | { type: 'subscribed'; userId: string; username?: string }
  | { type: 'presence'; presences: Array<{ userId: string; status: PresenceState }> }
  | { type: 'inviteSnapshot'; invites: MatchInvite[] }
  | { type: 'inviteReceived'; invite: MatchInvite }
  | { type: 'inviteUpdated'; invite: MatchInvite }
  | {
      type: 'inviteRejected';
      code: MatchInviteRejectedServerMessage['code'];
      error: string;
      inviteId?: string;
    }
  | SocialErrorEvent;
