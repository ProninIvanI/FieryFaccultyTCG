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
  AckServerMessage,
  ErrorServerMessage,
  GameStateSnapshot,
  JoinMatchMessage,
  JoinRejectedServerMessage,
  LockRoundDraftMessage,
  PvpClientMessage,
  PvpConnectionStatus,
  PvpServerMessage,
  PvpServiceEvent,
  ReplaceRoundDraftMessage,
  RoundActionIntentDraft,
  RoundDraftAcceptedServerMessage,
  RoundDraftRejectedServerMessage,
  RoundDraftSnapshotServerMessage,
  RoundResolvedServerMessage,
  RoundStatusServerMessage,
  StateServerMessage,
  TransportRejectedServerMessage,
} from './pvp';
