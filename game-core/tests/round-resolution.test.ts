import { describe, expect, it } from 'vitest';
import { CardRegistry } from '../src/cards/CardRegistry';
import { GameEngine } from '../src/engine/GameEngine';
import { createInitialState } from '../src/engine/createInitialState';
import {
  CardDefinition,
  CardInstance,
  PlayerRoundDraft,
} from '../src/types';

const cards: CardDefinition[] = [
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
    id: 'fireball',
    name: 'Fireball',
    type: 'spell',
    manaCost: 1,
    speed: 3,
    targetType: 'enemyCharacter',
    effects: [{ type: 'DamageEffect', value: 2, attackType: 'spell' }],
  },
  {
    id: 'lava-flow',
    name: 'Lava Flow',
    type: 'spell',
    manaCost: 1,
    speed: 5,
    targetType: 'enemyCharacter',
    effects: [{ type: 'DamageEffect', value: 5, attackType: 'spell', ignoreShield: 2 }],
  },
];

const buildDeck = (ownerId: string, definitions: string[]): CardInstance[] =>
  definitions.map((definitionId, index) => ({
    instanceId: `card_${ownerId}_${index + 1}`,
    ownerId,
    definitionId,
    location: 'deck',
  }));

const buildEngine = () => {
  const registry = new CardRegistry(cards);
  const state = createInitialState(123, [
    {
      playerId: 'player_1',
      characterId: 'char_1',
      deck: buildDeck('player_1', ['barrier']),
    },
    {
      playerId: 'player_2',
      characterId: 'char_2',
      deck: buildDeck('player_2', ['fireball']),
    },
  ]);

  state.players.player_1.mana = 5;
  state.players.player_2.mana = 5;
  state.players.player_1.actionPoints = 3;
  state.players.player_2.actionPoints = 3;

  return new GameEngine(state, registry);
};

