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

    expect(state.hands.player_1).toEqual(['card_player_1_1', 'card_player_1_2', 'card_player_1_3']);
    expect(state.decks.player_1.cards).toEqual(['card_player_1_4', 'card_player_1_5']);
    expect(state.hands.player_2).toEqual(['card_player_2_1', 'card_player_2_2']);
    expect(state.decks.player_2.cards).toEqual([]);

    expect(state.cardInstances.card_player_1_1.location).toBe('hand');
    expect(state.cardInstances.card_player_1_4.location).toBe('deck');
    expect(state.cardInstances.card_player_2_1.location).toBe('hand');
  });
});
