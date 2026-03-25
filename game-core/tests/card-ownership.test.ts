import { describe, expect, it } from 'vitest';
import { CardRegistry } from '../src/cards/CardRegistry';
import { GameEngine } from '../src/engine/GameEngine';
import { createInitialState } from '../src/engine/createInitialState';
import { CardDefinition, CardInstance, CastSpellAction, SummonAction } from '../src/types';

const cards: CardDefinition[] = [
  {
    id: 'fireball',
    name: 'Fireball',
    type: 'spell',
    manaCost: 1,
    speed: 1,
    targetType: 'enemyCharacter',
    effects: [{ type: 'DamageEffect', value: 2, attackType: 'spell' }],
  },
  {
    id: 'sprite',
    name: 'Sprite',
    type: 'creature',
    manaCost: 1,
    speed: 1,
    targetType: 'any',
    effects: [],
  },
];

const buildEngine = (cardA: CardInstance, cardB: CardInstance) => {
  const registry = new CardRegistry(cards);
  const state = createInitialState(123, [
    { playerId: 'player_1', characterId: 'char_1', deck: [cardA] },
    { playerId: 'player_2', characterId: 'char_2', deck: [cardB] },
  ]);

  state.players.player_1.mana = 5;
  state.players.player_2.mana = 5;

  return new GameEngine(state, registry);
};

describe('game-core card ownership and location validation', () => {
  it('rejects casting a spell from opponent card', () => {
    const engine = buildEngine(
      { instanceId: 'card_1', ownerId: 'player_1', definitionId: 'fireball', location: 'hand' },
      { instanceId: 'card_2', ownerId: 'player_2', definitionId: 'fireball', location: 'hand' },
    );

    const action: CastSpellAction = {
      type: 'CastSpell',
      actorId: 'char_1',
      playerId: 'player_1',
      cardInstanceId: 'card_2',
      targetId: 'char_2',
      targetType: 'enemyCharacter',
    };

    const result = engine.processAction(action);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Card does not belong to player');
  });

  it('rejects summoning a card that is not in hand', () => {
    const registry = new CardRegistry(cards);
    const state = createInitialState(123, [
      {
        playerId: 'player_1',
        characterId: 'char_1',
        deck: [
          { instanceId: 'card_1', ownerId: 'player_1', definitionId: 'sprite', location: 'deck' },
          { instanceId: 'card_2', ownerId: 'player_1', definitionId: 'sprite', location: 'deck' },
          { instanceId: 'card_3', ownerId: 'player_1', definitionId: 'sprite', location: 'deck' },
          { instanceId: 'card_4', ownerId: 'player_1', definitionId: 'sprite', location: 'deck' },
        ],
      },
      {
        playerId: 'player_2',
        characterId: 'char_2',
        deck: [{ instanceId: 'enemy_1', ownerId: 'player_2', definitionId: 'sprite', location: 'deck' }],
      },
    ]);

    state.players.player_1.mana = 5;
    state.players.player_2.mana = 5;

    const engine = new GameEngine(state, registry);

    const action: SummonAction = {
      type: 'Summon',
      actorId: 'char_1',
      playerId: 'player_1',
      cardInstanceId: 'card_4',
    };

    const result = engine.processAction(action);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Invalid card location: deck');
  });

  it('rejects summoning when player already controls two creatures', () => {
    const registry = new CardRegistry(cards);
    const state = createInitialState(123, [
      {
        playerId: 'player_1',
        characterId: 'char_1',
        deck: [
          { instanceId: 'card_1', ownerId: 'player_1', definitionId: 'sprite', location: 'deck' },
          { instanceId: 'card_2', ownerId: 'player_1', definitionId: 'sprite', location: 'deck' },
          { instanceId: 'card_3', ownerId: 'player_1', definitionId: 'sprite', location: 'deck' },
        ],
      },
      {
        playerId: 'player_2',
        characterId: 'char_2',
        deck: [{ instanceId: 'enemy_1', ownerId: 'player_2', definitionId: 'sprite', location: 'deck' }],
      },
    ]);

    state.players.player_1.mana = 5;
    state.creatures.creature_1 = {
      creatureId: 'creature_1',
      ownerId: 'player_1',
      hp: 3,
      maxHp: 3,
      attack: 1,
      speed: 1,
    };
    state.creatures.creature_2 = {
      creatureId: 'creature_2',
      ownerId: 'player_1',
      hp: 3,
      maxHp: 3,
      attack: 1,
      speed: 1,
    };

    const engine = new GameEngine(state, registry);

    const action: SummonAction = {
      type: 'Summon',
      actorId: 'char_1',
      playerId: 'player_1',
      cardInstanceId: 'card_1',
    };

    const result = engine.processAction(action);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Creature limit reached (2)');
    expect(state.hands.player_1).toContain('card_1');
    expect(Object.keys(state.creatures)).toHaveLength(2);
  });
});
