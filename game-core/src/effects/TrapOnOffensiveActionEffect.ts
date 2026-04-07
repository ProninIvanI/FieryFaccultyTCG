import { EffectHandler } from './EffectHandler';
import { EffectInstance, GameState } from '../types';
import { GameEngineContext } from '../engine/GameEngineContext';

export class TrapOnOffensiveActionEffect implements EffectHandler {
  readonly type = 'TrapOnOffensiveActionEffect' as const;

  onApply(effect: EffectInstance, state: GameState, _ctx: GameEngineContext): void {
    const targetId = effect.targetId;
    if (!targetId) {
      return;
    }

    const character = state.characters[targetId];
    if (!character) {
      return;
    }

    character.trapOnOffensiveActionDamage = Number(effect.data?.value ?? 0);
    character.trapOnOffensiveActionCharges = Number(character.trapOnOffensiveActionCharges ?? 0) + 1;
  }

  onResolve(_effect: EffectInstance, _state: GameState, _ctx: GameEngineContext): void {}

  onExpire(_effect: EffectInstance, _state: GameState, _ctx: GameEngineContext): void {}
}

