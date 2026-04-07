import { describe, expect, it } from 'vitest';
import { CardRegistry } from '../src/cards/CardRegistry';
import { GameEngine } from '../src/engine/GameEngine';
import { createInitialState } from '../src/engine/createInitialState';
import { CardDefinition, CastSpellAction, EndTurnAction } from '../src/types';

const definitions: CardDefinition[] = [
  {
    id: 'burning-trail',
    name: 'Burning Trail',
    type: 'spell',
    manaCost: 1,
    speed: 5,
    targetType: 'enemyCharacter',
    resolutionRole: 'offensive_spell',
    effects: [{ type: 'DamageEffect', value: 2, attackType: 'spell', repeatNextTurn: true }],
  },
];

describe('game-core repeat next turn', () => {
  it('repeats effect once on the next turn', () => {
    const registry = new CardRegistry(definitions);
    const state = createInitialState(1, [
      { playerId: 'player_1', characterId: 'char_1', deck: [] },
      { playerId: 'player_2', characterId: 'char_2', deck: [] },
    ]);

    state.players.player_1.mana = 10;
    state.players.player_1.actionPoints = 3;
    state.cardInstances.card_burn = {
      instanceId: 'card_burn',
      ownerId: 'player_1',
      definitionId: 'burning-trail',
      location: 'hand',
    };
    state.hands.player_1 = ['card_burn'];

    const engine = new GameEngine(state, registry);
    const castAction: CastSpellAction = {
      type: 'CastSpell',
      actorId: 'char_1',
      playerId: 'player_1',
      cardInstanceId: 'card_burn',
      targetId: 'char_2',
      targetType: 'enemyCharacter',
    };

    expect(engine.processAction(castAction)).toEqual({ ok: true });
    expect(state.characters.char_2.hp).toBe(18);
    expect(Object.keys(state.activeEffects)).toHaveLength(1);

    const endTurnAction: EndTurnAction = {
      type: 'EndTurn',
      actorId: 'char_1',
      playerId: 'player_1',
    };

    expect(engine.processAction(endTurnAction)).toEqual({ ok: true });
    expect(state.turn.number).toBe(2);
    expect(state.characters.char_2.hp).toBe(16);
    expect(Object.keys(state.activeEffects)).toHaveLength(0);
  });
});

