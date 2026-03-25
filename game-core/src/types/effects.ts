import { CardInstanceId, CharacterId, CreatureId, EffectId, PlayerId } from './ids';
import { AttackType } from './enums';

export type EffectType =
  | 'DamageEffect'
  | 'HealEffect'
  | 'ShieldEffect'
  | 'BuffEffect'
  | 'DebuffEffect'
  | 'SummonEffect';

export interface EffectDefinition {
  type: EffectType;
  value?: number;
  attackType?: AttackType;
  duration?: number;
  creatureDefinitionId?: string;
}

export interface EffectInstance {
  effectId: EffectId;
  type: EffectType;
  sourceId?: CharacterId | CreatureId;
  ownerId?: PlayerId;
  sourceCardInstanceId?: CardInstanceId;
  definitionId?: string;
  targetId?: CharacterId | CreatureId;
  createdAtTurn: number;
  duration?: number;
  data?: Record<string, unknown>;
}
