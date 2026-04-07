import { EffectHandler } from './EffectHandler';
import { EffectInstance, GameState } from '../types';
import { GameEngineContext } from '../engine/GameEngineContext';

export class RestoreManaEffect implements EffectHandler {
  readonly type = 'RestoreManaEffect' as const;

  onApply(effect: EffectInstance, state: GameState, _ctx: GameEngineContext): void {
    const ownerId = effect.ownerId;
    if (!ownerId) {
      return;
    }

    const player = state.players[ownerId];
    if (!player) {
      return;
    }

    const value = Number(effect.data?.value ?? 0);
    player.mana = Math.min(player.maxMana, player.mana + value);
  }

  onResolve(_effect: EffectInstance, _state: GameState, _ctx: GameEngineContext): void {}

  onExpire(_effect: EffectInstance, _state: GameState, _ctx: GameEngineContext): void {}
}
