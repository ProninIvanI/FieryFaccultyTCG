import { describe, expect, it } from 'vitest';
import { CardRegistry } from '../src/cards/CardRegistry';
import { GameEngine } from '../src/engine/GameEngine';
import { createInitialState } from '../src/engine/createInitialState';
import { CardDefinition, CastSpellAction } from '../src/types';

const definitions: CardDefinition[] = [
  {
    id: 'slow-bolt',
    name: 'Slow Bolt',
    type: 'spell',
    manaCost: 1,
    speed: 2,
    targetType: 'enemyCharacter',
    resolutionRole: 'offensive_spell',
    effects: [{ type: 'DamageEffect', value: 3, attackType: 'spell' }],
  },
  {
    id: 'sure-bolt',
    name: 'Sure Bolt',
    type: 'spell',
    manaCost: 1,
    speed: 2,
    targetType: 'enemyCharacter',
    resolutionRole: 'offensive_spell',
    effects: [{ type: 'DamageEffect', value: 3, attackType: 'spell', ignoreEvade: true }],
  },
];

const buildEngine = () => {
  const registry = new CardRegistry(definitions);
  const state = createInitialState(1, [
    { playerId: 'player_1', characterId: 'char_1', deck: [] },
    { playerId: 'player_2', characterId: 'char_2', deck: [] },
  ]);

  state.players.player_1.mana = 10;
  state.players.player_1.actionPoints = 3;
  state.characters.char_2.dexterity = 4;

  state.cardInstances.card_slow = {
    instanceId: 'card_slow',
    ownerId: 'player_1',
    definitionId: 'slow-bolt',
    location: 'hand',
  };
  state.cardInstances.card_sure = {
    instanceId: 'card_sure',
    ownerId: 'player_1',
    definitionId: 'sure-bolt',
    location: 'hand',
  };
  state.hands.player_1 = ['card_slow', 'card_sure'];

  return new GameEngine(state, registry);
};

describe('game-core ignore evade', () => {
  it('lets regular spell damage miss agile targets', () => {
    const engine = buildEngine();
    const action: CastSpellAction = {
      type: 'CastSpell',
      actorId: 'char_1',
      playerId: 'player_1',
      cardInstanceId: 'card_slow',
      targetId: 'char_2',
      targetType: 'enemyCharacter',
    };

    expect(engine.processAction(action)).toEqual({ ok: true });
    expect(engine.getState().characters.char_2.hp).toBe(20);
  });

  it('lets ignoreEvade spell damage hit agile targets', () => {
    const engine = buildEngine();
    const action: CastSpellAction = {
      type: 'CastSpell',
      actorId: 'char_1',
      playerId: 'player_1',
      cardInstanceId: 'card_sure',
      targetId: 'char_2',
      targetType: 'enemyCharacter',
    };

    expect(engine.processAction(action)).toEqual({ ok: true });
    expect(engine.getState().characters.char_2.hp).toBe(17);
  });
});

