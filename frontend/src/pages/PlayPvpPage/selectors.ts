import { normalizeCatalog, toCatalogSchool } from '@game-core/cards/catalog';
import type { ResolutionLayer } from '@game-core/types';
import type { GameStateSnapshot } from '@/types';
import rawCardData from '@/data/cardCatalog';
import { getBoardItemSubtitle } from './presentation';
import type {
  BoardItemSummary,
  CreatureSummary,
  HandCardSummary,
  LocalPlayerSummary,
  MatchSummary,
  PlayerBoardSummary,
  RoundSyncSummary,
} from './PlayPvpPage';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const normalizedCardCatalog = normalizeCatalog(rawCardData);
const cardCatalogById = new Map(normalizedCardCatalog.cards.map((card) => [card.id, card] as const));

export const getMatchSummary = (state: GameStateSnapshot | null): MatchSummary | null => {
  if (!state || !isRecord(state.round) || !isRecord(state.players)) {
    return null;
  }

  const roundNumber = typeof state.round.number === 'number' ? state.round.number : 0;
  const roundStatus = typeof state.round.status === 'string' ? state.round.status : 'draft';
  const initiativePlayerId =
    typeof state.round.initiativePlayerId === 'string' ? state.round.initiativePlayerId : '';
  const phase = isRecord(state.phase) && typeof state.phase.current === 'string' ? state.phase.current : 'RoundPhase';
  const playerCount = Object.keys(state.players).length;
  const actionLogCount = Array.isArray(state.actionLog) ? state.actionLog.length : 0;

  return {
    roundNumber,
    roundStatus,
    initiativePlayerId,
    phase,
    playerCount,
    actionLogCount,
  };
};

export const getRoundSyncFromState = (state: GameStateSnapshot | null, playerId: string): RoundSyncSummary | null => {
  if (!state || !isRecord(state.round) || !isRecord(state.round.players) || !playerId) {
    return null;
  }

  const roundNumber = typeof state.round.number === 'number' ? state.round.number : 0;
  const selfRoundPlayer = state.round.players[playerId];
  const opponentRoundPlayer = Object.entries(state.round.players).find(([id]) => id !== playerId)?.[1];

  return {
    roundNumber,
    selfLocked: isRecord(selfRoundPlayer) && typeof selfRoundPlayer.locked === 'boolean' ? selfRoundPlayer.locked : false,
    opponentLocked:
      isRecord(opponentRoundPlayer) && typeof opponentRoundPlayer.locked === 'boolean'
        ? opponentRoundPlayer.locked
        : false,
    selfDraftCount:
      isRecord(selfRoundPlayer) && typeof selfRoundPlayer.draftCount === 'number' ? selfRoundPlayer.draftCount : 0,
    opponentDraftCount:
      isRecord(opponentRoundPlayer) && typeof opponentRoundPlayer.draftCount === 'number'
        ? opponentRoundPlayer.draftCount
        : 0,
  };
};

export const getLocalPlayerSummary = (
  state: GameStateSnapshot | null,
  playerId: string
): LocalPlayerSummary | null => {
  if (!state || !isRecord(state.players)) {
    return null;
  }

  const player = state.players[playerId];
  if (!isRecord(player)) {
    return null;
  }

  return {
    playerId,
    mana: typeof player.mana === 'number' ? player.mana : 0,
    maxMana: typeof player.maxMana === 'number' ? player.maxMana : 0,
    actionPoints: typeof player.actionPoints === 'number' ? player.actionPoints : 0,
    characterId: typeof player.characterId === 'string' ? player.characterId : '',
  };
};

export const getZoneSize = (zones: unknown, playerId: string): number => {
  if (!isRecord(zones)) {
    return 0;
  }

  const zone = zones[playerId];
  return Array.isArray(zone) ? zone.length : 0;
};

