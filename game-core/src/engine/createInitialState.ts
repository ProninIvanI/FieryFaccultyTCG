import {
  CardInstance,
  GameState,
  PlayerId,
  CharacterId,
} from '../types';

const STARTING_HAND_SIZE = 3;

export interface InitialPlayerConfig {
  playerId: PlayerId;
  characterId: CharacterId;
  deck: CardInstance[];
}

export const dealOpeningHand = (
  state: GameState,
  playerId: PlayerId,
  handSize = STARTING_HAND_SIZE,
): void => {
  const deckState = state.decks[playerId];
  const handState = state.hands[playerId];

  if (!deckState || !handState) {
    return;
  }

  const drawCount = Math.min(handSize, deckState.cards.length);
  if (drawCount <= 0) {
    return;
  }

  const drawnCards = deckState.cards.splice(0, drawCount);
  drawnCards.forEach((instanceId) => {
    handState.push(instanceId);
    const instance = state.cardInstances[instanceId];
    if (instance) {
      instance.location = 'hand';
    }
  });
};

export const createInitialState = (
  seed: number,
  players: InitialPlayerConfig[]
): GameState => {
  const state: GameState = {
    players: {},
    characters: {},
    creatures: {},
    hands: {},
    decks: {},
    discardPiles: {},
    cardInstances: {},
    activeEffects: {},
    effectQueue: [],
    actionLog: [],
    log: [],
    turn: {
      number: 1,
      activePlayerId: players[0].playerId,
    },
    phase: {
      current: 'ActionPhase',
    },
    rngSeed: seed,
    rngState: seed,
  };

  players.forEach((player) => {
    state.players[player.playerId] = {
      playerId: player.playerId,
      characterId: player.characterId,
      mana: 0,
      maxMana: 10,
      actionPoints: 2,
    };
    state.characters[player.characterId] = {
      characterId: player.characterId,
      ownerId: player.playerId,
      hp: 20,
      maxHp: 20,
      dexterity: 3,
      concentration: 0,
    };
    state.hands[player.playerId] = [];
    state.discardPiles[player.playerId] = [];
    state.decks[player.playerId] = {
      ownerId: player.playerId,
      cards: player.deck.map((card) => card.instanceId),
    };
    player.deck.forEach((card) => {
      state.cardInstances[card.instanceId] = card;
    });

    dealOpeningHand(state, player.playerId);
  });

  return state;
};
