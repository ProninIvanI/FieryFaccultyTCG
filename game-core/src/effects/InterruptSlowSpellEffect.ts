import { EffectHandler } from './EffectHandler';
import { EffectInstance, GameState } from '../types';
import { GameEngineContext } from '../engine/GameEngineContext';

export class InterruptSlowSpellEffect implements EffectHandler {
  readonly type = 'InterruptSlowSpellEffect' as const;

  onApply(effect: EffectInstance, state: GameState, _ctx: GameEngineContext): void {
    const targetId = effect.targetId;
    if (!targetId) {
      return;
    }

    const character = state.characters[targetId];
    if (!character) {
      return;
    }

    const threshold = Number(effect.data?.value ?? 0);
    character.interruptSpellBelowSpeed = Math.max(
      Number(character.interruptSpellBelowSpeed ?? 0),
      threshold,
    );
    character.interruptSpellCharges = Number(character.interruptSpellCharges ?? 0) + 1;
    character.interruptSpellUntilRound = state.round.number;
  }

  onResolve(_effect: EffectInstance, _state: GameState, _ctx: GameEngineContext): void {}

  onExpire(_effect: EffectInstance, _state: GameState, _ctx: GameEngineContext): void {}
}

