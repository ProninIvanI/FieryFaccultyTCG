import { describe, expect, it } from 'vitest';
import { CardRegistry } from '../src/cards/CardRegistry';
import {
  createInitialCardRoundIntent,
  createInitialCreatureRoundIntent,
  getInitialAttackTargetForCreature,
  getInitialTargetForType,
} from '../src/rounds/createInitialRoundIntent';
import { createInitialState } from '../src/engine/createInitialState';
import { CardDefinition, CardInstance } from '../src/types';

const cards: CardDefinition[] = [
  {
    id: 'fireball',
    name: 'Fireball',
    type: 'spell',
    manaCost: 1,
    speed: 3,
    targetType: 'enemyCharacter',
    effects: [{ type: 'DamageEffect', value: 2, attackType: 'spell' }],
  },
  {
    id: 'flame_flash',
    name: 'Flame Flash',
    type: 'spell',
    manaCost: 1,
    speed: 5,
    targetType: 'enemyAny',
    effects: [{ type: 'DamageEffect', value: 2, attackType: 'spell', ignoreEvade: true }],
  },
  {
    id: 'meditation',
    name: 'Meditation',
    type: 'artifact',
    manaCost: 1,
    speed: 2,
    targetType: 'self',
    effects: [{ type: 'HealEffect', value: 2 }],
  },
  {
    id: 'sprite',
    name: 'Sprite',
    type: 'creature',
    manaCost: 1,
    speed: 2,
    targetType: 'self',
    effects: [],
  },
];

const buildDeck = (cardsInDeck: Array<{ instanceId: string; definitionId: string; ownerId: string }>): CardInstance[] =>
  cardsInDeck.map((card) => ({
    instanceId: card.instanceId,
    ownerId: card.ownerId,
    definitionId: card.definitionId,
    location: 'deck',
  }));

describe('createInitialCardRoundIntent', () => {
  it('builds a spell intent with core-derived default enemy target', () => {
    const registry = new CardRegistry(cards);
    const state = createInitialState(123, [
      {
        playerId: 'player_1',
        characterId: 'char_1',
        deck: buildDeck([{ instanceId: 'spell_1', definitionId: 'fireball', ownerId: 'player_1' }]),
      },
      {
        playerId: 'player_2',
        characterId: 'char_2',
        deck: buildDeck([]),
      },
    ]);

    state.cardInstances.spell_1.location = 'hand';

    const intent = createInitialCardRoundIntent({
      state,
      cards: registry,
      intentId: 'intent_1',
      roundNumber: 1,
      queueIndex: 0,
      playerId: 'player_1',
      actorId: 'char_1',
      cardInstanceId: 'spell_1',
    });

    expect(intent).toMatchObject({
      kind: 'CastSpell',
      target: {
        targetType: 'enemyCharacter',
        targetId: 'char_2',
      },
    });
  });

  it('builds an enemyAny spell intent and keeps the enemy mage as default target', () => {
    const registry = new CardRegistry(cards);
    const state = createInitialState(123, [
      {
        playerId: 'player_1',
        characterId: 'char_1',
        deck: buildDeck([{ instanceId: 'spell_1', definitionId: 'flame_flash', ownerId: 'player_1' }]),
      },
      {
        playerId: 'player_2',
        characterId: 'char_2',
        deck: buildDeck([]),
      },
    ]);

    state.cardInstances.spell_1.location = 'hand';
    state.creatures.enemy_creature_1 = {
      creatureId: 'enemy_creature_1',
      ownerId: 'player_2',
      hp: 3,
      maxHp: 3,
      attack: 2,
      speed: 5,
      summonedAtRound: 0,
    };

    const intent = createInitialCardRoundIntent({
      state,
      cards: registry,
      intentId: 'intent_enemy_any',
      roundNumber: 1,
      queueIndex: 0,
      playerId: 'player_1',
      actorId: 'char_1',
      cardInstanceId: 'spell_1',
    });

    expect(intent).toMatchObject({
      kind: 'CastSpell',
      target: {
        targetType: 'enemyAny',
        targetId: 'char_2',
      },
    });

    expect(getInitialTargetForType(state, 'char_1', 'enemyAny')).toEqual({
      targetType: 'enemyAny',
      targetId: 'char_2',
    });
  });

  it('builds a self-targeted artifact intent with player character as default target', () => {
    const registry = new CardRegistry(cards);
    const state = createInitialState(123, [
      {
        playerId: 'player_1',
        characterId: 'char_1',
        deck: buildDeck([{ instanceId: 'art_1', definitionId: 'meditation', ownerId: 'player_1' }]),
      },
      {
        playerId: 'player_2',
        characterId: 'char_2',
        deck: buildDeck([]),
      },
    ]);

    state.cardInstances.art_1.location = 'hand';

    const intent = createInitialCardRoundIntent({
      state,
      cards: registry,
      intentId: 'intent_2',
      roundNumber: 1,
      queueIndex: 0,
      playerId: 'player_1',
      actorId: 'char_1',
      cardInstanceId: 'art_1',
    });

    expect(intent).toMatchObject({
      kind: 'PlayCard',
      target: {
        targetType: 'self',
        targetId: 'char_1',
      },
    });
  });

  it('returns summon intent for creature card without target', () => {
    const registry = new CardRegistry(cards);
    const state = createInitialState(123, [
      {
        playerId: 'player_1',
        characterId: 'char_1',
        deck: buildDeck([{ instanceId: 'summon_1', definitionId: 'sprite', ownerId: 'player_1' }]),
      },
      {
        playerId: 'player_2',
        characterId: 'char_2',
        deck: buildDeck([]),
      },
    ]);

    state.cardInstances.summon_1.location = 'hand';

    const intent = createInitialCardRoundIntent({
      state,
      cards: registry,
      intentId: 'intent_3',
      roundNumber: 1,
      queueIndex: 0,
      playerId: 'player_1',
      actorId: 'char_1',
      cardInstanceId: 'summon_1',
    });

    expect(intent).toMatchObject({
      kind: 'Summon',
      cardInstanceId: 'summon_1',
    });
  });

  it('returns target type without targetId when no valid target exists yet', () => {
    const state = createInitialState(123, [
      {
        playerId: 'player_1',
        characterId: 'char_1',
        deck: buildDeck([]),
      },
      {
        playerId: 'player_2',
        characterId: 'char_2',
        deck: buildDeck([]),
      },
    ]);

    const target = getInitialTargetForType(state, 'char_1', 'creature');

    expect(target).toEqual({
      targetType: 'creature',
    });
  });
});

