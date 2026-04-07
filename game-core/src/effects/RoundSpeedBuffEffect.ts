import { EffectHandler } from './EffectHandler';
import { EffectInstance, GameState } from '../types';
import { GameEngineContext } from '../engine/GameEngineContext';

export class RoundSpeedBuffEffect implements EffectHandler {
  readonly type = 'RoundSpeedBuffEffect' as const;

  onApply(effect: EffectInstance, state: GameState, _ctx: GameEngineContext): void {
    const targetId = effect.targetId;
    if (!targetId) {
      return;
    }

    const creature = state.creatures[targetId];
    if (!creature) {
      return;
    }

    const bonus = Number(effect.data?.value ?? 0);
    creature.speed += bonus;
    creature.roundSpeedBonus = Number(creature.roundSpeedBonus ?? 0) + bonus;
    creature.roundSpeedBonusUntilRound = state.round.number;
  }

  onResolve(_effect: EffectInstance, _state: GameState, _ctx: GameEngineContext): void {}

  onExpire(_effect: EffectInstance, _state: GameState, _ctx: GameEngineContext): void {}
}
