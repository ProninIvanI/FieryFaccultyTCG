import { ActionType, AttackType, TargetType } from './enums';
import { CardInstanceId, CharacterId, CreatureId, PlayerId } from './ids';

export interface BaseAction {
  type: ActionType;
  actorId: CharacterId;
  playerId: PlayerId;
}

export interface AttackAction extends BaseAction {
  type: 'Attack';
  attackType: AttackType;
  targetId: CharacterId | CreatureId;
  speed: number;
  power: number;
}

export interface CastSpellAction extends BaseAction {
  type: 'CastSpell';
  cardInstanceId: CardInstanceId;
  targetId?: CharacterId | CreatureId;
  targetType: TargetType;
}

export interface SummonAction extends BaseAction {
  type: 'Summon';
  cardInstanceId: CardInstanceId;
}

export interface EvadeAction extends BaseAction {
  type: 'Evade';
}

export interface PlayCardAction extends BaseAction {
  type: 'PlayCard';
  cardInstanceId: CardInstanceId;
  targetId?: CharacterId | CreatureId;
  targetType: TargetType;
}

export interface EndTurnAction extends BaseAction {
  type: 'EndTurn';
}

export type Action =
  | AttackAction
  | CastSpellAction
  | SummonAction
  | EvadeAction
  | PlayCardAction
  | EndTurnAction;
