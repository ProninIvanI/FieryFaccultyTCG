import { describe, expect, it } from 'vitest';
import { CardRegistry } from '../src/cards/CardRegistry';
import { createInitialState } from '../src/engine/createInitialState';
import { validateRoundDraft } from '../src/rounds/validateRoundDraft';
import {
  CardDefinition,
  CardInstance,
  PlayerRoundDraft,
} from '../src/types';

const cards: CardDefinition[] = [
  {
    id: 'sprite',
    name: 'Sprite',
    type: 'creature',
    manaCost: 1,
    speed: 2,
    targetType: 'self',
    effects: [],
  },
  {
    id: 'barrier',
    name: 'Barrier',
    type: 'spell',
    manaCost: 1,
    speed: 4,
    targetType: 'self',
    effects: [{ type: 'ShieldEffect', value: 3 }],
  },
  {
    id: 'resonance',
    name: 'Resonance',
    type: 'artifact',
    manaCost: 1,
    speed: 0,
    targetType: 'self',
    resolutionRole: 'modifier',
    modifierKind: 'resource',
    effects: [{ type: 'NextSpellManaDiscountEffect', value: 1 }],
  },
  {
    id: 'fireball',
    name: 'Fireball',
    type: 'spell',
    manaCost: 3,
    speed: 4,
    targetType: 'enemyCharacter',
    resolutionRole: 'offensive_spell',
    effects: [{ type: 'DamageEffect', value: 2, attackType: 'spell' }],
  },
  {
    id: 'flame_flash',
    name: 'Flame Flash',
    type: 'spell',
    manaCost: 2,
    speed: 5,
    targetType: 'enemyAny',
    resolutionRole: 'offensive_spell',
    effects: [{ type: 'DamageEffect', value: 2, attackType: 'spell', ignoreEvade: true }],
  },
];

const buildDeck = (ownerId: string, definitions: string[]): CardInstance[] =>
  definitions.map((definitionId, index) => ({
    instanceId: `card_${ownerId}_${index + 1}`,
    ownerId,
    definitionId,
    location: 'deck',
  }));

const createDraftState = () => {
  const registry = new CardRegistry(cards);
  const state = createInitialState(123, [
    {
      playerId: 'player_1',
      characterId: 'char_1',
      deck: buildDeck('player_1', ['sprite', 'barrier', 'sprite', 'resonance', 'fireball']),
    },
    {
      playerId: 'player_2',
      characterId: 'char_2',
      deck: buildDeck('player_2', ['barrier']),
    },
  ]);

  state.players.player_1.mana = 3;
  state.players.player_1.actionPoints = 3;
  state.players.player_2.mana = 3;
  state.players.player_2.actionPoints = 3;

  return { state, registry };
};

