import { TargetType } from './enums';
import {
  CardInstanceId,
  CharacterId,
  CreatureId,
  PlayerId,
} from './ids';

export type ResolutionLayer =
  | 'summon'
  | 'defensive_modifiers'
  | 'defensive_spells'
  | 'other_modifiers'
  | 'offensive_control_spells'
  | 'attacks'
  | 'cleanup_end_of_round';

export type RoundStatus =
  | 'draft'
  | 'locked_waiting'
  | 'resolving'
  | 'resolved';

export interface RoundActionIntentTarget {
  targetId?: CharacterId | CreatureId;
  targetType?: TargetType;
}

export interface RoundActionIntentBase {
  intentId: string;
  roundNumber: number;
  playerId: PlayerId;
  actorId: CharacterId | CreatureId;
  queueIndex: number;
  kind: 'Summon' | 'CastSpell' | 'PlayCard' | 'Attack' | 'Evade';
  priority?: number;
}

export interface SummonRoundActionIntent extends RoundActionIntentBase {
  kind: 'Summon';
  cardInstanceId: CardInstanceId;
}

export interface CastSpellRoundActionIntent extends RoundActionIntentBase {
  kind: 'CastSpell';
  cardInstanceId: CardInstanceId;
  target: RoundActionIntentTarget;
}

export interface PlayCardRoundActionIntent extends RoundActionIntentBase {
  kind: 'PlayCard';
  cardInstanceId: CardInstanceId;
  target: RoundActionIntentTarget;
}

export interface AttackRoundActionIntent extends RoundActionIntentBase {
  kind: 'Attack';
  sourceCreatureId: CreatureId;
  target: RoundActionIntentTarget;
}

export interface EvadeRoundActionIntent extends RoundActionIntentBase {
  kind: 'Evade';
}

export type RoundActionIntent =
  | SummonRoundActionIntent
  | CastSpellRoundActionIntent
  | PlayCardRoundActionIntent
  | AttackRoundActionIntent
  | EvadeRoundActionIntent;

export interface PlayerRoundDraft {
  playerId: PlayerId;
  roundNumber: number;
  locked: boolean;
  intents: RoundActionIntent[];
}

export interface CompiledRoundAction {
  intent: RoundActionIntent;
  layer: ResolutionLayer;
  priority: number;
  roundInitiativePlayerId: PlayerId;
}

export type RoundActionReasonCode =
  | 'resolved'
  | 'invalid_intent'
  | 'card_unavailable'
  | 'card_definition_missing'
  | 'target_invalidated'
  | 'attack_source_unavailable'
  | 'summoning_sickness'
  | 'actor_unavailable'
  | 'command_unavailable';

export interface ResolvedRoundAction {
  intentId: string;
  playerId: PlayerId;
  layer: ResolutionLayer;
  status: 'resolved' | 'fizzled';
  reasonCode: RoundActionReasonCode;
  summary: string;
}

export interface RoundResolutionResult {
  roundNumber: number;
  orderedActions: ResolvedRoundAction[];
}

export interface PublicRoundPlayerState {
  playerId: PlayerId;
  locked: boolean;
  draftCount: number;
}

export interface RoundState {
  number: number;
  status: RoundStatus;
  initiativePlayerId: PlayerId;
  players: Record<PlayerId, PublicRoundPlayerState>;
  lastResolution?: RoundResolutionResult;
}

export interface RoundDraftValidationError {
  code: string;
  message: string;
  intentId?: string;
}

export type RoundDraftValidationResult =
  | { ok: true }
  | { ok: false; errors: RoundDraftValidationError[] };
