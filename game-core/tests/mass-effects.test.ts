import { describe, expect, it } from 'vitest';
import { CardRegistry } from '../src/cards/CardRegistry';
import { GameEngine } from '../src/engine/GameEngine';
import { createInitialState } from '../src/engine/createInitialState';
import { CardDefinition, PlayCardAction, CastSpellAction } from '../src/types';

const definitions: CardDefinition[] = [
  {
    id: 'storm',
    name: 'Storm',
    type: 'spell',
    manaCost: 2,
    speed: 5,
    targetType: 'enemyCharacter',
    resolutionRole: 'offensive_spell',
    effects: [{ type: 'DamageEffect', value: 2, attackType: 'spell', appliesToAllEnemies: true }],
  },
  {
    id: 'whirlwind-art',
    name: 'Whirlwind Art',
    type: 'artifact',
    manaCost: 1,
    speed: 5,
    targetType: 'enemyCharacter',
    resolutionRole: 'artifact',
    effects: [{ type: 'DamageEffect', value: 1, attackType: 'art', appliesToAllCreatures: true }],
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
  state.players.player_2.mana = 10;
  state.players.player_2.actionPoints = 3;

  state.cardInstances.card_spell = {
    instanceId: 'card_spell',
    ownerId: 'player_1',
    definitionId: 'storm',
    location: 'hand',
  };
  state.cardInstances.card_art = {
    instanceId: 'card_art',
    ownerId: 'player_1',
    definitionId: 'whirlwind-art',
    location: 'hand',
  };
  state.hands.player_1 = ['card_spell', 'card_art'];

  state.creatures.friendly_creature = {
    creatureId: 'friendly_creature',
    ownerId: 'player_1',
    hp: 5,
    maxHp: 5,
    attack: 2,
    speed: 3,
  };
  state.creatures.enemy_creature = {
    creatureId: 'enemy_creature',
    ownerId: 'player_2',
    hp: 5,
    maxHp: 5,
    attack: 2,
    speed: 3,
  };

  return new GameEngine(state, registry);
};

describe('game-core mass target effects', () => {
  it('applies appliesToAllEnemies to enemy character and enemy creatures only', () => {
    const engine = buildEngine();

    const action: CastSpellAction = {
      type: 'CastSpell',
      actorId: 'char_1',
      playerId: 'player_1',
      cardInstanceId: 'card_spell',
      targetId: 'char_2',
      targetType: 'enemyCharacter',
    };

    expect(engine.processAction(action)).toEqual({ ok: true });

    const state = engine.getState();
    expect(state.characters.char_2.hp).toBe(18);
    expect(state.creatures.enemy_creature.hp).toBe(3);
    expect(state.characters.char_1.hp).toBe(20);
    expect(state.creatures.friendly_creature.hp).toBe(5);
  });

  it('applies appliesToAllCreatures to every creature on the board', () => {
    const engine = buildEngine();

    const action: PlayCardAction = {
      type: 'PlayCard',
      actorId: 'char_1',
      playerId: 'player_1',
      cardInstanceId: 'card_art',
      targetId: 'char_2',
      targetType: 'enemyCharacter',
    };

    expect(engine.processAction(action)).toEqual({ ok: true });

    const state = engine.getState();
    expect(state.creatures.friendly_creature.hp).toBe(4);
    expect(state.creatures.enemy_creature.hp).toBe(4);
    expect(state.characters.char_1.hp).toBe(20);
    expect(state.characters.char_2.hp).toBe(20);
  });
});
