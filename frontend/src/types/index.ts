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
  ActionMessage,
  ErrorServerMessage,
  GameActionPayload,
  GameStateSnapshot,
  JoinMatchMessage,
  PvpClientMessage,
  PvpConnectionStatus,
  PvpServerMessage,
  PvpServiceEvent,
  StateServerMessage,
} from './pvp';
