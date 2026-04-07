import { EffectHandler } from './EffectHandler';
import { EffectInstance, GameState } from '../types';
import { GameEngineContext } from '../engine/GameEngineContext';

export class NextSpellIgnoreEvadeEffect implements EffectHandler {
  readonly type = 'NextSpellIgnoreEvadeEffect' as const;

  onApply(effect: EffectInstance, state: GameState, _ctx: GameEngineContext): void {
    if (!effect.ownerId || !state.players[effect.ownerId]) {
      return;
    }

    state.players[effect.ownerId].pendingSpellIgnoreEvade = true;
  }

  onResolve(_effect: EffectInstance, _state: GameState, _ctx: GameEngineContext): void {}

  onExpire(_effect: EffectInstance, _state: GameState, _ctx: GameEngineContext): void {}
}
