import type { PlayerBoardModel, RoundDraftValidationError, RoundResolutionResult } from '../../../../game-core/src/types';

export type ClientMessageDto =
  | { type: 'join'; sessionId: string; token: string; deckId: string; seed?: number }
  | { type: 'roundDraft.replace'; roundNumber: number; intents: unknown[] }
  | { type: 'roundDraft.lock'; roundNumber: number };

export type ServerMessageDto =
  | { type: 'state'; state: unknown; playerLabels?: Record<string, string> }
  | {
      type: 'transport.rejected';
      code: 'invalid_json' | 'invalid_payload' | 'unknown_message_type';
      error: string;
      requestType: string;
    }
  | {
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
  | {
      type: 'roundDraft.snapshot';
      roundNumber: number;
      locked: boolean;
      intents: unknown[];
      boardModel?: PlayerBoardModel;
    }
  | { type: 'roundDraft.accepted'; roundNumber: number }
  | {
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
  | { type: 'roundStatus'; roundNumber: number; selfLocked: boolean; opponentLocked: boolean }
  | { type: 'roundResolved'; result: RoundResolutionResult }
  | { type: 'error'; error: string }
  | { type: 'ack' };

type TransportRejectedParseMessage = Extract<ServerMessageDto, { type: 'transport.rejected' }>;
type JoinRejectedParseMessage = Extract<ServerMessageDto, { type: 'join.rejected' }>;
type RoundDraftRejectedParseMessage = Extract<ServerMessageDto, { type: 'roundDraft.rejected' }>;
type ParseClientMessageResult =
  | { ok: true; value: ClientMessageDto }
  | {
      ok: false;
      error: string;
      rejection?: TransportRejectedParseMessage | JoinRejectedParseMessage | RoundDraftRejectedParseMessage;
    };

const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const toTransportParseError = (
  code: TransportRejectedParseMessage['code'],
  error: string,
  requestType = '',
): TransportRejectedParseMessage => ({
  type: 'transport.rejected',
  code,
  error,
  requestType,
});

const toJoinPayloadParseError = (
  sessionId: unknown,
  error: string,
): JoinRejectedParseMessage => ({
  type: 'join.rejected',
  sessionId: isString(sessionId) ? sessionId : '',
  code: 'invalid_payload',
  error,
});

const toRoundDraftPayloadParseError = (
  operation: RoundDraftRejectedParseMessage['operation'],
  roundNumber: unknown,
  error: string,
): RoundDraftRejectedParseMessage => ({
  type: 'roundDraft.rejected',
  operation,
  roundNumber: isNumber(roundNumber) ? roundNumber : 0,
  code: 'invalid_payload',
  error,
  errors: [],
});

export const parseClientMessage = (raw: string): ParseClientMessageResult => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      error: 'Invalid JSON',
      rejection: toTransportParseError('invalid_json', 'Invalid JSON'),
    };
  }
  if (!parsed || typeof parsed !== 'object') {
    return {
      ok: false,
      error: 'Invalid payload',
      rejection: toTransportParseError('invalid_payload', 'Invalid payload'),
    };
  }
  const data = parsed as {
    type?: unknown;
    sessionId?: unknown;
    token?: unknown;
    deckId?: unknown;
    seed?: unknown;
    roundNumber?: unknown;
    intents?: unknown;
  };
  if (data.type === 'join') {
    if (!isString(data.sessionId) || !isString(data.token) || !isString(data.deckId)) {
      return {
        ok: false,
        error: 'Invalid join payload',
        rejection: toJoinPayloadParseError(data.sessionId, 'Invalid join payload'),
      };
    }
    if (data.seed !== undefined && !isNumber(data.seed)) {
      return {
        ok: false,
        error: 'Invalid seed',
        rejection: toJoinPayloadParseError(data.sessionId, 'Invalid seed'),
      };
    }
    return {
      ok: true,
      value: { type: 'join', sessionId: data.sessionId, token: data.token, deckId: data.deckId, seed: data.seed },
    };
  }
  if (data.type === 'roundDraft.replace') {
    if (!isNumber(data.roundNumber) || !Array.isArray(data.intents)) {
      return {
        ok: false,
        error: 'Invalid roundDraft.replace payload',
        rejection: toRoundDraftPayloadParseError('replace', data.roundNumber, 'Invalid roundDraft.replace payload'),
      };
    }
    return {
      ok: true,
      value: {
        type: 'roundDraft.replace',
        roundNumber: data.roundNumber,
        intents: data.intents,
      },
    };
  }
  if (data.type === 'roundDraft.lock') {
    if (!isNumber(data.roundNumber)) {
      return {
        ok: false,
        error: 'Invalid roundDraft.lock payload',
        rejection: toRoundDraftPayloadParseError('lock', data.roundNumber, 'Invalid roundDraft.lock payload'),
      };
    }
    return {
      ok: true,
      value: {
        type: 'roundDraft.lock',
        roundNumber: data.roundNumber,
      },
    };
  }
  return {
    ok: false,
    error: 'Unknown message type',
    rejection: toTransportParseError(
      'unknown_message_type',
      'Unknown message type',
      isString(data.type) ? data.type : '',
    ),
  };
};
