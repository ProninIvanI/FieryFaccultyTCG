import { EffectHandler } from './EffectHandler';
import { EffectInstance, GameState } from '../types';
import { GameEngineContext } from '../engine/GameEngineContext';
import { drawCards } from '../engine/createInitialState';

export class DrawCardEffect implements EffectHandler {
  readonly type = 'DrawCardEffect' as const;

  onApply(effect: EffectInstance, state: GameState, _ctx: GameEngineContext): void {
    const ownerId = effect.ownerId;
    if (!ownerId) {
      return;
    }

    drawCards(state, ownerId, Number(effect.data?.value ?? 0));
  }

  onResolve(_effect: EffectInstance, _state: GameState, _ctx: GameEngineContext): void {}

  onExpire(_effect: EffectInstance, _state: GameState, _ctx: GameEngineContext): void {}
}