describe('validateRoundDraft', () => {
  it('accepts valid round draft within mana and action budget', () => {
    const { state, registry } = createDraftState();
    const barrierInDeck = state.decks.player_1.cards.find(
      (instanceId) => state.cardInstances[instanceId]?.definitionId === 'barrier',
    );
    if (barrierInDeck) {
      state.decks.player_1.cards = state.decks.player_1.cards.filter((instanceId) => instanceId !== barrierInDeck);
      state.hands.player_1.push(barrierInDeck);
      state.cardInstances[barrierInDeck].location = 'hand';
    }
    const summonCardId = state.hands.player_1.find(
      (instanceId) => state.cardInstances[instanceId]?.definitionId === 'sprite',
    );
    const barrierCardId = state.hands.player_1.find(
      (instanceId) => state.cardInstances[instanceId]?.definitionId === 'barrier',
    );

    expect(summonCardId).toBeDefined();
    expect(barrierCardId).toBeDefined();

    const draft: PlayerRoundDraft = {
      playerId: 'player_1',
      roundNumber: 1,
      locked: false,
      intents: [
        {
          intentId: 'summon_1',
          roundNumber: 1,
          playerId: 'player_1',
          actorId: 'char_1',
          queueIndex: 0,
          kind: 'Summon',
          cardInstanceId: summonCardId!,
        },
        {
          intentId: 'barrier_1',
          roundNumber: 1,
          playerId: 'player_1',
          actorId: 'char_1',
          queueIndex: 1,
          kind: 'CastSpell',
          cardInstanceId: barrierCardId!,
          target: {
            targetId: 'char_1',
            targetType: 'self',
          },
        },
      ],
    };

    expect(validateRoundDraft(state, registry, draft)).toEqual({ ok: true });
  });

  it('accepts enemyAny spell target against an enemy creature', () => {
    const { state, registry } = createDraftState();
    state.cardInstances.card_player_1_6 = {
      instanceId: 'card_player_1_6',
      ownerId: 'player_1',
      definitionId: 'flame_flash',
      location: 'hand',
    };
    state.hands.player_1.push('card_player_1_6');
    state.creatures.enemy_creature_1 = {
      creatureId: 'enemy_creature_1',
      ownerId: 'player_2',
      hp: 3,
      maxHp: 3,
      attack: 2,
      speed: 5,
      summonedAtRound: 0,
    };

    const draft: PlayerRoundDraft = {
      playerId: 'player_1',
      roundNumber: 1,
      locked: false,
      intents: [
        {
          intentId: 'flame_flash_1',
          roundNumber: 1,
          playerId: 'player_1',
          actorId: 'char_1',
          queueIndex: 0,
          kind: 'CastSpell',
          cardInstanceId: 'card_player_1_6',
          target: {
            targetId: 'enemy_creature_1',
            targetType: 'enemyAny',
          },
        },
      ],
    };

    expect(validateRoundDraft(state, registry, draft)).toEqual({ ok: true });
  });

  it('rejects draft that exceeds creature board limit during planning', () => {
    const { state, registry } = createDraftState();
    state.creatures.creature_1 = {
      creatureId: 'creature_1',
      ownerId: 'player_1',
      hp: 3,
      maxHp: 3,
      attack: 1,
      speed: 1,
    };

    const draft: PlayerRoundDraft = {
      playerId: 'player_1',
      roundNumber: 1,
      locked: false,
      intents: [
        {
          intentId: 'summon_1',
          roundNumber: 1,
          playerId: 'player_1',
          actorId: 'char_1',
          queueIndex: 0,
          kind: 'Summon',
          cardInstanceId: 'card_player_1_1',
        },
        {
          intentId: 'summon_2',
          roundNumber: 1,
          playerId: 'player_1',
          actorId: 'char_1',
          queueIndex: 1,
          kind: 'Summon',
          cardInstanceId: 'card_player_1_3',
        },
      ],
    };

    const result = validateRoundDraft(state, registry, draft);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors.some((error) => error.code === 'creature_limit')).toBe(true);
  });

  it('rejects attack from creature with summoning sickness', () => {
    const { state, registry } = createDraftState();
    state.creatures.creature_1 = {
      creatureId: 'creature_1',
      ownerId: 'player_1',
      hp: 3,
      maxHp: 3,
      attack: 2,
      speed: 2,
      summonedAtRound: 1,
    };

    const draft: PlayerRoundDraft = {
      playerId: 'player_1',
      roundNumber: 1,
      locked: false,
      intents: [
        {
          intentId: 'attack_1',
          roundNumber: 1,
          playerId: 'player_1',
          actorId: 'creature_1',
          queueIndex: 0,
          kind: 'Attack',
          sourceCreatureId: 'creature_1',
          target: {
            targetId: 'char_2',
            targetType: 'enemyCharacter',
          },
        },
      ],
    };

    const result = validateRoundDraft(state, registry, draft);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors.some((error) => error.code === 'summoning_sickness')).toBe(true);
  });

  it('accepts creature attack against an enemy creature', () => {
    const { state, registry } = createDraftState();
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
      hp: 3,
      maxHp: 3,
      attack: 1,
      speed: 2,
      summonedAtRound: 0,
    };

    const draft: PlayerRoundDraft = {
      playerId: 'player_1',
      roundNumber: 1,
      locked: false,
      intents: [
        {
          intentId: 'attack_1',
          roundNumber: 1,
          playerId: 'player_1',
          actorId: 'creature_1',
          queueIndex: 0,
          kind: 'Attack',
          sourceCreatureId: 'creature_1',
          target: {
            targetId: 'enemy_creature_1',
            targetType: 'creature',
          },
        },
      ],
    };

    expect(validateRoundDraft(state, registry, draft)).toEqual({ ok: true });
  });

  it('rejects creature attack against an ally creature', () => {
    const { state, registry } = createDraftState();
    state.creatures.creature_1 = {
      creatureId: 'creature_1',
      ownerId: 'player_1',
      hp: 3,
      maxHp: 3,
      attack: 2,
      speed: 2,
      summonedAtRound: 0,
    };
    state.creatures.ally_creature_1 = {
      creatureId: 'ally_creature_1',
      ownerId: 'player_1',
      hp: 3,
      maxHp: 3,
      attack: 1,
      speed: 2,
      summonedAtRound: 0,
    };

    const draft: PlayerRoundDraft = {
      playerId: 'player_1',
      roundNumber: 1,
      locked: false,
      intents: [
        {
          intentId: 'attack_1',
          roundNumber: 1,
          playerId: 'player_1',
          actorId: 'creature_1',
          queueIndex: 0,
          kind: 'Attack',
          sourceCreatureId: 'creature_1',
          target: {
            targetId: 'ally_creature_1',
            targetType: 'creature',
          },
        },
      ],
    };

    const result = validateRoundDraft(state, registry, draft);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors.some((error) => error.code === 'attack_target')).toBe(true);
  });

  it('counts next-spell mana discount when validating draft budget', () => {
    const { state, registry } = createDraftState();
    state.players.player_1.mana = 3;
    state.cardInstances.card_player_1_4.location = 'hand';
    state.cardInstances.card_player_1_5.location = 'hand';

    const draft: PlayerRoundDraft = {
      playerId: 'player_1',
      roundNumber: 1,
      locked: false,
      intents: [
        {
          intentId: 'resonance_1',
          roundNumber: 1,
          playerId: 'player_1',
          actorId: 'char_1',
          queueIndex: 0,
          kind: 'PlayCard',
          cardInstanceId: 'card_player_1_4',
          target: {
            targetId: 'char_1',
            targetType: 'self',
          },
        },
        {
          intentId: 'fireball_1',
          roundNumber: 1,
          playerId: 'player_1',
          actorId: 'char_1',
          queueIndex: 1,
          kind: 'CastSpell',
          cardInstanceId: 'card_player_1_5',
          target: {
            targetId: 'char_2',
            targetType: 'enemyCharacter',
          },
        },
      ],
    };

    expect(validateRoundDraft(state, registry, draft)).toEqual({ ok: true });
  });
});
