import {
  CardInstance,
  GameState,
  PlayerId,
  CharacterId,
} from '../types';

export interface InitialPlayerConfig {
  playerId: PlayerId;
  characterId: CharacterId;
  deck: CardInstance[];
}

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
  });

  return state;
};
