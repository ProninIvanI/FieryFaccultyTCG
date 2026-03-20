import { EffectHandler } from './EffectHandler';
import { EffectInstance, GameState } from '../types';
import { GameEngineContext } from '../engine/GameEngineContext';

export class HealEffect implements EffectHandler {
  readonly type = 'HealEffect' as const;

  onApply(_effect: EffectInstance, _state: GameState, _ctx: GameEngineContext): void {}

  onResolve(effect: EffectInstance, state: GameState, _ctx: GameEngineContext): void {
    const targetId = effect.targetId;
    if (!targetId) {
      return;
    }
    const value = Number(effect.data?.value ?? 0);
    const character = state.characters[targetId];
    const creature = state.creatures[targetId];
    if (character) {
      character.hp = Math.min(character.maxHp, character.hp + value);
    } else if (creature) {
      creature.hp = Math.min(creature.maxHp, creature.hp + value);
    }
  }

  onExpire(_effect: EffectInstance, _state: GameState, _ctx: GameEngineContext): void {}
}