describe('createInitialCreatureRoundIntent', () => {
  it('builds an attack intent with core-derived default enemy character target', () => {
    const state = createInitialState(123, [
      {
        playerId: 'player_1',
        characterId: 'char_1',
        deck: buildDeck([]),
      },
      {
        playerId: 'player_2',
        characterId: 'char_2',
        deck: buildDeck([]),
      },
    ]);

    state.creatures.creature_1 = {
      creatureId: 'creature_1',
      ownerId: 'player_1',
      hp: 3,
      maxHp: 3,
      attack: 2,
      speed: 2,
      summonedAtRound: 0,
    };

    const intent = createInitialCreatureRoundIntent({
      state,
      intentId: 'intent_attack_1',
      roundNumber: 1,
      queueIndex: 0,
      playerId: 'player_1',
      creatureId: 'creature_1',
      actionKind: 'Attack',
    });

    expect(intent).toMatchObject({
      kind: 'Attack',
      sourceCreatureId: 'creature_1',
      target: {
        targetType: 'enemyCharacter',
        targetId: 'char_2',
      },
    });
  });

  it('keeps preferred enemy creature target when it is valid', () => {
    const state = createInitialState(123, [
      {
        playerId: 'player_1',
        characterId: 'char_1',
        deck: buildDeck([]),
      },
      {
        playerId: 'player_2',
        characterId: 'char_2',
        deck: buildDeck([]),
      },
    ]);

    state.creatures.creature_1 = {
      creatureId: 'creature_1',
      ownerId: 'player_1',
      hp: 3,
      maxHp: 3,
      attack: 2,
      speed: 2,
      summonedAtRound: 0,
    };
    state.creatures.enemy_creature_1 = {
      creatureId: 'enemy_creature_1',
      ownerId: 'player_2',
      hp: 2,
      maxHp: 2,
      attack: 1,
      speed: 1,
      summonedAtRound: 0,
    };

    const target = getInitialAttackTargetForCreature(state, 'creature_1', 'enemy_creature_1');

    expect(target).toEqual({
      targetType: 'creature',
      targetId: 'enemy_creature_1',
    });
  });

  it('returns null for attack when creature has summoning sickness this round', () => {
    const state = createInitialState(123, [
      {
        playerId: 'player_1',
        characterId: 'char_1',
        deck: buildDeck([]),
      },
      {
        playerId: 'player_2',
        characterId: 'char_2',
        deck: buildDeck([]),
      },
    ]);

    state.creatures.creature_1 = {
      creatureId: 'creature_1',
      ownerId: 'player_1',
      hp: 3,
      maxHp: 3,
      attack: 2,
      speed: 2,
      summonedAtRound: 1,
    };

    const intent = createInitialCreatureRoundIntent({
      state,
      intentId: 'intent_attack_2',
      roundNumber: 1,
      queueIndex: 0,
      playerId: 'player_1',
      creatureId: 'creature_1',
      actionKind: 'Attack',
    });

    expect(intent).toBeNull();
  });

  it('builds evade intent for owned creature without target', () => {
    const state = createInitialState(123, [
      {
        playerId: 'player_1',
        characterId: 'char_1',
        deck: buildDeck([]),
      },
      {
        playerId: 'player_2',
        characterId: 'char_2',
        deck: buildDeck([]),
      },
    ]);

    state.creatures.creature_1 = {
      creatureId: 'creature_1',
      ownerId: 'player_1',
      hp: 3,
      maxHp: 3,
      attack: 2,
      speed: 2,
      summonedAtRound: 0,
    };

    const intent = createInitialCreatureRoundIntent({
      state,
      intentId: 'intent_evade_1',
      roundNumber: 1,
      queueIndex: 0,
      playerId: 'player_1',
      creatureId: 'creature_1',
      actionKind: 'Evade',
    });

    expect(intent).toMatchObject({
      kind: 'Evade',
      actorId: 'creature_1',
      playerId: 'player_1',
    });
  });
});
