import { describe, expect, it } from 'vitest';
import { CardRegistry } from '../src/cards/CardRegistry';
import { compileRoundActions } from '../src/rounds/compileRoundActions';
import { createInitialState } from '../src/engine/createInitialState';
import {
  CardDefinition,
  CardInstance,
  RoundActionIntent,
} from '../src/types';

const cards: CardDefinition[] = [
  {
    id: 'sprite',
    name: 'Sprite',
    type: 'creature',
    manaCost: 1,
    speed: 2,
    targetType: 'self',
    resolutionRole: 'summon',
    effects: [],
  },
  {
    id: 'barrier',
    name: 'Barrier',
    type: 'spell',
    manaCost: 1,
    speed: 4,
    targetType: 'self',
    resolutionRole: 'defensive_spell',
    effects: [{ type: 'ShieldEffect', value: 3 }],
  },
  {
    id: 'fireball',
    name: 'Fireball',
    type: 'spell',
    manaCost: 1,
    speed: 3,
    targetType: 'enemyCharacter',
    resolutionRole: 'offensive_spell',
    effects: [{ type: 'DamageEffect', value: 2, attackType: 'spell' }],
  },
  {
    id: 'wide-flow',
    name: 'Wide Flow',
    type: 'artifact',
    manaCost: 1,
    speed: 0,
    targetType: 'self',
    resolutionRole: 'modifier',
    artKind: 'support_art',
    effects: [{ type: 'NextSpellSpeedBoostEffect', value: 1 }],
  },
];

const buildDeck = (cardsInDeck: Array<{ instanceId: string; definitionId: string; ownerId: string }>): CardInstance[] =>
  cardsInDeck.map((card) => ({
    instanceId: card.instanceId,
    ownerId: card.ownerId,
    definitionId: card.definitionId,
    location: 'deck',
  }));

describe('compileRoundActions', () => {
  it('classifies intents into layers and derives priority deterministically', () => {
    const registry = new CardRegistry(cards);
    const state = createInitialState(123, [
      {
        playerId: 'player_1',
        characterId: 'char_1',
        deck: buildDeck([
          { instanceId: 'summon_1', definitionId: 'sprite', ownerId: 'player_1' },
          { instanceId: 'spell_1', definitionId: 'barrier', ownerId: 'player_1' },
          { instanceId: 'spell_2', definitionId: 'fireball', ownerId: 'player_1' },
        ]),
      },
      {
        playerId: 'player_2',
        characterId: 'char_2',
        deck: buildDeck([{ instanceId: 'enemy_1', definitionId: 'fireball', ownerId: 'player_2' }]),
      },
    ]);

    state.creatures.creature_1 = {
      creatureId: 'creature_1',
      ownerId: 'player_1',
      hp: 3,
      maxHp: 3,
      attack: 2,
      speed: 5,
    };

    const intents: RoundActionIntent[] = [
      {
        intentId: 'intent_summon',
        roundNumber: 1,
        playerId: 'player_1',
        actorId: 'char_1',
        queueIndex: 0,
        kind: 'Summon',
        cardInstanceId: 'summon_1',
      },
      {
        intentId: 'intent_barrier',
        roundNumber: 1,
        playerId: 'player_1',
        actorId: 'char_1',
        queueIndex: 1,
        kind: 'CastSpell',
        cardInstanceId: 'spell_1',
        target: {
          targetId: 'char_1',
          targetType: 'self',
        },
      },
      {
        intentId: 'intent_fireball',
        roundNumber: 1,
        playerId: 'player_1',
        actorId: 'char_1',
        queueIndex: 2,
        kind: 'CastSpell',
        cardInstanceId: 'spell_2',
        target: {
          targetId: 'char_2',
          targetType: 'enemyCharacter',
        },
      },
      {
        intentId: 'intent_attack',
        roundNumber: 1,
        playerId: 'player_1',
        actorId: 'creature_1',
        queueIndex: 3,
        kind: 'Attack',
        sourceCreatureId: 'creature_1',
        target: {
          targetId: 'char_2',
          targetType: 'enemyCharacter',
        },
      },
    ];

    const compiled = compileRoundActions(intents, state, registry, 'player_1');

    expect(compiled.map((item) => item.layer)).toEqual([
      'summon',
      'defensive_spells',
      'offensive_control_spells',
      'attacks',
    ]);
    expect(compiled.map((item) => item.priority)).toEqual([2, 4, 3, 5]);
  });

  it('applies queued next-spell speed bonuses to the nearest following spell during compilation', () => {
    const registry = new CardRegistry(cards);
    const state = createInitialState(123, [
      {
        playerId: 'player_1',
        characterId: 'char_1',
        deck: buildDeck([
          { instanceId: 'art_1', definitionId: 'wide-flow', ownerId: 'player_1' },
          { instanceId: 'spell_1', definitionId: 'fireball', ownerId: 'player_1' },
          { instanceId: 'spell_2', definitionId: 'fireball', ownerId: 'player_1' },
        ]),
      },
      {
        playerId: 'player_2',
        characterId: 'char_2',
        deck: buildDeck([]),
      },
    ]);

    const intents: RoundActionIntent[] = [
      {
        intentId: 'intent_flow',
        roundNumber: 1,
        playerId: 'player_1',
        actorId: 'char_1',
        queueIndex: 0,
        kind: 'PlayCard',
        cardInstanceId: 'art_1',
        target: {
          targetId: 'char_1',
          targetType: 'self',
        },
      },
      {
        intentId: 'intent_fireball_1',
        roundNumber: 1,
        playerId: 'player_1',
        actorId: 'char_1',
        queueIndex: 1,
        kind: 'CastSpell',
        cardInstanceId: 'spell_1',
        target: {
          targetId: 'char_2',
          targetType: 'enemyCharacter',
        },
      },
      {
        intentId: 'intent_fireball_2',
        roundNumber: 1,
        playerId: 'player_1',
        actorId: 'char_1',
        queueIndex: 2,
        kind: 'CastSpell',
        cardInstanceId: 'spell_2',
        target: {
          targetId: 'char_2',
          targetType: 'enemyCharacter',
        },
      },
    ];

    const compiled = compileRoundActions(intents, state, registry, 'player_1');

    expect(compiled.map((item) => item.priority)).toEqual([0, 4, 3]);
  });
});
