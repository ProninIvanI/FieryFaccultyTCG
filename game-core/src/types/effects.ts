import { CardInstanceId, CharacterId, CreatureId, EffectId, PlayerId } from './ids';
import { AttackType } from './enums';

export type EffectType =
  | 'DamageEffect'
  | 'HealEffect'
  | 'ShieldEffect'
  | 'BuffEffect'
  | 'DebuffEffect'
  | 'SummonEffect'
  | 'CannotEvadeEffect'
  | 'SkipActionEffect'
  | 'InterruptSlowSpellEffect'
  | 'TrapOnOffensiveActionEffect'
  | 'NextSpellDamageBoostEffect'
  | 'NextSpellSpeedBoostEffect'
  | 'NextSpellIgnoreShieldEffect'
  | 'NextSpellIgnoreEvadeEffect'
  | 'NextSpellManaDiscountEffect'
  | 'NextSpellRepeatEffect'
  | 'RestoreManaEffect'
  | 'DrawCardEffect'
  | 'NextAttackDamageBoostEffect'
  | 'RoundSpeedBuffEffect';

export interface EffectDefinition {
  type: EffectType;
  value?: number;
  attackType?: AttackType;
  duration?: number;
  creatureDefinitionId?: string;
  stat?: 'attack' | 'speed' | 'shield' | 'hp' | 'agility';
  targetCount?: number;
  ignoreShield?: number;
  ignoreEvade?: boolean;
  repeatNextTurn?: boolean;
  appliesToAllEnemies?: boolean;
  appliesToAllCreatures?: boolean;
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
