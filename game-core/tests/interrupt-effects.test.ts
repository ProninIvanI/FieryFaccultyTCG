import { describe, expect, it } from 'vitest';
import { CardRegistry } from '../src/cards/CardRegistry';
import { GameEngine } from '../src/engine/GameEngine';
import { createInitialState } from '../src/engine/createInitialState';
import {
  CardDefinition,
  CardInstance,
} from '../src/types';

const cards: CardDefinition[] = [
  {
    id: 'gust',
    name: 'Gust',
    type: 'spell',
    manaCost: 1,
    speed: 5,
    targetType: 'enemyCharacter',
    resolutionRole: 'control_spell',
    effects: [{ type: 'InterruptSlowSpellEffect', value: 5 }],
  },
  {
    id: 'slow-fireball',
    name: 'Slow Fireball',
    type: 'spell',
    manaCost: 1,
    speed: 3,
    targetType: 'enemyCharacter',
    resolutionRole: 'offensive_spell',
    effects: [{ type: 'DamageEffect', value: 4, attackType: 'spell' }],
  },
  {
    id: 'fast-bolt',
    name: 'Fast Bolt',
    type: 'spell',
    manaCost: 1,
    speed: 5,
    targetType: 'enemyCharacter',
    resolutionRole: 'offensive_spell',
    effects: [{ type: 'DamageEffect', value: 2, attackType: 'spell' }],
  },
];

const buildDeck = (ownerId: string, definitions: string[]): CardInstance[] =>
  definitions.map((definitionId, index) => ({
    instanceId: `card_${ownerId}_${index + 1}`,
    ownerId,
    definitionId,
    location: 'deck',
  }));

describe('game-core interrupt effects', () => {
  it('interrupts a slower enemy spell during round resolution', () => {
    const registry = new CardRegistry(cards);
    const state = createInitialState(123, [
      {
        playerId: 'player_1',
        characterId: 'char_1',
        deck: buildDeck('player_1', ['gust']),
      },
      {
        playerId: 'player_2',
        characterId: 'char_2',
        deck: buildDeck('player_2', ['slow-fireball']),
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
          intentId: 'gust_1',
          roundNumber: 1,
          playerId: 'player_1',
          actorId: 'char_1',
          queueIndex: 0,
          kind: 'CastSpell',
          cardInstanceId: 'card_player_1_1',
          target: {
            targetId: 'char_2',
            targetType: 'enemyCharacter',
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
    expect(result?.orderedActions.map((entry) => entry.reasonCode)).toEqual([
      'resolved',
      'interrupted',
    ]);
    expect(engine.getState().characters.char_1.hp).toBe(20);
  });

  it('does not interrupt a spell with equal speed threshold', () => {
    const registry = new CardRegistry(cards);
    const state = createInitialState(123, [
      {
        playerId: 'player_1',
        characterId: 'char_1',
        deck: buildDeck('player_1', ['gust']),
      },
      {
        playerId: 'player_2',
        characterId: 'char_2',
        deck: buildDeck('player_2', ['fast-bolt']),
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
          intentId: 'gust_1',
          roundNumber: 1,
          playerId: 'player_1',
          actorId: 'char_1',
          queueIndex: 0,
          kind: 'CastSpell',
          cardInstanceId: 'card_player_1_1',
          target: {
            targetId: 'char_2',
            targetType: 'enemyCharacter',
          },
        },
      ]),
    ).toEqual({ ok: true });
    expect(
      engine.submitRoundDraft('player_2', 1, [
        {
          intentId: 'bolt_1',
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
    expect(result?.orderedActions.map((entry) => entry.reasonCode)).toEqual([
      'resolved',
      'resolved',
    ]);
    expect(engine.getState().characters.char_1.hp).toBe(18);
  });
});

