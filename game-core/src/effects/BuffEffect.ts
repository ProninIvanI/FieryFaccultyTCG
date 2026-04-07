import { EffectHandler } from './EffectHandler';
import { EffectInstance, GameState } from '../types';
import { GameEngineContext } from '../engine/GameEngineContext';

export class BuffEffect implements EffectHandler {
  readonly type = 'BuffEffect' as const;

  onApply(effect: EffectInstance, state: GameState, _ctx: GameEngineContext): void {
    this.applyDelta(effect, state, 1);
  }

  onResolve(_effect: EffectInstance, _state: GameState, _ctx: GameEngineContext): void {}

  onExpire(effect: EffectInstance, state: GameState, _ctx: GameEngineContext): void {
    this.applyDelta(effect, state, -1);
  }

  private applyDelta(effect: EffectInstance, state: GameState, direction: 1 | -1): void {
    const targetId = effect.targetId;
    if (!targetId) {
      return;
    }
    const stat = typeof effect.data?.stat === 'string' ? effect.data.stat : 'agility';
    const delta = Number(effect.data?.value ?? 0) * direction;
    const character = state.characters[targetId];
    if (character) {
      this.applyToCharacter(character, stat, delta);
      return;
    }
    const creature = state.creatures[targetId];
    if (creature) {
      this.applyToCreature(creature, stat, delta);
    }
  }

  private applyToCharacter(
    character: GameState['characters'][string],
    stat: string,
    delta: number,
  ): void {
    switch (stat) {
      case 'hp': {
        character.maxHp = Math.max(1, character.maxHp + delta);
        character.hp = Math.min(character.maxHp, Math.max(0, character.hp + delta));
        return;
      }
      case 'shield': {
        if (!character.shield) {
          if (delta <= 0) {
            return;
          }
          character.shield = {
            energy: delta,
            concentrationCost: 1,
          };
          character.concentration += 1;
          return;
        }

        character.shield.energy = Math.max(0, character.shield.energy + delta);
        if (character.shield.energy === 0) {
          character.shield = undefined;
          character.concentration = Math.max(0, character.concentration - 1);
        }
        return;
      }
      case 'agility':
      case 'speed':
      default:
        character.dexterity = Math.max(0, character.dexterity + delta);
    }
  }

  private applyToCreature(
    creature: GameState['creatures'][string],
    stat: string,
    delta: number,
  ): void {
    switch (stat) {
      case 'attack':
        creature.attack = Math.max(0, creature.attack + delta);
        return;
      case 'hp':
        creature.maxHp = Math.max(1, creature.maxHp + delta);
        creature.hp = Math.min(creature.maxHp, Math.max(0, creature.hp + delta));
        return;
      case 'agility':
      case 'speed':
      default:
        creature.speed = Math.max(0, creature.speed + delta);
    }
  }
}
