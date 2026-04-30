import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/engine/createInitialState';
import { CardInstance } from '../src/types';

const buildDeck = (ownerId: string, size: number): CardInstance[] =>
  Array.from({ length: size }, (_, index) => ({
    instanceId: `card_${ownerId}_${index + 1}`,
    ownerId,
    definitionId: String(index + 1),
    location: 'deck',
  }));

describe('createInitialState opening hand', () => {
  it('deals up to three cards into each player hand on match start', () => {
    const state = createInitialState(123, [
      { playerId: 'player_1', characterId: 'char_1', deck: buildDeck('player_1', 5) },
      { playerId: 'player_2', characterId: 'char_2', deck: buildDeck('player_2', 2) },
    ]);

    expect(state.hands.player_1).toEqual(['card_player_1_1', 'card_player_1_5', 'card_player_1_4']);
    expect(state.decks.player_1.cards).toEqual(['card_player_1_2', 'card_player_1_3']);
    expect(state.hands.player_2).toEqual(['card_player_2_1', 'card_player_2_2']);
    expect(state.decks.player_2.cards).toEqual([]);

    expect(state.cardInstances.card_player_1_1.location).toBe('hand');
    expect(state.cardInstances.card_player_1_4.location).toBe('hand');
    expect(state.cardInstances.card_player_1_2.location).toBe('deck');
    expect(state.cardInstances.card_player_2_1.location).toBe('hand');
    expect(state.players.player_1.mana).toBe(10);
    expect(state.players.player_2.mana).toBe(10);
    expect(state.players.player_1.actionPoints).toBe(3);
    expect(state.players.player_2.actionPoints).toBe(3);
    expect(state.round.number).toBe(1);
    expect(state.round.status).toBe('draft');
    expect(state.round.initiativePlayerId).toBe('player_1');
    expect(state.round.players.player_1.locked).toBe(false);
    expect(state.round.players.player_2.locked).toBe(false);
  });

  it('shuffles opening hands deterministically from the match seed', () => {
    const firstState = createInitialState(123, [
      { playerId: 'player_1', characterId: 'char_1', deck: buildDeck('player_1', 6) },
      { playerId: 'player_2', characterId: 'char_2', deck: buildDeck('player_2', 6) },
    ]);
    const repeatedState = createInitialState(123, [
      { playerId: 'player_1', characterId: 'char_1', deck: buildDeck('player_1', 6) },
      { playerId: 'player_2', characterId: 'char_2', deck: buildDeck('player_2', 6) },
    ]);
    const otherSeedState = createInitialState(789, [
      { playerId: 'player_1', characterId: 'char_1', deck: buildDeck('player_1', 6) },
      { playerId: 'player_2', characterId: 'char_2', deck: buildDeck('player_2', 6) },
    ]);

    expect(firstState.hands.player_1).toEqual(repeatedState.hands.player_1);
    expect(firstState.hands.player_2).toEqual(repeatedState.hands.player_2);
    expect(firstState.hands.player_1).not.toEqual(['card_player_1_1', 'card_player_1_2', 'card_player_1_3']);
    expect(firstState.hands.player_1).not.toEqual(otherSeedState.hands.player_1);
    expect(firstState.rngState).toBe(123);
  });

  it('does not let player order affect a player deck shuffle', () => {
    const firstOrderState = createInitialState(123, [
      { playerId: 'player_1', characterId: 'char_1', deck: buildDeck('player_1', 6) },
      { playerId: 'player_2', characterId: 'char_2', deck: buildDeck('player_2', 6) },
    ]);
    const reversedOrderState = createInitialState(123, [
      { playerId: 'player_2', characterId: 'char_2', deck: buildDeck('player_2', 6) },
      { playerId: 'player_1', characterId: 'char_1', deck: buildDeck('player_1', 6) },
    ]);

    expect(firstOrderState.hands.player_1).toEqual(reversedOrderState.hands.player_1);
    expect(firstOrderState.hands.player_2).toEqual(reversedOrderState.hands.player_2);
  });
});
