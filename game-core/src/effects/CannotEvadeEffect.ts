import { EffectHandler } from './EffectHandler';
import { EffectInstance, GameState } from '../types';
import { GameEngineContext } from '../engine/GameEngineContext';

export class CannotEvadeEffect implements EffectHandler {
  readonly type = 'CannotEvadeEffect' as const;

  onApply(effect: EffectInstance, state: GameState, _ctx: GameEngineContext): void {
    const targetId = effect.targetId;
    if (!targetId) {
      return;
    }

    const character = state.characters[targetId];
    if (!character) {
      return;
    }

    character.cannotEvadeUntilTurn = state.turn.number + 1;
  }

  onResolve(_effect: EffectInstance, _state: GameState, _ctx: GameEngineContext): void {}

  onExpire(_effect: EffectInstance, _state: GameState, _ctx: GameEngineContext): void {}
}

