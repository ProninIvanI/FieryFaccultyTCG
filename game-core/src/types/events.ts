import { Action } from './actions';
import { CharacterId, CreatureId, EffectId } from './ids';

export type GameEventType =
  | 'onAction'
  | 'onDamage'
  | 'onTurnStart'
  | 'onTurnEnd'
  | 'onCharacterDeath'
  | 'onSummon'
  | 'onEffectTrigger';

export interface GameEventPayloadMap {
  onAction: { action: Action };
  onDamage: { targetId: CharacterId | CreatureId; amount: number };
  onTurnStart: { turn: number; activePlayerId: string };
  onTurnEnd: { turn: number; activePlayerId: string };
  onCharacterDeath: { characterId: CharacterId };
  onSummon: { creatureId: CreatureId };
  onEffectTrigger: { effectId: EffectId };
}

export type GameEvent<T extends GameEventType = GameEventType> = {
  type: T;
  payload: GameEventPayloadMap[T];
  seq: number;
};
