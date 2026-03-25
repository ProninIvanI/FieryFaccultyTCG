import {
  Action,
  ActionType,
  AttackAction,
  AttackType,
  CastSpellAction,
  EndTurnAction,
  EvadeAction,
  GameState,
  PlayerBoardModel,
  PlayCardAction,
  PublicBoardView,
  RoundActionIntent,
  RoundDraftValidationError,
  RoundDraftValidationResult,
  RoundResolutionResult,
  PlayerRoundDraft,
  SummonAction,
  TargetType,
} from '../../../game-core/src/types';
import { SessionRegistry } from '../domain/game/SessionRegistry';
import { SessionPlayerLoadout } from '../types/session';

const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const parseActionDto = (value: unknown): { ok: true; action: Action } | { ok: false; error: string } => {
  if (!isRecord(value)) {
    return { ok: false, error: 'Action payload is not object' };
  }
  const data = value;
  const type = data.type;
  if (!isString(type)) {
    return { ok: false, error: 'Action type missing' };
  }
  const base = {
    type: type as ActionType,
    actorId: data.actorId,
    playerId: data.playerId,
  };
  if (!isString(base.actorId) || !isString(base.playerId)) {
    return { ok: false, error: 'Action actorId/playerId missing' };
  }

  switch (type) {
    case 'Attack': {
      if (!isString(data.targetId) || !isString(data.attackType) || !isNumber(data.speed) || !isNumber(data.power)) {
        return { ok: false, error: 'Invalid Attack action' };
      }
      const action: AttackAction = {
        type: 'Attack',
        actorId: base.actorId,
        playerId: base.playerId,
        targetId: data.targetId,
        attackType: data.attackType as AttackType,
        speed: data.speed,
        power: data.power,
      };
      return { ok: true, action };
    }
    case 'CastSpell': {
      if (!isString(data.cardInstanceId) || !isString(data.targetType)) {
        return { ok: false, error: 'Invalid CastSpell action' };
      }
      const action: CastSpellAction = {
        type: 'CastSpell',
        actorId: base.actorId,
        playerId: base.playerId,
        cardInstanceId: data.cardInstanceId,
        targetId: isString(data.targetId) ? data.targetId : undefined,
        targetType: data.targetType as TargetType,
      };
      return { ok: true, action };
    }
    case 'Summon': {
      if (!isString(data.cardInstanceId)) {
        return { ok: false, error: 'Invalid Summon action' };
      }
      const action: SummonAction = {
        type: 'Summon',
        actorId: base.actorId,
        playerId: base.playerId,
        cardInstanceId: data.cardInstanceId,
      };
      return { ok: true, action };
    }
    case 'Evade': {
      const action: EvadeAction = {
        type: 'Evade',
        actorId: base.actorId,
        playerId: base.playerId,
      };
      return { ok: true, action };
    }
    case 'PlayCard': {
      if (!isString(data.cardInstanceId) || !isString(data.targetType)) {
        return { ok: false, error: 'Invalid PlayCard action' };
      }
      const action: PlayCardAction = {
        type: 'PlayCard',
        actorId: base.actorId,
        playerId: base.playerId,
        cardInstanceId: data.cardInstanceId,
        targetId: isString(data.targetId) ? data.targetId : undefined,
        targetType: data.targetType as TargetType,
      };
      return { ok: true, action };
    }
    case 'EndTurn': {
      const action: EndTurnAction = {
        type: 'EndTurn',
        actorId: base.actorId,
        playerId: base.playerId,
      };
      return { ok: true, action };
    }
    default:
      return { ok: false, error: 'Unknown action type' };
  }
};

