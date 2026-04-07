import { describe, expect, it } from 'vitest';
import { CardRegistry } from '../src/cards/CardRegistry';
import { GameEngine } from '../src/engine/GameEngine';
import { createInitialState } from '../src/engine/createInitialState';
import {
  CardDefinition,
  CastSpellAction,
  EndTurnAction,
  EvadeAction,
} from '../src/types';

const definitions: CardDefinition[] = [
  {
    id: 'roots',
    name: 'Roots',
    type: 'spell',
    manaCost: 1,
    speed: 3,
    targetType: 'enemyCharacter',
    resolutionRole: 'control_spell',
    effects: [{ type: 'CannotEvadeEffect' }],
  },
  {
    id: 'vines',
    name: 'Vines',
    type: 'spell',
    manaCost: 1,
    speed: 3,
    targetType: 'enemyCharacter',
    resolutionRole: 'control_spell',
    effects: [{ type: 'SkipActionEffect' }],
  },
  {
    id: 'spark',
    name: 'Spark',
    type: 'spell',
    manaCost: 1,
    speed: 5,
    targetType: 'enemyCharacter',
    resolutionRole: 'offensive_spell',
    effects: [{ type: 'DamageEffect', value: 2, attackType: 'spell' }],
  },
];

const buildEndTurn = (playerId: 'player_1' | 'player_2', actorId: 'char_1' | 'char_2'): EndTurnAction => ({
  type: 'EndTurn',
  playerId,
  actorId,
});

describe('game-core control effects', () => {
  it('prevents evade on the next turn after roots are applied', () => {
    const registry = new CardRegistry(definitions);
    const state = createInitialState(1, [
      { playerId: 'player_1', characterId: 'char_1', deck: [] },
      { playerId: 'player_2', characterId: 'char_2', deck: [] },
    ]);

    state.players.player_1.mana = 10;
    state.players.player_2.mana = 10;
    state.cardInstances.card_roots = {
      instanceId: 'card_roots',
      ownerId: 'player_1',
      definitionId: 'roots',
      location: 'hand',
    };
    state.hands.player_1 = ['card_roots'];

    const engine = new GameEngine(state, registry);

    const rootsAction: CastSpellAction = {
      type: 'CastSpell',
      actorId: 'char_1',
      playerId: 'player_1',
      cardInstanceId: 'card_roots',
      targetId: 'char_2',
      targetType: 'enemyCharacter',
    };
    const evadeAction: EvadeAction = {
      type: 'Evade',
      actorId: 'char_2',
      playerId: 'player_2',
    };

    expect(engine.processAction(rootsAction)).toEqual({ ok: true });
    expect(engine.processAction(buildEndTurn('player_1', 'char_1'))).toEqual({ ok: true });
    expect(engine.processAction(evadeAction)).toEqual({
      ok: false,
      errors: ['Actor cannot evade'],
    });
  });

  it('consumes the next action after vines are applied', () => {
    const registry = new CardRegistry(definitions);
    const state = createInitialState(1, [
      { playerId: 'player_1', characterId: 'char_1', deck: [] },
      { playerId: 'player_2', characterId: 'char_2', deck: [] },
    ]);

    state.players.player_1.mana = 10;
    state.players.player_2.mana = 10;
    state.cardInstances.card_vines = {
      instanceId: 'card_vines',
      ownerId: 'player_1',
      definitionId: 'vines',
      location: 'hand',
    };
    state.cardInstances.card_spark = {
      instanceId: 'card_spark',
      ownerId: 'player_2',
      definitionId: 'spark',
      location: 'hand',
    };
    state.hands.player_1 = ['card_vines'];
    state.hands.player_2 = ['card_spark'];

    const engine = new GameEngine(state, registry);

    const vinesAction: CastSpellAction = {
      type: 'CastSpell',
      actorId: 'char_1',
      playerId: 'player_1',
      cardInstanceId: 'card_vines',
      targetId: 'char_2',
      targetType: 'enemyCharacter',
    };
    const sparkAction: CastSpellAction = {
      type: 'CastSpell',
      actorId: 'char_2',
      playerId: 'player_2',
      cardInstanceId: 'card_spark',
      targetId: 'char_1',
      targetType: 'enemyCharacter',
    };

    expect(engine.processAction(vinesAction)).toEqual({ ok: true });
    expect(engine.processAction(buildEndTurn('player_1', 'char_1'))).toEqual({ ok: true });
    expect(engine.processAction(sparkAction)).toEqual({
      ok: false,
      errors: ['Actor skips this action'],
    });
    expect(state.players.player_2.actionPoints).toBe(2);
    expect(state.characters.char_2.skipNextAction).toBe(false);
  });
});

