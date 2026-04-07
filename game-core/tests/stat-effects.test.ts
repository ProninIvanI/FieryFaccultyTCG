import { describe, expect, it } from 'vitest';
import { BuffEffect } from '../src/effects/BuffEffect';
import { DebuffEffect } from '../src/effects/DebuffEffect';
import { createInitialState } from '../src/engine/createInitialState';
import { EffectInstance } from '../src/types';

describe('game-core stat-based effects', () => {
  it('applies and expires agility buffs on characters via dexterity', () => {
    const state = createInitialState(1, [
      { playerId: 'player_1', characterId: 'char_1', deck: [] },
    ]);
    const effect: EffectInstance = {
      effectId: 'effect_1',
      type: 'BuffEffect',
      ownerId: 'player_1',
      sourceId: 'char_1',
      targetId: 'char_1',
      createdAtTurn: 1,
      duration: 1,
      data: {
        value: 2,
        stat: 'agility',
      },
    };

    const handler = new BuffEffect();

    handler.onApply(effect, state, {} as never);
    expect(state.characters.char_1.dexterity).toBe(5);

    handler.onExpire(effect, state, {} as never);
    expect(state.characters.char_1.dexterity).toBe(3);
  });

  it('applies and expires speed debuffs on creatures', () => {
    const state = createInitialState(1, [
      { playerId: 'player_1', characterId: 'char_1', deck: [] },
    ]);
    state.creatures.wolf_1 = {
      creatureId: 'wolf_1',
      ownerId: 'player_1',
      hp: 4,
      maxHp: 4,
      attack: 2,
      speed: 4,
    };
    const effect: EffectInstance = {
      effectId: 'effect_2',
      type: 'DebuffEffect',
      ownerId: 'player_1',
      sourceId: 'char_1',
      targetId: 'wolf_1',
      createdAtTurn: 1,
      duration: 1,
      data: {
        value: 3,
        stat: 'speed',
      },
    };

    const handler = new DebuffEffect();

    handler.onApply(effect, state, {} as never);
    expect(state.creatures.wolf_1.speed).toBe(1);

    handler.onExpire(effect, state, {} as never);
    expect(state.creatures.wolf_1.speed).toBe(4);
  });
});