const parseRoundIntentDto = (value: unknown): { ok: true; intent: RoundActionIntent } | { ok: false; error: string } => {
  if (!isRecord(value)) {
    return { ok: false, error: 'Round intent payload is not object' };
  }

  const {
    kind,
    intentId,
    roundNumber,
    playerId,
    actorId,
    queueIndex,
    priority,
  } = value;

  if (
    !isString(kind) ||
    !isString(intentId) ||
    !isNumber(roundNumber) ||
    !isString(playerId) ||
    !isString(actorId) ||
    !isNumber(queueIndex)
  ) {
    return { ok: false, error: 'Round intent base fields are invalid' };
  }

  const base = {
    kind: kind as RoundActionIntent['kind'],
    intentId,
    roundNumber,
    playerId,
    actorId,
    queueIndex,
    ...(isNumber(priority) ? { priority } : {}),
  };

  switch (kind) {
    case 'Summon': {
      if (!isString(value.cardInstanceId)) {
        return { ok: false, error: 'Invalid Summon round intent' };
      }
      return {
        ok: true,
        intent: {
          ...base,
          kind: 'Summon',
          cardInstanceId: value.cardInstanceId,
        },
      };
    }
    case 'CastSpell':
    case 'PlayCard': {
      if (!isString(value.cardInstanceId) || !isRecord(value.target)) {
        return { ok: false, error: `Invalid ${kind} round intent` };
      }
      const targetId = isString(value.target.targetId) ? value.target.targetId : undefined;
      const targetType = isString(value.target.targetType)
        ? (value.target.targetType as TargetType)
        : undefined;
      return {
        ok: true,
        intent: {
          ...base,
          kind,
          cardInstanceId: value.cardInstanceId,
          target: {
            ...(targetId ? { targetId } : {}),
            ...(targetType ? { targetType } : {}),
          },
        },
      };
    }
    case 'Attack': {
      if (!isString(value.sourceCreatureId) || !isRecord(value.target)) {
        return { ok: false, error: 'Invalid Attack round intent' };
      }
      const targetId = isString(value.target.targetId) ? value.target.targetId : undefined;
      const targetType = isString(value.target.targetType)
        ? (value.target.targetType as TargetType)
        : undefined;
      return {
        ok: true,
        intent: {
          ...base,
          kind: 'Attack',
          sourceCreatureId: value.sourceCreatureId,
          target: {
            ...(targetId ? { targetId } : {}),
            ...(targetType ? { targetType } : {}),
          },
        },
      };
    }
    case 'Evade':
      return {
        ok: true,
        intent: {
          ...base,
          kind: 'Evade',
        },
      };
    default:
      return { ok: false, error: 'Unknown round intent kind' };
  }
};

type ApplyActionResult =
  | { ok: true; state: GameState }
  | { ok: false; error: string };

export interface RoundDraftRejection {
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

type ReplaceRoundDraftResult =
  | { ok: true; state: GameState }
  | { ok: false; error: string; rejection?: RoundDraftRejection };

type LockRoundDraftResult =
  | { ok: true; state: GameState; resolved: RoundResolutionResult | null }
  | { ok: false; error: string; rejection?: RoundDraftRejection };

type JoinResult =
  | { ok: true; session: ReturnType<SessionRegistry['create']> }
  | { ok: false; error: string };

export type GameStateSnapshot = GameState & {
  boardView: PublicBoardView;
};

export interface PlayerRoundDraftSnapshot {
  roundNumber: number;
  locked: boolean;
  intents: RoundActionIntent[];
  boardModel: PlayerBoardModel | null;
}

export class GameService {
  constructor(private readonly sessions: SessionRegistry) {}

  getSession(sessionId: string) {
    return this.sessions.get(sessionId);
  }

  getRoundDraft(sessionId: string, playerId: string): PlayerRoundDraft | null {
    const session = this.sessions.get(sessionId);
    if (!session || !session.hasPlayer(playerId)) {
      return null;
    }
    return session.getRoundDraft(playerId);
  }

  getStateSnapshot(sessionId: string): GameStateSnapshot | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    return {
      ...session.getState(),
      boardView: session.buildPublicBoardView(),
    };
  }

  getRoundDraftSnapshot(sessionId: string, playerId: string): PlayerRoundDraftSnapshot | null {
    const session = this.sessions.get(sessionId);
    if (!session || !session.hasPlayer(playerId)) {
      return null;
    }

    const draft = session.getRoundDraft(playerId);
    const roundNumber = draft?.roundNumber ?? session.getState().round.number;

    return {
      roundNumber,
      locked: draft?.locked ?? false,
      intents: draft?.intents ?? [],
      boardModel: session.buildPlayerBoardModel(playerId),
    };
  }

  join(sessionId: string, loadout: SessionPlayerLoadout, seed?: number): JoinResult {
    const playerId = loadout.playerId;
    const existing = this.sessions.get(sessionId);
    if (existing) {
      if (seed !== undefined && existing.getSeed() !== seed) {
        return { ok: false, error: 'Session already exists with a different seed' };
      }
      if (!existing.hasPlayer(playerId) && existing.getPlayerCount() >= 2) {
        return { ok: false, error: 'Session is full' };
      }
      if (!existing.hasPlayer(playerId)) {
        existing.syncPlayerLoadout(loadout);
      }
      existing.addPlayer(playerId);
      return { ok: true, session: existing };
    }

    const session = this.sessions.create(sessionId, seed ?? 1, [loadout]);
    session.addPlayer(playerId);
    return { ok: true, session };
  }

