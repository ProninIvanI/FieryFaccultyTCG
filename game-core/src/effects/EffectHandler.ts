import { EffectInstance, GameState } from '../types';
import { GameEngineContext } from '../engine/GameEngineContext';

export interface EffectHandler {
  type: EffectInstance['type'];
  onApply(effect: EffectInstance, state: GameState, ctx: GameEngineContext): void;
  onResolve(effect: EffectInstance, state: GameState, ctx: GameEngineContext): void;
  onExpire(effect: EffectInstance, state: GameState, ctx: GameEngineContext): void;
}
