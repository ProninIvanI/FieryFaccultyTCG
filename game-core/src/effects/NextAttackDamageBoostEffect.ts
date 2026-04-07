import { EffectHandler } from './EffectHandler';
import { EffectInstance, GameState } from '../types';
import { GameEngineContext } from '../engine/GameEngineContext';

export class NextAttackDamageBoostEffect implements EffectHandler {
  readonly type = 'NextAttackDamageBoostEffect' as const;

  onApply(effect: EffectInstance, state: GameState, _ctx: GameEngineContext): void {
    const ownerId = effect.ownerId;
    if (!ownerId || !state.players[ownerId]) {
      return;
    }

    state.players[ownerId].pendingAttackDamageBonus =
      Number(state.players[ownerId].pendingAttackDamageBonus ?? 0) + Number(effect.data?.value ?? 0);
  }

  onResolve(_effect: EffectInstance, _state: GameState, _ctx: GameEngineContext): void {}

  onExpire(_effect: EffectInstance, _state: GameState, _ctx: GameEngineContext): void {}
}
