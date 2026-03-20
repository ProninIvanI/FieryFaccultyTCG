import { CardLocation, CardType, TargetType } from './enums';
import { CardInstanceId, PlayerId } from './ids';
import { EffectDefinition } from './effects';

export interface CardDefinition {
  id: string;
  name: string;
  type: CardType;
  manaCost: number;
  speed: number;
  targetType: TargetType;
  effects: EffectDefinition[];
}

export interface CardInstance {
  instanceId: CardInstanceId;
  ownerId: PlayerId;
  definitionId: string;
  location: CardLocation;
}
