import { EffectHandler } from './EffectHandler';
import { EffectInstance, GameState, ShieldState } from '../types';
import { GameEngineContext } from '../engine/GameEngineContext';

export class ShieldEffect implements EffectHandler {
  readonly type = 'ShieldEffect' as const;

  onApply(effect: EffectInstance, state: GameState, _ctx: GameEngineContext): void {
    const targetId = effect.targetId;
    if (!targetId) {
      return;
    }
    const value = Number(effect.data?.value ?? 0);
    const character = state.characters[targetId];
    if (!character) {
      return;
    }
    const shield: ShieldState = {
      energy: value,
      concentrationCost: 1,
    };
    character.shield = shield;
    character.concentration += 1;
  }

  onResolve(_effect: EffectInstance, _state: GameState, _ctx: GameEngineContext): void {}

  onExpire(effect: EffectInstance, state: GameState, _ctx: GameEngineContext): void {
    const targetId = effect.targetId;
    if (!targetId) {
      return;
    }
    const character = state.characters[targetId];
    if (character?.shield) {
      character.shield = undefined;
      character.concentration = Math.max(0, character.concentration - 1);
    }
  }
}