export const getDeckSize = (decks: unknown, playerId: string): number => {
  if (!isRecord(decks)) {
    return 0;
  }

  const deck = decks[playerId];
  if (Array.isArray(deck)) {
    return deck.length;
  }

  if (!isRecord(deck)) {
    return 0;
  }

  return Array.isArray(deck.cards) ? deck.cards.length : 0;
};

export const getPlayerBoardSummaries = (state: GameStateSnapshot | null): PlayerBoardSummary[] => {
  if (!state || !isRecord(state.players)) {
    return [];
  }

  const roundPlayers = isRecord(state.round) && isRecord(state.round.players) ? state.round.players : null;

  return Object.keys(state.players).flatMap((playerId) => {
    const baseSummary = getLocalPlayerSummary(state, playerId);
    if (!baseSummary) {
      return [];
    }

    const roundPlayer = roundPlayers?.[playerId];
    const locked = isRecord(roundPlayer) && typeof roundPlayer.locked === 'boolean' ? roundPlayer.locked : false;

    return [
      {
        ...baseSummary,
        deckSize: getDeckSize(state.decks, playerId),
        handSize: getZoneSize(state.hands, playerId),
        discardSize: getZoneSize(state.discardPiles, playerId),
        locked,
      },
    ];
  });
};

export const getLocalHandCards = (state: GameStateSnapshot | null, playerId: string): HandCardSummary[] => {
  const hands = state?.hands;
  const cardInstances = state?.cardInstances;

  if (!state || !isRecord(hands) || !isRecord(cardInstances)) {
    return [];
  }

  const hand = hands[playerId];
  if (!Array.isArray(hand)) {
    return [];
  }

  return hand.flatMap((instanceId) => {
    if (typeof instanceId !== 'string') {
      return [];
    }

    const instance = cardInstances[instanceId];
    if (!isRecord(instance)) {
      return [];
    }

    const cardId =
      typeof instance.definitionId === 'string'
        ? instance.definitionId
        : typeof instance.cardId === 'string'
          ? instance.cardId
          : '';
    return [
      {
        instanceId,
        cardId,
        name: cardCatalogById.get(cardId)?.name ?? `Карта ${cardId || instanceId}`,
        mana: cardCatalogById.get(cardId)?.mana ?? 0,
        cardType: cardCatalogById.get(cardId)?.catalogType ?? 'unknown',
        school: toCatalogSchool(cardCatalogById.get(cardId)?.school),
        effect: cardCatalogById.get(cardId)?.effect,
        hp: cardCatalogById.get(cardId)?.hp,
        attack: cardCatalogById.get(cardId)?.attack,
        speed: cardCatalogById.get(cardId)?.speed || undefined,
      },
    ];
  });
};

export const getCreatureSummaries = (state: GameStateSnapshot | null): CreatureSummary[] => {
  if (state?.boardView?.players && typeof state.boardView.players === 'object') {
    const creaturesFromBoardView = Object.values(state.boardView.players).flatMap((playerBoard) => {
      if (!isRecord(playerBoard) || !Array.isArray(playerBoard.boardItems)) {
        return [];
      }

      return playerBoard.boardItems.flatMap((item) => {
        if (
          !isRecord(item) ||
          item.subtype !== 'creature' ||
          typeof item.runtimeId !== 'string' ||
          typeof item.ownerId !== 'string' ||
          !isRecord(item.state)
        ) {
          return [];
        }

        return [{
          creatureId: item.runtimeId,
          ownerId: item.ownerId,
          hp: typeof item.state.hp === 'number' ? item.state.hp : 0,
          maxHp: typeof item.state.maxHp === 'number' ? item.state.maxHp : 0,
          attack: typeof item.state.attack === 'number' ? item.state.attack : 0,
          speed: typeof item.state.speed === 'number' ? item.state.speed : 0,
          summonedAtRound: typeof item.createdAtRound === 'number' ? item.createdAtRound : undefined,
        }];
      });
    });

    if (creaturesFromBoardView.length > 0) {
      return creaturesFromBoardView;
    }
  }

  if (!state || !isRecord(state.creatures)) {
    return [];
  }

  return Object.values(state.creatures).flatMap((creature) => {
    if (!isRecord(creature) || typeof creature.creatureId !== 'string' || typeof creature.ownerId !== 'string') {
      return [];
    }

    return [{
      creatureId: creature.creatureId,
      ownerId: creature.ownerId,
      hp: typeof creature.hp === 'number' ? creature.hp : 0,
      maxHp: typeof creature.maxHp === 'number' ? creature.maxHp : 0,
      attack: typeof creature.attack === 'number' ? creature.attack : 0,
      speed: typeof creature.speed === 'number' ? creature.speed : 0,
      summonedAtRound: typeof creature.summonedAtRound === 'number' ? creature.summonedAtRound : undefined,
    }];
  });
};

