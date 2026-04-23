import type { PlayerBoardModel, RoundDraftValidationError, RoundResolutionResult } from '../../../../game-core/src/types';
import type { MatchInviteRecord } from '../../domain/social/MatchInviteRegistry';
import type { PresenceState } from '../../domain/social/PresenceRegistry';
import type { SocialGraphSnapshot } from '../../infrastructure/social/SocialGraphClient';

export type ClientMessageDto =
  | { type: 'join'; sessionId: string; token: string; deckId: string; seed?: number }
  | { type: 'roundDraft.replace'; roundNumber: number; intents: unknown[] }
  | { type: 'roundDraft.lock'; roundNumber: number }
  | { type: 'social.subscribe'; token: string }
  | { type: 'social.friends.query' }
  | { type: 'social.presence.query'; userIds: string[] }
  | { type: 'friendRequest.send'; username: string }
  | { type: 'friendRequest.accept'; requestId: string }
  | { type: 'friendRequest.decline'; requestId: string }
  | { type: 'friendRequest.cancel'; requestId: string }
  | { type: 'friend.delete'; friendUserId: string }
  | { type: 'matchInvite.send'; targetUserId: string }
  | { type: 'matchInvite.respond'; inviteId: string; action: 'accept' | 'decline' }
  | { type: 'matchInvite.cancel'; inviteId: string };

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
        | 'deck_invalid'
        | 'session_full'
        | 'duplicate_character'
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
  | {
      type: 'roundStatus';
      roundNumber: number;
      selfLocked: boolean;
      opponentLocked: boolean;
      selfDraftCount: number;
      opponentDraftCount: number;
    }
  | { type: 'roundResolved'; result: RoundResolutionResult }
  | { type: 'social.subscribed'; userId: string; username?: string }
  | {
      type: 'social.friends.snapshot';
      friends: SocialGraphSnapshot['friends'];
      incomingRequests: SocialGraphSnapshot['incomingRequests'];
      outgoingRequests: SocialGraphSnapshot['outgoingRequests'];
    }
  | { type: 'social.presence'; presences: Array<{ userId: string; status: PresenceState }> }
  | { type: 'social.invites.snapshot'; invites: MatchInviteRecord[] }
  | {
      type: 'social.friends.rejected';
      code: 'unauthorized' | 'invalid_payload' | 'internal_error';
      error: string;
      requestType: 'social.friends.query' | 'friendRequest.send' | 'friendRequest.accept' | 'friendRequest.decline' | 'friendRequest.cancel' | 'friend.delete';
      requestId?: string;
      friendUserId?: string;
    }
  | { type: 'matchInvite.received'; invite: MatchInviteRecord }
  | { type: 'matchInvite.updated'; invite: MatchInviteRecord }
  | {
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
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString);

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
    userIds?: unknown;
    username?: unknown;
    targetUserId?: unknown;
    inviteId?: unknown;
    action?: unknown;
    requestId?: unknown;
    friendUserId?: unknown;
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
  if (data.type === 'social.subscribe') {
    if (!isString(data.token)) {
      return {
        ok: false,
        error: 'Invalid social.subscribe payload',
        rejection: toTransportParseError('invalid_payload', 'Invalid social.subscribe payload', 'social.subscribe'),
      };
    }
    return {
      ok: true,
      value: {
        type: 'social.subscribe',
        token: data.token,
      },
    };
  }
  if (data.type === 'social.presence.query') {
    if (!isStringArray(data.userIds)) {
      return {
        ok: false,
        error: 'Invalid social.presence.query payload',
        rejection: toTransportParseError('invalid_payload', 'Invalid social.presence.query payload', 'social.presence.query'),
      };
    }
    return {
      ok: true,
      value: {
        type: 'social.presence.query',
        userIds: data.userIds,
      },
    };
  }
  if (data.type === 'social.friends.query') {
    return {
      ok: true,
      value: {
        type: 'social.friends.query',
      },
    };
  }
  if (data.type === 'friendRequest.send') {
    if (!isString(data.username)) {
      return {
        ok: false,
        error: 'Invalid friendRequest.send payload',
        rejection: toTransportParseError('invalid_payload', 'Invalid friendRequest.send payload', 'friendRequest.send'),
      };
    }
    return {
      ok: true,
      value: {
        type: 'friendRequest.send',
        username: data.username,
      },
    };
  }
  if (data.type === 'friendRequest.accept') {
    if (!isString(data.requestId)) {
      return {
        ok: false,
        error: 'Invalid friendRequest.accept payload',
        rejection: toTransportParseError('invalid_payload', 'Invalid friendRequest.accept payload', 'friendRequest.accept'),
      };
    }
    return {
      ok: true,
      value: {
        type: 'friendRequest.accept',
        requestId: data.requestId,
      },
    };
  }
  if (data.type === 'friendRequest.decline') {
    if (!isString(data.requestId)) {
      return {
        ok: false,
        error: 'Invalid friendRequest.decline payload',
        rejection: toTransportParseError('invalid_payload', 'Invalid friendRequest.decline payload', 'friendRequest.decline'),
      };
    }
    return {
      ok: true,
      value: {
        type: 'friendRequest.decline',
        requestId: data.requestId,
      },
    };
  }
  if (data.type === 'friendRequest.cancel') {
    if (!isString(data.requestId)) {
      return {
        ok: false,
        error: 'Invalid friendRequest.cancel payload',
        rejection: toTransportParseError('invalid_payload', 'Invalid friendRequest.cancel payload', 'friendRequest.cancel'),
      };
    }
    return {
      ok: true,
      value: {
        type: 'friendRequest.cancel',
        requestId: data.requestId,
      },
    };
  }
  if (data.type === 'friend.delete') {
    if (!isString(data.friendUserId)) {
      return {
        ok: false,
        error: 'Invalid friend.delete payload',
        rejection: toTransportParseError('invalid_payload', 'Invalid friend.delete payload', 'friend.delete'),
      };
    }
    return {
      ok: true,
      value: {
        type: 'friend.delete',
        friendUserId: data.friendUserId,
      },
    };
  }
  if (data.type === 'matchInvite.send') {
    if (!isString(data.targetUserId)) {
      return {
        ok: false,
        error: 'Invalid matchInvite.send payload',
        rejection: toTransportParseError('invalid_payload', 'Invalid matchInvite.send payload', 'matchInvite.send'),
      };
    }
    return {
      ok: true,
      value: {
        type: 'matchInvite.send',
        targetUserId: data.targetUserId,
      },
    };
  }
  if (data.type === 'matchInvite.respond') {
    if (!isString(data.inviteId) || (data.action !== 'accept' && data.action !== 'decline')) {
      return {
        ok: false,
        error: 'Invalid matchInvite.respond payload',
        rejection: toTransportParseError('invalid_payload', 'Invalid matchInvite.respond payload', 'matchInvite.respond'),
      };
    }
    return {
      ok: true,
      value: {
        type: 'matchInvite.respond',
        inviteId: data.inviteId,
        action: data.action,
      },
    };
  }
  if (data.type === 'matchInvite.cancel') {
    if (!isString(data.inviteId)) {
      return {
        ok: false,
        error: 'Invalid matchInvite.cancel payload',
        rejection: toTransportParseError('invalid_payload', 'Invalid matchInvite.cancel payload', 'matchInvite.cancel'),
      };
    }
    return {
      ok: true,
      value: {
        type: 'matchInvite.cancel',
        inviteId: data.inviteId,
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