  applyAction(sessionId: string, playerId: string, actionDto: unknown): ApplyActionResult {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { ok: false, error: 'Session not found' };
    }
    if (!session.hasPlayer(playerId)) {
      return { ok: false, error: 'Player is not in session' };
    }
    const parsed = parseActionDto(actionDto);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }
    if (parsed.action.playerId !== playerId) {
      return { ok: false, error: 'Action playerId does not match socket player' };
    }
    const result = session.processAction(parsed.action);
    if (!result.ok) {
      return { ok: false, error: result.errors?.join(', ') ?? 'Invalid action' };
    }
    return { ok: true, state: session.getState() };
  }

  replaceRoundDraft(
    sessionId: string,
    playerId: string,
    roundNumber: number,
    intentsDto: unknown[],
  ): ReplaceRoundDraftResult {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        ok: false,
        error: 'Session not found',
        rejection: this.toOperationalRoundDraftRejection('replace', roundNumber, 'session_not_found', 'Session not found'),
      };
    }
    if (!session.hasPlayer(playerId)) {
      return {
        ok: false,
        error: 'Player is not in session',
        rejection: this.toOperationalRoundDraftRejection('replace', roundNumber, 'player_not_in_session', 'Player is not in session'),
      };
    }

    const intents: RoundActionIntent[] = [];
    for (const intentDto of intentsDto) {
      const parsed = parseRoundIntentDto(intentDto);
      if (!parsed.ok) {
        return {
          ok: false,
          error: parsed.error,
          rejection: this.toOperationalRoundDraftRejection('replace', roundNumber, 'invalid_payload', parsed.error),
        };
      }
      if (parsed.intent.playerId !== playerId) {
        return {
          ok: false,
          error: 'Round intent playerId does not match socket player',
          rejection: this.toOperationalRoundDraftRejection(
            'replace',
            roundNumber,
            'player_mismatch',
            'Round intent playerId does not match socket player',
          ),
        };
      }
      if (parsed.intent.roundNumber !== roundNumber) {
        return {
          ok: false,
          error: 'Round intent roundNumber does not match message roundNumber',
          rejection: this.toOperationalRoundDraftRejection(
            'replace',
            roundNumber,
            'round_number_mismatch',
            'Round intent roundNumber does not match message roundNumber',
          ),
        };
      }
      intents.push(parsed.intent);
    }

    const result = session.submitRoundDraft(playerId, roundNumber, intents);
    if (!result.ok) {
      return {
        ok: false,
        error: this.formatRoundDraftValidationError(result),
        rejection: this.toRoundDraftRejection('replace', roundNumber, result),
      };
    }

    return { ok: true, state: session.getState() };
  }

  lockRoundDraft(sessionId: string, playerId: string, roundNumber: number): LockRoundDraftResult {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        ok: false,
        error: 'Session not found',
        rejection: this.toOperationalRoundDraftRejection('lock', roundNumber, 'session_not_found', 'Session not found'),
      };
    }
    if (!session.hasPlayer(playerId)) {
      return {
        ok: false,
        error: 'Player is not in session',
        rejection: this.toOperationalRoundDraftRejection('lock', roundNumber, 'player_not_in_session', 'Player is not in session'),
      };
    }

    const validation = session.lockRoundDraft(playerId, roundNumber);
    if (!validation.ok) {
      return {
        ok: false,
        error: this.formatRoundDraftValidationError(validation),
        rejection: this.toRoundDraftRejection('lock', roundNumber, validation),
      };
    }

    const resolved = session.resolveRoundIfReady();
    return { ok: true, state: session.getState(), resolved };
  }

  private formatRoundDraftValidationError(result: Extract<RoundDraftValidationResult, { ok: false }>): string {
    return result.errors
      .map((error) => (error.intentId ? `${error.message} (${error.intentId})` : error.message))
      .join(', ');
  }

  private toRoundDraftRejection(
    operation: RoundDraftRejection['operation'],
    roundNumber: number,
    result: Extract<RoundDraftValidationResult, { ok: false }>,
  ): RoundDraftRejection {
    return {
      operation,
      roundNumber,
      code: 'validation_failed',
      error: this.formatRoundDraftValidationError(result),
      errors: result.errors.map((entry) => ({ ...entry })),
    };
  }

  private toOperationalRoundDraftRejection(
    operation: RoundDraftRejection['operation'],
    roundNumber: number,
    code: RoundDraftRejection['code'],
    error: string,
  ): RoundDraftRejection {
    return {
      operation,
      roundNumber,
      code,
      error,
      errors: [],
    };
  }
}
