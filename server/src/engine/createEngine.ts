import {
  CardInstance,
  GameEngine,
  CardRegistry,
  createInitialState,
  dealOpeningHand,
  STARTING_ACTION_POINTS,
  STARTING_MANA,
  toCardDefinitionFromCatalog,
} from '../../../game-core/src';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { GameEngineLike } from '../types/engine';
import { SessionPlayerLoadout } from '../types/session';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);
const cardCatalogPath = path.resolve(currentDirPath, '..', '..', '..', 'game-core', 'data', 'cards.json');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const loadCardDefinitions = () => {
  const fileContent = readFileSync(cardCatalogPath, 'utf-8').replace(/^\uFEFF/, '');
  const raw = JSON.parse(fileContent) as unknown;
  if (!isRecord(raw) || !Array.isArray(raw.cards)) {
    return [];
  }

  return raw.cards.flatMap((card) => {
    const definition = toCardDefinitionFromCatalog(card);
    return definition ? [definition] : [];
  });
};

const buildDeckInstances = (player: SessionPlayerLoadout): CardInstance[] => {
  let index = 0;

  return player.deck.flatMap((card) =>
    Array.from({ length: card.quantity }, () => {
      index += 1;
      return {
        instanceId: `card_${player.playerId}_${index}`,
        ownerId: player.playerId,
        definitionId: card.cardId,
        location: 'deck' as const,
      };
    }),
  );
};

const syncPlayerLoadoutIntoState = (
  state: ReturnType<GameEngine['getState']>,
  player: SessionPlayerLoadout,
): void => {
  const previousCharacterId = state.players[player.playerId]?.characterId;
  if (previousCharacterId) {
    delete state.characters[previousCharacterId];
  }

  const previousDeckCardIds = state.decks[player.playerId]?.cards ?? [];
  previousDeckCardIds.forEach((instanceId) => {
    delete state.cardInstances[instanceId];
  });

  state.hands[player.playerId] = [];
  state.discardPiles[player.playerId] = [];

  const nextDeck = buildDeckInstances(player);
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
  state.decks[player.playerId] = {
    ownerId: player.playerId,
    cards: nextDeck.map((card) => card.instanceId),
  };
  state.round.players[player.playerId] = {
    playerId: player.playerId,
    locked: false,
    draftCount: 0,
  };
  nextDeck.forEach((card) => {
    state.cardInstances[card.instanceId] = card;
  });
  dealOpeningHand(state, player.playerId);
};

class ConfigurableGameEngine extends GameEngine {
  syncPlayerLoadout(loadout: SessionPlayerLoadout): void {
    const state = this.getState();
    syncPlayerLoadoutIntoState(state, loadout);
  }
}

export const createEngine = (seed: number, players: SessionPlayerLoadout[]): GameEngineLike => {
  const registry = new CardRegistry(loadCardDefinitions());
  const state = createInitialState(
    seed,
    players.map((player) => ({
      playerId: player.playerId,
      characterId: player.characterId,
      deck: buildDeckInstances(player),
    })),
  );

  return new ConfigurableGameEngine(state, registry);
};
