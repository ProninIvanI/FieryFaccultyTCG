import { EffectHandler } from './EffectHandler';
import { EffectInstance, GameState } from '../types';
import { GameEngineContext } from '../engine/GameEngineContext';

export class NextSpellManaDiscountEffect implements EffectHandler {
  readonly type = 'NextSpellManaDiscountEffect' as const;

  onApply(effect: EffectInstance, state: GameState, _ctx: GameEngineContext): void {
    if (!effect.ownerId || !state.players[effect.ownerId]) {
      return;
    }

    const player = state.players[effect.ownerId];
    player.pendingSpellManaDiscount = Number(player.pendingSpellManaDiscount ?? 0) + Number(effect.data?.value ?? 0);
  }

  onResolve(_effect: EffectInstance, _state: GameState, _ctx: GameEngineContext): void {}

  onExpire(_effect: EffectInstance, _state: GameState, _ctx: GameEngineContext): void {}
}
