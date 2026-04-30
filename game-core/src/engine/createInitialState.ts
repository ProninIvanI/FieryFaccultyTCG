import {
  CardInstance,
  GameState,
  PlayerId,
  CharacterId,
} from '../types';
import { SeededRng } from '../rng/SeededRng';

const STARTING_HAND_SIZE = 3;
export const STARTING_MANA = 10;
export const STARTING_ACTION_POINTS = 3;

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
  drawCards(state, playerId, handSize);
};

export const drawCards = (
  state: GameState,
  playerId: PlayerId,
  count = 1,
): void => {
  const deckState = state.decks[playerId];
  const handState = state.hands[playerId];

  if (!deckState || !handState) {
    return;
  }

  const drawCount = Math.min(count, deckState.cards.length);
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

const hashPlayerDeckSeed = (
  matchSeed: number,
  playerId: PlayerId,
): number => {
  let hash = (2166136261 ^ (matchSeed >>> 0)) >>> 0;

  for (let index = 0; index < playerId.length; index += 1) {
    hash ^= playerId.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  return hash;
};

export const shuffleDeck = (
  state: GameState,
  playerId: PlayerId,
): void => {
  const deckState = state.decks[playerId];
  if (!deckState || deckState.cards.length <= 1) {
    return;
  }

  const rng = new SeededRng(hashPlayerDeckSeed(state.rngSeed, playerId));
  for (let index = deckState.cards.length - 1; index > 0; index -= 1) {
    const swapIndex = rng.nextInt(index + 1);
    [deckState.cards[index], deckState.cards[swapIndex]] = [deckState.cards[swapIndex], deckState.cards[index]];
  }
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
    round: {
      number: 1,
      status: 'draft',
      initiativePlayerId: players[0].playerId,
      players: {},
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
      mana: STARTING_MANA,
      maxMana: 10,
      actionPoints: STARTING_ACTION_POINTS,
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
    state.round.players[player.playerId] = {
      playerId: player.playerId,
      locked: false,
      draftCount: 0,
    };
    player.deck.forEach((card) => {
      state.cardInstances[card.instanceId] = card;
    });

    shuffleDeck(state, player.playerId);
    dealOpeningHand(state, player.playerId);
  });

  return state;
};
