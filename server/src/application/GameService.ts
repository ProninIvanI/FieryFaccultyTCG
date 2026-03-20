import {
  Action,
  ActionType,
  AttackAction,
  CastSpellAction,
  SummonAction,
  EvadeAction,
  PlayCardAction,
  EndTurnAction,
  AttackType,
  TargetType,
} from '../../../game-core/src/types';
import { SessionRegistry } from '../domain/game/SessionRegistry';
import { GameState } from '../../../game-core/src/types';

const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const parseActionDto = (value: unknown): { ok: true; action: Action } | { ok: false; error: string } => {
  if (!value || typeof value !== 'object') {
    return { ok: false, error: 'Action payload is not object' };
  }
  const data = value as Record<string, unknown>;
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

type ApplyActionResult =
  | { ok: true; state: GameState }
  | { ok: false; error: string };

type JoinResult =
  | { ok: true; session: ReturnType<SessionRegistry['getOrCreate']> }
  | { ok: false; error: string };

export class GameService {
  constructor(private readonly sessions: SessionRegistry) {}

  join(sessionId: string, playerId: string, seed?: number): JoinResult {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      if (seed !== undefined && existing.getSeed() !== seed) {
        return { ok: false, error: 'Session already exists with a different seed' };
      }
      if (!existing.hasPlayer(playerId) && existing.getPlayerCount() >= 2) {
        return { ok: false, error: 'Session is full' };
      }
    }

    const session = this.sessions.getOrCreate(sessionId, seed ?? 1);
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
}
