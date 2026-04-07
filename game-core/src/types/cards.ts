import { CardLocation, CardType, TargetType } from './enums';
import { CardInstanceId, PlayerId } from './ids';
import { EffectDefinition } from './effects';

export type CardSchool = 'fire' | 'water' | 'earth' | 'air';

export type ResolutionRole =
  | 'summon'
  | 'offensive_spell'
  | 'defensive_spell'
  | 'control_spell'
  | 'support_spell'
  | 'modifier'
  | 'artifact';

export type SpellKind =
  | 'damage'
  | 'shield'
  | 'heal'
  | 'buff'
  | 'debuff'
  | 'interrupt'
  | 'trap'
  | 'displacement'
  | 'dot';

export type ModifierKind =
  | 'offense'
  | 'defense'
  | 'utility'
  | 'replication'
  | 'resource';

export type ArtKind =
  | 'attack_art'
  | 'defense_art'
  | 'mobility_art'
  | 'support_art'
  | 'resource_art';

export interface CardDefinition {
  id: string;
  name: string;
  type: CardType;
  manaCost: number;
  speed: number;
  targetType: TargetType;
  resolutionRole: ResolutionRole;
  effects: EffectDefinition[];
  school?: CardSchool;
  effectText?: string;
  hp?: number;
  attack?: number;
  spellKind?: SpellKind;
  modifierKind?: ModifierKind;
  artKind?: ArtKind;
}

export interface CardInstance {
  instanceId: CardInstanceId;
  ownerId: PlayerId;
  definitionId: string;
  location: CardLocation;
}