export const getPlayerBoardItemSummaries = (
  state: GameStateSnapshot | null,
  playerId: string,
): BoardItemSummary[] => {
  const boardItems = state?.boardView?.players?.[playerId]?.boardItems;
  if (Array.isArray(boardItems)) {
    return boardItems
      .flatMap((item) => {
      if (
        !isRecord(item) ||
        typeof item.id !== 'string' ||
        typeof item.runtimeId !== 'string' ||
        typeof item.ownerId !== 'string' ||
        (item.subtype !== 'creature' && item.subtype !== 'effect') ||
        (item.lifetimeType !== 'temporary' && item.lifetimeType !== 'persistent')
      ) {
        return [];
      }

      const definitionId = typeof item.definitionId === 'string' ? item.definitionId : '';
      const card = definitionId ? cardCatalogById.get(definitionId) : undefined;
      const stateView = isRecord(item.state) ? item.state : null;
      const placement = isRecord(item.placement) ? item.placement : null;
      const fallbackTitle =
        item.subtype === 'creature'
          ? `Существо ${item.runtimeId}`
          : `Эффект ${definitionId || item.runtimeId}`;

      return [{
        id: item.id,
        runtimeId: item.runtimeId,
        ownerId: item.ownerId,
        subtype: item.subtype,
        school: toCatalogSchool(card?.school),
        lifetimeType: item.lifetimeType,
        placementLayer:
          placement && typeof placement.layer === 'string'
            ? (placement.layer as ResolutionLayer)
            : item.subtype === 'creature'
              ? 'summon'
              : 'other_modifiers',
        placementOrderIndex:
          placement && typeof placement.orderIndex === 'number'
            ? placement.orderIndex
            : Number.MAX_SAFE_INTEGER,
        title: card?.name ?? fallbackTitle,
        subtitle: getBoardItemSubtitle(item.subtype, item.lifetimeType),
        hp: stateView && typeof stateView.hp === 'number' ? stateView.hp : undefined,
        maxHp: stateView && typeof stateView.maxHp === 'number' ? stateView.maxHp : undefined,
        attack: stateView && typeof stateView.attack === 'number' ? stateView.attack : undefined,
        speed: stateView && typeof stateView.speed === 'number' ? stateView.speed : undefined,
        duration: stateView && typeof stateView.duration === 'number' ? stateView.duration : undefined,
      }];
      })
      .sort((left, right) => {
        const orderDelta = left.placementOrderIndex - right.placementOrderIndex;
        if (orderDelta !== 0) {
          return orderDelta;
        }

        return left.id.localeCompare(right.id);
      });
  }

  return getCreatureSummaries(state)
    .filter((creature) => creature.ownerId === playerId)
    .map<BoardItemSummary>((creature, index) => ({
      id: `creature:${creature.creatureId}`,
      runtimeId: creature.creatureId,
      ownerId: creature.ownerId,
      subtype: 'creature',
      school: undefined,
      lifetimeType: 'persistent',
      placementLayer: 'summon',
      placementOrderIndex: index,
      title: `Существо ${creature.creatureId}`,
      subtitle: getBoardItemSubtitle('creature', 'persistent'),
      hp: creature.hp,
      maxHp: creature.maxHp,
      attack: creature.attack,
      speed: creature.speed,
    }));
};
