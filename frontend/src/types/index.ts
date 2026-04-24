// Общие типы для приложения

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface HealthCheckResponse {
  status: string;
  message: string;
  database?: string;
}

// Реэкспорт типов из api
export type { ApiError, ApiRequestConfig } from './api';
export type { UserAccount, AuthSession } from './auth';
export type { DeckCardItem, DeckListResponse, DeckResponse, SaveDeckRequest, UserDeck } from './deck';
export type {
  MatchEndReason,
  MatchListResponse,
  MatchPlayerFinishResult,
  MatchPlayerRecord,
  MatchStatus,
  MatchSummary,
} from './match';
export type {
  PlayerProfileViewModel,
  ProfileDeckSummaryItem,
  ProfileRecentMatchItem,
  ProfileStatItem,
} from './profile';
export type {
  CursorPage,
  Friend,
  FriendListPayload,
  FriendRequest,
  FriendRequestListPayload,
  FriendRequestPayload,
  FriendRequestStatus,
} from './friend';
export type {
  FriendDeleteMessage,
  FriendRequestAcceptMessage,
  FriendRequestCancelMessage,
  FriendRequestDeclineMessage,
  FriendRequestSendMessage,
  MatchInvite,
  MatchInviteCancelMessage,
  MatchInviteReceivedServerMessage,
  MatchInviteRejectedServerMessage,
  MatchInviteRespondMessage,
  MatchInviteSendMessage,
  MatchInviteStatus,
  MatchInviteUpdatedServerMessage,
  PresenceState,
  SocialClientMessage,
  SocialConnectionStatus,
  SocialFriendsQueryMessage,
  SocialFriendsRejectedServerMessage,
  SocialFriendsSnapshotServerMessage,
  SocialInvitesSnapshotServerMessage,
  SocialPresenceQueryMessage,
  SocialPresenceServerMessage,
  SocialServerMessage,
  SocialServiceEvent,
  SocialSubscribeMessage,
  SocialSubscribedServerMessage,
} from './social';
export type {
  AckServerMessage,
  ErrorServerMessage,
  GameStateSnapshot,
  JoinMatchMessage,
  JoinRejectedServerMessage,
  LockRoundDraftMessage,
  PlayerLabelMap,
  PvpClientMessage,
  PvpConnectionStatus,
  PvpServerMessage,
  PvpServiceEvent,
  ReplaceRoundDraftMessage,
  RoundAuditEvent,
  RoundAuditServerMessage,
  RoundActionIntentDraft,
  RoundDraftAcceptedServerMessage,
  RoundDraftRejectedServerMessage,
  RoundDraftSnapshotServerMessage,
  RoundResolvedServerMessage,
  RoundStatusServerMessage,
  StateServerMessage,
  TransportRejectedServerMessage,
} from './pvp';
