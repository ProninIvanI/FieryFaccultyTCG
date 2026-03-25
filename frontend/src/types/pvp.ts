import type { GameState, RoundActionIntent, RoundDraftValidationError, RoundResolutionResult } from '@game-core/types';

export type GameStateSnapshot = Partial<GameState>;
export type RoundActionIntentDraft = RoundActionIntent;

export interface JoinMatchMessage {
  type: 'join';
  sessionId: string;
  token: string;
  deckId: string;
  seed?: number;
}

export interface ReplaceRoundDraftMessage {
  type: 'roundDraft.replace';
  roundNumber: number;
  intents: RoundActionIntentDraft[];
}

export interface LockRoundDraftMessage {
  type: 'roundDraft.lock';
  roundNumber: number;
}

export type PvpClientMessage =
  | JoinMatchMessage
  | ReplaceRoundDraftMessage
  | LockRoundDraftMessage;

export interface StateServerMessage {
  type: 'state';
  state: GameStateSnapshot;
}

export interface TransportRejectedServerMessage {
  type: 'transport.rejected';
  code: 'invalid_json' | 'invalid_payload' | 'unknown_message_type';
  error: string;
  requestType: string;
}

export interface JoinRejectedServerMessage {
  type: 'join.rejected';
  sessionId: string;
  code:
    | 'unauthorized'
    | 'deck_unavailable'
    | 'session_full'
    | 'seed_mismatch'
    | 'invalid_payload';
  error: string;
}

export interface ErrorServerMessage {
  type: 'error';
  error: string;
}

export interface AckServerMessage {
  type: 'ack';
}

export interface RoundDraftAcceptedServerMessage {
  type: 'roundDraft.accepted';
  roundNumber: number;
}

export interface RoundDraftRejectedServerMessage {
  type: 'roundDraft.rejected';
  operation: 'replace' | 'lock';
  roundNumber: number;
  code:
    | 'validation_failed'
    | 'join_required'
    | 'session_not_found'
    | 'player_not_in_session'
    | 'invalid_payload'
    | 'player_mismatch'
    | 'round_number_mismatch';
  error: string;
  errors: RoundDraftValidationError[];
}

export interface RoundDraftSnapshotServerMessage {
  type: 'roundDraft.snapshot';
  roundNumber: number;
  locked: boolean;
  intents: RoundActionIntentDraft[];
}

export interface RoundStatusServerMessage {
  type: 'roundStatus';
  roundNumber: number;
  selfLocked: boolean;
  opponentLocked: boolean;
}

export interface RoundResolvedServerMessage {
  type: 'roundResolved';
  result: RoundResolutionResult;
}

export type PvpServerMessage =
  | StateServerMessage
  | TransportRejectedServerMessage
  | JoinRejectedServerMessage
  | ErrorServerMessage
  | AckServerMessage
  | RoundDraftSnapshotServerMessage
  | RoundDraftAcceptedServerMessage
  | RoundDraftRejectedServerMessage
  | RoundStatusServerMessage
  | RoundResolvedServerMessage;

export type PvpConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

export type PvpServiceEvent =
  | { type: 'status'; status: PvpConnectionStatus }
  | { type: 'state'; state: GameStateSnapshot }
  | {
      type: 'transportRejected';
      code: TransportRejectedServerMessage['code'];
      error: string;
      requestType: string;
    }
  | {
      type: 'joinRejected';
      sessionId: string;
      code: JoinRejectedServerMessage['code'];
      error: string;
    }
  | { type: 'error'; error: string }
  | { type: 'ack' }
  | { type: 'roundDraftSnapshot'; roundNumber: number; locked: boolean; intents: RoundActionIntentDraft[] }
  | { type: 'roundDraftAccepted'; roundNumber: number }
  | {
      type: 'roundDraftRejected';
      operation: 'replace' | 'lock';
      roundNumber: number;
      code: RoundDraftRejectedServerMessage['code'];
      error: string;
      errors: RoundDraftValidationError[];
    }
  | { type: 'roundStatus'; roundNumber: number; selfLocked: boolean; opponentLocked: boolean }
  | { type: 'roundResolved'; result: RoundResolutionResult };
