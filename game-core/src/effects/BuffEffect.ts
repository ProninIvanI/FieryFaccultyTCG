import { EffectHandler } from './EffectHandler';
import { EffectInstance, GameState } from '../types';
import { GameEngineContext } from '../engine/GameEngineContext';

export class BuffEffect implements EffectHandler {
  readonly type = 'BuffEffect' as const;

  onApply(effect: EffectInstance, state: GameState, _ctx: GameEngineContext): void {
    this.applyDelta(effect, state, 1);
  }

  onResolve(_effect: EffectInstance, _state: GameState, _ctx: GameEngineContext): void {}

  onExpire(effect: EffectInstance, state: GameState, _ctx: GameEngineContext): void {
    this.applyDelta(effect, state, -1);
  }

  private applyDelta(effect: EffectInstance, state: GameState, direction: 1 | -1): void {
    const targetId = effect.targetId;
    if (!targetId) {
      return;
    }
    const delta = Number(effect.data?.value ?? 0) * direction;
    const character = state.characters[targetId];
    if (character) {
      character.dexterity += delta;
    }
  }
}
