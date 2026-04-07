import { EffectHandler } from './EffectHandler';
import { EffectInstance, GameState } from '../types';
import { GameEngineContext } from '../engine/GameEngineContext';

export class DamageEffect implements EffectHandler {
  readonly type = 'DamageEffect' as const;

  onApply(_effect: EffectInstance, _state: GameState, _ctx: GameEngineContext): void {}

  onResolve(effect: EffectInstance, state: GameState, ctx: GameEngineContext): void {
    const targetId = effect.targetId;
    if (!targetId) {
      return;
    }
    const value = Number(effect.data?.value ?? 0);
    const ignoreShield = Number(effect.data?.ignoreShield ?? 0);
    const character = state.characters[targetId];
    const creature = state.creatures[targetId];
    if (character) {
      const { damage, shieldBroken } = this.applyShield(character.shield, value, ignoreShield);
      if (shieldBroken) {
        character.shield = undefined;
        character.concentration = Math.max(0, character.concentration - 1);
      }
      character.hp = Math.max(0, character.hp - damage);
    } else if (creature) {
      creature.hp = Math.max(0, creature.hp - value);
    }
    ctx.events.emit('onDamage', { targetId, amount: value });
  }

  onExpire(_effect: EffectInstance, _state: GameState, _ctx: GameEngineContext): void {}

  private applyShield(
    shield: GameState['characters'][string]['shield'],
    damage: number,
    ignoreShield: number,
  ): { damage: number; shieldBroken: boolean } {
    if (!shield) {
      return { damage, shieldBroken: false };
    }
    const effectiveShield = Math.max(0, shield.energy - Math.max(0, ignoreShield));
    if (damage <= effectiveShield) {
      return { damage: 0, shieldBroken: false };
    }
    return { damage: damage - effectiveShield, shieldBroken: true };
  }
}
