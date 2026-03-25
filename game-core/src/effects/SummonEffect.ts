import { EffectHandler } from './EffectHandler';
import { EffectInstance, GameState } from '../types';
import { GameEngineContext } from '../engine/GameEngineContext';

export class SummonEffect implements EffectHandler {
  readonly type = 'SummonEffect' as const;

  onApply(_effect: EffectInstance, _state: GameState, _ctx: GameEngineContext): void {}

  onResolve(effect: EffectInstance, state: GameState, ctx: GameEngineContext): void {
    const ownerId = effect.ownerId;
    if (!ownerId) {
      return;
    }
    const creatureId = ctx.ids.next('creature');
    const hp = Number(effect.data?.hp ?? 3);
    const attack = Number(effect.data?.attack ?? 1);
    const speed = Number(effect.data?.speed ?? 1);
    state.creatures[creatureId] = {
      creatureId,
      ownerId,
      hp,
      maxHp: hp,
      attack,
      speed,
      summonedAtRound: state.round.number,
    };
    ctx.events.emit('onSummon', { creatureId });
  }

  onExpire(_effect: EffectInstance, _state: GameState, _ctx: GameEngineContext): void {}
}
