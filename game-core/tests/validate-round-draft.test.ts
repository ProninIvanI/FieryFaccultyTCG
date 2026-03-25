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
      deck: buildDeck('player_1', ['sprite', 'barrier', 'sprite']),
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
          intentId: 'barrier_1',
          roundNumber: 1,
          playerId: 'player_1',
          actorId: 'char_1',
          queueIndex: 1,
          kind: 'CastSpell',
          cardInstanceId: 'card_player_1_2',
          target: {
            targetId: 'char_1',
            targetType: 'self',
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
});