describe('game-core round resolution pipeline', () => {
  it('stores draft, exposes public lock state, and waits for both players before resolving', () => {
    const engine = buildEngine();

    const draftA: PlayerRoundDraft = {
      playerId: 'player_1',
      roundNumber: 1,
      locked: false,
      intents: [
        {
          intentId: 'barrier_1',
          roundNumber: 1,
          playerId: 'player_1',
          actorId: 'char_1',
          queueIndex: 0,
          kind: 'CastSpell',
          cardInstanceId: 'card_player_1_1',
          target: {
            targetId: 'char_1',
            targetType: 'self',
          },
        },
      ],
    };

    expect(engine.submitRoundDraft('player_1', 1, draftA.intents)).toEqual({ ok: true });
    expect(engine.getRoundDraft('player_1')?.intents).toHaveLength(1);
    expect(engine.getState().round.players.player_1.draftCount).toBe(1);
    expect(engine.getState().round.players.player_1.locked).toBe(false);

    expect(engine.lockRoundDraft('player_1', 1)).toEqual({ ok: true });
    expect(engine.getState().round.players.player_1.locked).toBe(true);
    expect(engine.getState().round.status).toBe('locked_waiting');
    expect(engine.resolveRoundIfReady()).toBeNull();
  });

  it('resolves both locked drafts by layer order and opens next round', () => {
    const engine = buildEngine();

    expect(
      engine.submitRoundDraft('player_1', 1, [
        {
          intentId: 'barrier_1',
          roundNumber: 1,
          playerId: 'player_1',
          actorId: 'char_1',
          queueIndex: 0,
          kind: 'CastSpell',
          cardInstanceId: 'card_player_1_1',
          target: {
            targetId: 'char_1',
            targetType: 'self',
          },
        },
      ]),
    ).toEqual({ ok: true });
    expect(
      engine.submitRoundDraft('player_2', 1, [
        {
          intentId: 'fireball_1',
          roundNumber: 1,
          playerId: 'player_2',
          actorId: 'char_2',
          queueIndex: 0,
          kind: 'CastSpell',
          cardInstanceId: 'card_player_2_1',
          target: {
            targetId: 'char_1',
            targetType: 'enemyCharacter',
          },
        },
      ]),
    ).toEqual({ ok: true });

    expect(engine.lockRoundDraft('player_1', 1)).toEqual({ ok: true });
    expect(engine.lockRoundDraft('player_2', 1)).toEqual({ ok: true });

    const result = engine.resolveRoundIfReady();

    expect(result).not.toBeNull();
    if (!result) {
      return;
    }

    expect(result.roundNumber).toBe(1);
    expect(result.orderedActions.map((entry) => entry.intentId)).toEqual([
      'barrier_1',
      'fireball_1',
    ]);
    expect(result.orderedActions.map((entry) => entry.status)).toEqual([
      'resolved',
      'resolved',
    ]);
    expect(result.orderedActions.map((entry) => entry.reasonCode)).toEqual([
      'resolved',
      'resolved',
    ]);

    const state = engine.getState();
    expect(state.characters.char_1.hp).toBe(20);
    expect(state.characters.char_1.shield?.energy).toBe(3);
    expect(state.round.number).toBe(2);
    expect(state.round.status).toBe('draft');
    expect(state.round.initiativePlayerId).toBe('player_2');
    expect(state.round.lastResolution?.roundNumber).toBe(1);
    expect(state.round.players.player_1.locked).toBe(false);
    expect(state.round.players.player_2.locked).toBe(false);
    expect(state.players.player_1.actionPoints).toBe(3);
    expect(state.players.player_2.actionPoints).toBe(3);
  });

  it('moves resolved cards out of hand into their post-round zones', () => {
    const registry = new CardRegistry([
      {
        id: 'wolf',
        name: 'Wolf',
        type: 'creature',
        manaCost: 1,
        speed: 2,
        targetType: 'self',
        effects: [{ type: 'SummonEffect', creatureDefinitionId: 'wolf' }],
      },
      {
        id: 'spark',
        name: 'Spark',
        type: 'spell',
        manaCost: 1,
        speed: 3,
        targetType: 'enemyCharacter',
        effects: [{ type: 'DamageEffect', value: 2, attackType: 'spell' }],
      },
    ]);
    const state = createInitialState(123, [
      {
        playerId: 'player_1',
        characterId: 'char_1',
        deck: buildDeck('player_1', ['wolf']),
      },
      {
        playerId: 'player_2',
        characterId: 'char_2',
        deck: buildDeck('player_2', ['spark']),
      },
    ]);

    state.players.player_1.mana = 5;
    state.players.player_2.mana = 5;
    state.players.player_1.actionPoints = 3;
    state.players.player_2.actionPoints = 3;

    const engine = new GameEngine(state, registry);

    expect(
      engine.submitRoundDraft('player_1', 1, [
        {
          intentId: 'wolf_1',
          roundNumber: 1,
          playerId: 'player_1',
          actorId: 'char_1',
          queueIndex: 0,
          kind: 'Summon',
          cardInstanceId: 'card_player_1_1',
        },
      ]),
    ).toEqual({ ok: true });
    expect(
      engine.submitRoundDraft('player_2', 1, [
        {
          intentId: 'spark_1',
          roundNumber: 1,
          playerId: 'player_2',
          actorId: 'char_2',
          queueIndex: 0,
          kind: 'CastSpell',
          cardInstanceId: 'card_player_2_1',
          target: {
            targetId: 'char_1',
            targetType: 'enemyCharacter',
          },
        },
      ]),
    ).toEqual({ ok: true });

    expect(engine.lockRoundDraft('player_1', 1)).toEqual({ ok: true });
    expect(engine.lockRoundDraft('player_2', 1)).toEqual({ ok: true });
    expect(engine.resolveRoundIfReady()).not.toBeNull();

    const resolvedState = engine.getState();
    expect(resolvedState.hands.player_1).toEqual([]);
    expect(resolvedState.hands.player_2).toEqual([]);
    expect(resolvedState.cardInstances.card_player_1_1.location).toBe('board');
    expect(resolvedState.cardInstances.card_player_2_1.location).toBe('discard');
    expect(resolvedState.discardPiles.player_2).toEqual(['card_player_2_1']);
    expect(
      Object.values(resolvedState.creatures).some(
        (creature) => creature.sourceCardInstanceId === 'card_player_1_1',
      ),
    ).toBe(true);
  });

  it('refreshes mana, action points, and draws one card for each player when next round opens', () => {
    const engine = buildEngine();
    const state = engine.getState();

    state.players.player_1.mana = 2;
    state.players.player_2.mana = 9;
    state.players.player_1.actionPoints = 1;
    state.players.player_2.actionPoints = 1;

    state.decks.player_1.cards.push('draw_player_1');
    state.cardInstances.draw_player_1 = {
      instanceId: 'draw_player_1',
      ownerId: 'player_1',
      definitionId: 'barrier',
      location: 'deck',
    };

    state.decks.player_2.cards.push('draw_player_2');
    state.cardInstances.draw_player_2 = {
      instanceId: 'draw_player_2',
      ownerId: 'player_2',
      definitionId: 'fireball',
      location: 'deck',
    };

    expect(
      engine.submitRoundDraft('player_1', 1, [
        {
          intentId: 'barrier_1',
          roundNumber: 1,
          playerId: 'player_1',
          actorId: 'char_1',
          queueIndex: 0,
          kind: 'CastSpell',
          cardInstanceId: 'card_player_1_1',
          target: {
            targetId: 'char_1',
            targetType: 'self',
          },
        },
      ]),
    ).toEqual({ ok: true });
    expect(
      engine.submitRoundDraft('player_2', 1, [
        {
          intentId: 'fireball_1',
          roundNumber: 1,
          playerId: 'player_2',
          actorId: 'char_2',
          queueIndex: 0,
          kind: 'CastSpell',
          cardInstanceId: 'card_player_2_1',
          target: {
            targetId: 'char_1',
            targetType: 'enemyCharacter',
          },
        },
      ]),
    ).toEqual({ ok: true });

    expect(engine.lockRoundDraft('player_1', 1)).toEqual({ ok: true });
    expect(engine.lockRoundDraft('player_2', 1)).toEqual({ ok: true });
    expect(engine.resolveRoundIfReady()).not.toBeNull();

    expect(state.round.number).toBe(2);
    expect(state.players.player_1.actionPoints).toBe(3);
    expect(state.players.player_2.actionPoints).toBe(3);
    expect(state.players.player_1.mana).toBe(2);
    expect(state.players.player_2.mana).toBe(9);
    expect(state.hands.player_1).toContain('draw_player_1');
    expect(state.hands.player_2).toContain('draw_player_2');
    expect(state.cardInstances.draw_player_1.location).toBe('hand');
    expect(state.cardInstances.draw_player_2.location).toBe('hand');
    expect(state.decks.player_1.cards).not.toContain('draw_player_1');
    expect(state.decks.player_2.cards).not.toContain('draw_player_2');
  });

  it('lets damage partially bypass shield when effect ignores shield points', () => {
    const registry = new CardRegistry(cards);
    const state = createInitialState(123, [
      {
        playerId: 'player_1',
        characterId: 'char_1',
        deck: buildDeck('player_1', ['barrier']),
      },
      {
        playerId: 'player_2',
        characterId: 'char_2',
        deck: buildDeck('player_2', ['lava-flow']),
      },
    ]);

    state.players.player_1.mana = 5;
    state.players.player_2.mana = 5;
    state.players.player_1.actionPoints = 3;
    state.players.player_2.actionPoints = 3;

    const engine = new GameEngine(state, registry);

    expect(
      engine.submitRoundDraft('player_1', 1, [
        {
          intentId: 'barrier_1',
          roundNumber: 1,
          playerId: 'player_1',
          actorId: 'char_1',
          queueIndex: 0,
          kind: 'CastSpell',
          cardInstanceId: 'card_player_1_1',
          target: {
            targetId: 'char_1',
            targetType: 'self',
          },
        },
      ]),
    ).toEqual({ ok: true });

    expect(
      engine.submitRoundDraft('player_2', 1, [
        {
          intentId: 'lava_1',
          roundNumber: 1,
          playerId: 'player_2',
          actorId: 'char_2',
          queueIndex: 0,
          kind: 'CastSpell',
          cardInstanceId: 'card_player_2_1',
          target: {
            targetId: 'char_1',
            targetType: 'enemyCharacter',
          },
        },
      ]),
    ).toEqual({ ok: true });

    expect(engine.lockRoundDraft('player_1', 1)).toEqual({ ok: true });
    expect(engine.lockRoundDraft('player_2', 1)).toEqual({ ok: true });
    expect(engine.resolveRoundIfReady()).not.toBeNull();

    expect(state.characters.char_1.hp).toBe(16);
    expect(state.characters.char_1.shield).toBeUndefined();
    expect(state.characters.char_1.concentration).toBe(0);
  });
});
