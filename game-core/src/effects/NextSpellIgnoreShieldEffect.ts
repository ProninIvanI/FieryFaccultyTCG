import { EffectHandler } from './EffectHandler';
import { EffectInstance, GameState } from '../types';
import { GameEngineContext } from '../engine/GameEngineContext';

export class NextSpellIgnoreShieldEffect implements EffectHandler {
  readonly type = 'NextSpellIgnoreShieldEffect' as const;

  onApply(effect: EffectInstance, state: GameState, _ctx: GameEngineContext): void {
    const ownerId = effect.ownerId;
    if (!ownerId || !state.players[ownerId]) {
      return;
    }

    state.players[ownerId].pendingSpellIgnoreShield = Math.max(
      Number(state.players[ownerId].pendingSpellIgnoreShield ?? 0),
      Number(effect.data?.value ?? 0),
    );
  }

  onResolve(_effect: EffectInstance, _state: GameState, _ctx: GameEngineContext): void {}

  onExpire(_effect: EffectInstance, _state: GameState, _ctx: GameEngineContext): void {}
}
