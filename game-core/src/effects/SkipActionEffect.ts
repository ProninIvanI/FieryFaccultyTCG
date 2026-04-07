import { EffectHandler } from './EffectHandler';
import { EffectInstance, GameState } from '../types';
import { GameEngineContext } from '../engine/GameEngineContext';

export class SkipActionEffect implements EffectHandler {
  readonly type = 'SkipActionEffect' as const;

  onApply(effect: EffectInstance, state: GameState, _ctx: GameEngineContext): void {
    const targetId = effect.targetId;
    if (!targetId) {
      return;
    }

    const character = state.characters[targetId];
    if (character) {
      character.skipNextAction = true;
      return;
    }

    const creature = state.creatures[targetId];
    if (creature) {
      creature.skipNextAction = true;
    }
  }

  onResolve(_effect: EffectInstance, _state: GameState, _ctx: GameEngineContext): void {}

  onExpire(_effect: EffectInstance, _state: GameState, _ctx: GameEngineContext): void {}
}
