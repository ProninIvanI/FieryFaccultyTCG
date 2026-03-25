import { CardInstanceId, CardLocation, GameState } from '../types';

const removeCardFromAllContainers = (state: GameState, cardInstanceId: CardInstanceId): void => {
  Object.values(state.hands).forEach((hand) => {
    const index = hand.indexOf(cardInstanceId);
    if (index >= 0) {
      hand.splice(index, 1);
    }
  });

  Object.values(state.decks).forEach((deck) => {
    const index = deck.cards.indexOf(cardInstanceId);
    if (index >= 0) {
      deck.cards.splice(index, 1);
    }
  });

  Object.values(state.discardPiles).forEach((discardPile) => {
    const index = discardPile.indexOf(cardInstanceId);
    if (index >= 0) {
      discardPile.splice(index, 1);
    }
  });
};

export const moveCardInstance = (
  state: GameState,
  cardInstanceId: CardInstanceId,
  location: CardLocation,
): void => {
  const instance = state.cardInstances[cardInstanceId];
  if (!instance) {
    return;
  }

  removeCardFromAllContainers(state, cardInstanceId);
  instance.location = location;

  if (location === 'hand') {
    state.hands[instance.ownerId]?.push(cardInstanceId);
    return;
  }

  if (location === 'deck') {
    state.decks[instance.ownerId]?.cards.push(cardInstanceId);
    return;
  }

  if (location === 'discard') {
    state.discardPiles[instance.ownerId]?.push(cardInstanceId);
  }
};
