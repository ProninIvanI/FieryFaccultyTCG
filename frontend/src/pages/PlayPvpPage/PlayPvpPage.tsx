import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCallback } from 'react';
import {
  buildCatalogCharacterSummaries,
  getCatalogCardTypeLabel,
  getCatalogSchoolLabel,
  normalizeCatalog,
  toCardDefinitionFromCatalog,
  toCatalogSchool,
  toCatalogCardUiType,
  type CatalogCharacterSummary,
} from '@game-core/cards/catalog';
import { CardRegistry } from '@game-core/cards/CardRegistry';
import {
  createInitialCardRoundIntent,
  createInitialCreatureRoundIntent,
} from '@game-core/rounds/createInitialRoundIntent';
import type { PlayerBoardModel, ResolutionLayer, RoundDraftValidationError, RoundResolutionResult, TargetType } from '@game-core/types';
import {
  getResolutionLayerLabel,
  getRoundDraftRejectCodeLabel,
  getRoundDraftValidationCodeLabel,
  getRoundActionReasonLabel,
  getTargetTypeLabel,
} from '@game-core/rounds/presentation';
import { Card, HomeLinkButton, PageShell } from '@/components';
import { ROUTES } from '@/constants';
import rawCardData from '@/data/cards.json';
import { authService, deckService, gameWsService } from '@/services';
import {
  AuthSession,
  GameStateSnapshot,
  JoinRejectedServerMessage,
  PlayerLabelMap,
  PvpConnectionStatus,
  PvpServiceEvent,
  RoundActionIntentDraft,
  RoundDraftRejectedServerMessage,
  TransportRejectedServerMessage,
  UserDeck,
} from '@/types';
import styles from './PlayPvpPage.module.css';

interface MatchSummary {
  roundNumber: number;
  roundStatus: string;
  initiativePlayerId: string;
  phase: string;
  playerCount: number;
  actionLogCount: number;
}

interface LocalPlayerSummary {
  playerId: string;
  mana: number;
  maxMana: number;
  actionPoints: number;
  characterId: string;
}

interface PlayerBoardSummary extends LocalPlayerSummary {
  deckSize: number;
  handSize: number;
  discardSize: number;
  locked: boolean;
}

interface HandCardSummary {
  instanceId: string;
  cardId: string;
  name: string;
  mana: number;
  cardType: string;
  school?: 'fire' | 'water' | 'earth' | 'air';
  effect?: string;
  hp?: number;
  attack?: number;
  speed?: number;
}

interface CreatureSummary {
  creatureId: string;
  ownerId: string;
  hp: number;
  maxHp: number;
  attack: number;
  speed: number;
  summonedAtRound?: number;
}

interface BoardItemSummary {
  id: string;
  runtimeId: string;
  ownerId: string;
  subtype: 'creature' | 'effect';
  lifetimeType: 'temporary' | 'persistent';
  placementLayer: ResolutionLayer;
  placementOrderIndex: number;
  title: string;
  subtitle: string;
  hp?: number;
  maxHp?: number;
  attack?: number;
  speed?: number;
  duration?: number;
}

interface RoundRibbonActionSummary {
  id: string;
  title: string;
  subtitle: string;
  modeLabel: string;
  statusLabel: string;
  targetLabel?: string;
  focusLabel: string;
  effectSummary?: string;
  cardSpeed?: number;
  targetType?: TargetType | null;
  targetId?: string | null;
  layer: ResolutionLayer;
  status: string;
  orderIndex: number;
  sourceType: 'card' | 'boardItem' | 'actor';
  sourceBoardItemId?: string;
}

type LocalBattleRibbonEntrySummary =
  | {
      id: string;
      kind: 'boardItem';
      orderIndex: number;
      layer: ResolutionLayer;
      item: BoardItemSummary;
      attachedActions: RoundRibbonActionSummary[];
    }
  | {
      id: string;
      kind: 'roundAction';
      orderIndex: number;
      layer: ResolutionLayer;
      action: RoundRibbonActionSummary;
    };

interface MatchEventSummary {
  id: string;
  title: string;
  description: string;
}

const ROUND_RESOLUTION_PLAYBACK_STEP_MS = 800;

type BattlefieldSelection =
  | { kind: 'hand'; instanceId: string }
  | { kind: 'creature'; creatureId: string }
  | null;

interface TargetDraft {
  sourceInstanceId: string;
  targetType: TargetType;
  targetId: string;
}

interface TargetCandidateSummary {
  id: string;
  label: string;
  kind: 'character' | 'creature';
}

interface RibbonTargetOptionSummary extends TargetCandidateSummary {
  compactLabel: string;
}

interface RoundSyncSummary {
  roundNumber: number;
  selfLocked: boolean;
  opponentLocked: boolean;
}

type RoundDraftRejectedSummary = Omit<RoundDraftRejectedServerMessage, 'type'>;
type JoinRejectedSummary = Omit<JoinRejectedServerMessage, 'type'>;
type TransportRejectedSummary = Omit<TransportRejectedServerMessage, 'type'>;

const isPendingTargetSelectionError = (entry: RoundDraftValidationError): boolean =>
  entry.code === 'target_type' && /Target is required/i.test(entry.message);

const getCardTypeLabel = (cardType: string): string => {
  const catalogType = toCatalogCardUiType(cardType);
  if (catalogType) {
    return catalogType === 'summon' ? 'Существо' : getCatalogCardTypeLabel(catalogType);
  }
  return cardType || 'Карта';
};

const getCardAccentClassName = (cardType: string): string => {
  if (cardType === 'summon') {
    return styles.cardAccentSummon;
  }

  if (cardType === 'spell') {
    return styles.cardAccentSpell;
  }

  return styles.cardAccentNeutral;
};

const getCardSchoolAccentClassName = (school?: string): string => {
  switch (school) {
    case 'fire':
      return styles.handCardArtworkFire;
    case 'water':
      return styles.handCardArtworkWater;
    case 'earth':
      return styles.handCardArtworkEarth;
    case 'air':
      return styles.handCardArtworkAir;
    default:
      return styles.handCardArtworkNeutral;
  }
};

const getRoundActionStatusDisplay = (status: string): string => {
  switch (status) {
    case 'draft':
      return 'Готовится';
    case 'locked':
      return 'Зафиксировано';
    case 'resolved':
      return 'Сработало';
    case 'fizzled':
      return 'Сорвалось';
    case 'rejected':
      return 'Отклонено';
    default:
      return status;
  }
};

const getRoundActionModeLabel = (layer: ResolutionLayer): string => {
  switch (layer) {
    case 'summon':
      return 'Призыв';
    case 'defensive_modifiers':
    case 'defensive_spells':
      return 'Защита';
    case 'other_modifiers':
      return 'Поддержка';
    case 'offensive_control_spells':
      return 'Боевое заклинание';
    case 'attacks':
      return 'Атака';
    case 'cleanup_end_of_round':
      return 'Конец раунда';
    default:
      return getResolutionLayerLabel(layer);
  }
};

const getBoardItemSubtitle = (
  subtype: 'creature' | 'effect',
  lifetimeType: 'temporary' | 'persistent',
): string => {
  if (subtype === 'creature') {
    return lifetimeType === 'persistent' ? 'Существо на поле' : 'Временный призыв';
  }

  return lifetimeType === 'persistent' ? 'Постоянный эффект' : 'Эффект на раунд';
};

const getDurationLabel = (duration: number): string => `Ходы: ${duration}`;

const getActionTargetPreview = (subtitle: string): string | undefined => {
  if (subtitle === 'Без цели' || subtitle === 'Цель уточняется') {
    return undefined;
  }

  return subtitle;
};

const getRoundActionFocusLabel = (modeLabel: string, targetLabel?: string): string =>
  targetLabel ? `${modeLabel} -> ${targetLabel}` : modeLabel;

const getRoundActionTone = (
  layer: ResolutionLayer,
): 'summon' | 'defense' | 'attack' | 'support' => {
  switch (layer) {
    case 'summon':
      return 'summon';
    case 'defensive_modifiers':
    case 'defensive_spells':
      return 'defense';
    case 'attacks':
      return 'attack';
    default:
      return 'support';
  }
};

const getRibbonActionToneClassName = (layer: ResolutionLayer): string => {
  switch (getRoundActionTone(layer)) {
    case 'summon':
      return styles.ribbonActionToneSummon;
    case 'defense':
      return styles.ribbonActionToneDefense;
    case 'attack':
      return styles.ribbonActionToneAttack;
    case 'support':
      return styles.ribbonActionToneSupport;
  }
};

const getRoundQueueToneClassName = (layer: ResolutionLayer): string => {
  switch (getRoundActionTone(layer)) {
    case 'summon':
      return styles.roundQueueItemSummon;
    case 'defense':
      return styles.roundQueueItemDefense;
    case 'attack':
      return styles.roundQueueItemAttack;
    case 'support':
      return styles.roundQueueItemSupport;
  }
};

const getActionToneBadgeClassName = (layer: ResolutionLayer): string => {
  switch (getRoundActionTone(layer)) {
    case 'summon':
      return styles.cardBadgeToneSummon;
    case 'defense':
      return styles.cardBadgeToneDefense;
    case 'attack':
      return styles.cardBadgeToneAttack;
    case 'support':
      return styles.cardBadgeToneSupport;
  }
};

const getActionCalloutToneClassName = (layer: ResolutionLayer): string => {
  switch (getRoundActionTone(layer)) {
    case 'summon':
      return styles.ribbonActionCalloutSummon;
    case 'defense':
      return styles.ribbonActionCalloutDefense;
    case 'attack':
      return styles.ribbonActionCalloutAttack;
    case 'support':
      return styles.ribbonActionCalloutSupport;
  }
};

const getRoundStatusLabel = (status: string): string => {
  switch (status) {
    case 'draft':
      return 'Подготовка';
    case 'locked_waiting':
      return 'Ожидание соперника';
    case 'resolving':
      return 'Разыгрывание';
    case 'resolved':
      return 'Завершён';
    default:
      return status || 'Неизвестно';
  }
};

const getConnectionStatusLabel = (status: PvpConnectionStatus): string => {
  switch (status) {
    case 'connected':
      return 'Подключено';
    case 'connecting':
      return 'Подключение';
    case 'disconnected':
      return 'Отключено';
    case 'idle':
      return 'Не подключено';
    default:
      return status;
  }
};

const getTargetButtonAriaLabel = (label: string, selectable: boolean): string =>
  selectable ? `Выбрать цель: ${label}` : label;

const getRibbonTargetTabAriaLabel = (label: string): string => `Назначить цель в ленте: ${label}`;

const getRibbonTargetCompactLabel = (candidate: TargetCandidateSummary): string =>
  candidate.kind === 'character' ? 'М' : 'С';

const getPreferredDefaultTargetId = (
  targetType: TargetType | null | undefined,
  candidates: TargetCandidateSummary[],
): string | null => {
  if (!targetType || candidates.length === 0) {
    return null;
  }

  switch (targetType) {
    case 'self':
    case 'allyCharacter':
      return candidates.find((candidate) => candidate.kind === 'character')?.id ?? null;
    case 'enemyCharacter':
      return candidates.find((candidate) => candidate.kind === 'character')?.id ?? null;
    case 'any':
      return (
        candidates.find((candidate) => candidate.kind === 'character')?.id ??
        candidates[0]?.id ??
        null
      );
    case 'creature':
      return null;
    default:
      return null;
  }
};

const getJoinRejectCodeLabel = (code: JoinRejectedServerMessage['code']): string => {
  switch (code) {
    case 'unauthorized':
      return 'Сессия входа недействительна или истекла';
    case 'deck_unavailable':
      return 'Выбранная колода недоступна для этого игрока';
    case 'session_full':
      return 'В матче уже заняты оба PvP-слота';
    case 'seed_mismatch':
      return 'Seed не совпадает с уже созданной сессией';
    case 'invalid_payload':
      return 'Запрос на подключение содержит некорректные данные';
    default:
      return 'Подключение к матчу отклонено сервером';
  }
};

const getTransportRejectCodeLabel = (code: TransportRejectedServerMessage['code']): string => {
  switch (code) {
    case 'invalid_json':
      return 'Сообщение не удалось разобрать как JSON';
    case 'invalid_payload':
      return 'Сообщение пришло в некорректном формате';
    case 'unknown_message_type':
      return 'Тип WS-сообщения не поддерживается сервером';
    default:
      return 'Транспортный запрос отклонён сервером';
  }
};

const getIntentPreviewLayer = (
  intent: RoundActionIntentDraft,
  selectedTargetType?: TargetType
): ResolutionLayer => {
  switch (intent.kind) {
    case 'Summon':
      return 'summon';
    case 'Evade':
      return 'defensive_modifiers';
    case 'Attack':
      return 'attacks';
    case 'CastSpell':
      return selectedTargetType === 'self' || selectedTargetType === 'allyCharacter'
        ? 'defensive_spells'
        : 'offensive_control_spells';
    case 'PlayCard':
      return selectedTargetType === 'self' || selectedTargetType === 'allyCharacter'
        ? 'defensive_modifiers'
        : 'other_modifiers';
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const cardCatalogById = new Map(normalizeCatalog(rawCardData).cards.map((card) => [card.id, card] as const));
const roundIntentCardRegistry = new CardRegistry(
  Array.isArray(rawCardData.cards)
    ? rawCardData.cards.flatMap((card) => {
        const definition = toCardDefinitionFromCatalog(card);
        return definition ? [definition] : [];
      })
    : [],
);
const characterCatalogById = new Map(
  buildCatalogCharacterSummaries(rawCardData).map((character) => [character.id, character] as const)
);

const getCharacterInitials = (name: string): string => {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return '??';
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
};

const getCharacterAccentClassName = (
  faculty: CatalogCharacterSummary['faculty'] | undefined,
  local = false
): string => {
  switch (faculty) {
    case 'fire':
      return local ? styles.playerPortraitLocalFire : styles.playerPortraitFire;
    case 'water':
      return local ? styles.playerPortraitLocalWater : styles.playerPortraitWater;
    case 'earth':
      return local ? styles.playerPortraitLocalEarth : styles.playerPortraitEarth;
    case 'air':
      return local ? styles.playerPortraitLocalAir : styles.playerPortraitAir;
    default:
      return local ? styles.playerPortraitLocalNeutral : styles.playerPortraitNeutral;
  }
};

const getCharacterStatusLabel = (
  character: CatalogCharacterSummary | null,
  mana: number,
  maxMana: number
): string => {
  const schoolLabel = character ? getCatalogSchoolLabel(character.faculty) : 'Персонаж не выбран';
  return `${schoolLabel} · мана ${mana}/${maxMana}`;
};

const getMatchSummary = (state: GameStateSnapshot | null): MatchSummary | null => {
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

const getRoundSyncFromState = (state: GameStateSnapshot | null, playerId: string): RoundSyncSummary | null => {
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
  };
};

const getLocalPlayerSummary = (
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

const getZoneSize = (zones: unknown, playerId: string): number => {
  if (!isRecord(zones)) {
    return 0;
  }

  const zone = zones[playerId];
  return Array.isArray(zone) ? zone.length : 0;
};

const getDeckSize = (decks: unknown, playerId: string): number => {
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

const getPlayerBoardSummaries = (state: GameStateSnapshot | null): PlayerBoardSummary[] => {
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

const getLocalHandCards = (state: GameStateSnapshot | null, playerId: string): HandCardSummary[] => {
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

const getCreatureSummaries = (state: GameStateSnapshot | null): CreatureSummary[] => {
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

const getPlayerBoardItemSummaries = (
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

const getPlayerPublicRibbonBoardItems = (
  state: GameStateSnapshot | null,
  playerId: string,
): BoardItemSummary[] => {
  const boardItems = getPlayerBoardItemSummaries(state, playerId);
  const boardItemById = new Map(boardItems.map((item) => [item.id, item] as const));
  const ribbonEntries = state?.boardView?.players?.[playerId]?.ribbonEntries;

  if (!Array.isArray(ribbonEntries)) {
    return boardItems;
  }

  const orderedItems = ribbonEntries.flatMap((entry) => {
    if (!isRecord(entry) || entry.kind !== 'boardItem' || typeof entry.boardItemId !== 'string') {
      return [];
    }

    const item = boardItemById.get(entry.boardItemId);
    return item ? [item] : [];
  });

  return orderedItems.length > 0 ? orderedItems : boardItems;
};

const getMatchEvents = (state: GameStateSnapshot | null): MatchEventSummary[] => {
  if (!state || !Array.isArray(state.log)) {
    return [];
  }

  return state.log
    .slice(-8)
    .reverse()
    .flatMap((entry, index) => {
      if (!isRecord(entry)) {
        return [];
      }

      const eventType = typeof entry.type === 'string' ? entry.type : 'event';
      const seq = typeof entry.seq === 'number' ? entry.seq : index + 1;
      const payload = isRecord(entry.payload) ? entry.payload : null;

      if (eventType === 'action' && payload && isRecord(payload.action)) {
        const action = payload.action;
        const actorId = typeof action.actorId === 'string' ? action.actorId : 'unknown';
        const actionType = typeof action.type === 'string' ? action.type : 'Action';

        return [{
          id: `action_${seq}`,
          title: actionType,
          description: `Актор ${actorId} выполнил ${actionType}.`,
        }];
      }

      if (eventType === 'summon') {
        const creatureId = payload && typeof payload.creatureId === 'string' ? payload.creatureId : 'unknown';
        return [{
          id: `summon_${seq}`,
          title: 'Призыв',
          description: `На стол вышло существо ${creatureId}.`,
        }];
      }

      if (eventType === 'damage') {
        return [{
          id: `damage_${seq}`,
          title: 'Урон',
          description: 'В матче был зарегистрирован урон.',
        }];
      }

      if (eventType === 'effect') {
        const effectId = payload && typeof payload.effectId === 'string' ? payload.effectId : 'unknown';
        return [{
          id: `effect_${seq}`,
          title: 'Эффект',
          description: `Сработал эффект ${effectId}.`,
        }];
      }

      return [{
        id: `event_${seq}`,
        title: eventType,
        description: 'Событие матча обновило состояние.',
      }];
    });
};

const getDeckVisualCount = (deckSize: number): number => {
  if (deckSize <= 0) {
    return 0;
  }

  return Math.min(Math.max(deckSize, 1), 18);
};

const buildSessionId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `session_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `session_${Date.now()}`;
};

const handleServiceEvent = (
  event: PvpServiceEvent,
  setStatus: (status: PvpConnectionStatus) => void,
  setMatchState: (state: GameStateSnapshot | null) => void,
  setError: (value: string) => void,
  setTransportRejected: (value: TransportRejectedSummary | null) => void,
  setJoinRejected: (value: JoinRejectedSummary | null) => void,
  setRoundDraft: (value: RoundActionIntentDraft[] | ((current: RoundActionIntentDraft[]) => RoundActionIntentDraft[])) => void,
  setRoundSync: (value: RoundSyncSummary | null | ((current: RoundSyncSummary | null) => RoundSyncSummary | null)) => void,
  setLastResolvedRound: (value: RoundResolutionResult | null) => void,
  setRoundDraftRejected: (value: RoundDraftRejectedSummary | null) => void,
  setSelfBoardModel: (value: PlayerBoardModel | null) => void,
): void => {
  if (event.type === 'status') {
    setStatus(event.status);
    if (event.status === 'connected') {
      setError('');
    }
    return;
  }

  if (event.type === 'state') {
    setMatchState(event.state);
    setTransportRejected(null);
    setJoinRejected(null);
    setError('');
    return;
  }

  if (event.type === 'transportRejected') {
    setJoinRejected(null);
    setTransportRejected({
      code: event.code,
      error: event.error,
      requestType: event.requestType,
    });
    setError(event.error);
    return;
  }

  if (event.type === 'joinRejected') {
    setTransportRejected(null);
    setJoinRejected({
      sessionId: event.sessionId,
      code: event.code,
      error: event.error,
    });
    setError(event.error);
    return;
  }

  if (event.type === 'roundDraftAccepted') {
    setRoundDraftRejected(null);
    setError('');
    return;
  }

  if (event.type === 'roundDraftRejected') {
    setRoundDraftRejected({
      operation: event.operation,
      roundNumber: event.roundNumber,
      code: event.code,
      error: event.error,
      errors: [...event.errors],
    });
    setError(event.error);
    return;
  }

  if (event.type === 'roundDraftSnapshot') {
    setRoundDraft(
      [...event.intents].sort((left, right) => left.queueIndex - right.queueIndex)
    );
    setSelfBoardModel(event.boardModel ?? null);
    setRoundSync((current) => ({
      roundNumber: event.roundNumber,
      selfLocked: event.locked,
      opponentLocked: current?.roundNumber === event.roundNumber ? current.opponentLocked : false,
    }));
    setRoundDraftRejected(null);
    setError('');
    return;
  }

  if (event.type === 'roundStatus') {
    setRoundSync({
      roundNumber: event.roundNumber,
      selfLocked: event.selfLocked,
      opponentLocked: event.opponentLocked,
    });
    setError('');
    return;
  }

  if (event.type === 'roundResolved') {
    setLastResolvedRound(event.result);
    setSelfBoardModel(null);
    setRoundDraftRejected(null);
    setError('');
    return;
  }

  if (event.type === 'error') {
    setError(event.error);
  }
};

export const PlayPvpPage = () => {
  const [session, setSession] = useState<AuthSession | null>(() => authService.getSession());
  const playerId = session?.userId ?? '';
  const authToken = session?.token ?? '';
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [sessionId, setSessionId] = useState(() => buildSessionId());
  const [seed, setSeed] = useState('1');
  const [deckId, setDeckId] = useState('');
  const [savedDecks, setSavedDecks] = useState<UserDeck[]>([]);
  const [isDecksLoading, setIsDecksLoading] = useState(false);
  const [status, setStatus] = useState<PvpConnectionStatus>(gameWsService.getStatus());
  const [matchState, setMatchState] = useState<GameStateSnapshot | null>(null);
  const [playerLabels, setPlayerLabels] = useState<PlayerLabelMap>({});
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [joinedSessionId, setJoinedSessionId] = useState('');
  const [transportRejected, setTransportRejected] = useState<TransportRejectedSummary | null>(null);
  const [joinRejected, setJoinRejected] = useState<JoinRejectedSummary | null>(null);
  const [selection, setSelection] = useState<BattlefieldSelection>(null);
  const [draftTargetId, setDraftTargetId] = useState('');
  const [roundDraft, setRoundDraft] = useState<RoundActionIntentDraft[]>([]);
  const [roundSync, setRoundSync] = useState<RoundSyncSummary | null>(null);
  const [roundDraftRejected, setRoundDraftRejected] = useState<RoundDraftRejectedSummary | null>(null);
  const [lastResolvedRound, setLastResolvedRound] = useState<RoundResolutionResult | null>(null);
  const [selfBoardModel, setSelfBoardModel] = useState<PlayerBoardModel | null>(null);
  const [lastResolvedDraft, setLastResolvedDraft] = useState<RoundActionIntentDraft[]>([]);
  const [resolvedPlaybackIndex, setResolvedPlaybackIndex] = useState(-1);
  const [resolvedPlaybackComplete, setResolvedPlaybackComplete] = useState(true);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showConnectionControls, setShowConnectionControls] = useState(false);
  const hasLiveStateRef = useRef(false);
  const pendingSessionIdRef = useRef('');
  const intentSequenceRef = useRef(0);
  const currentRoundRef = useRef<number | null>(null);
  const currentRoundDraftRef = useRef<RoundActionIntentDraft[]>([]);

  useEffect(() => {
    currentRoundDraftRef.current = roundDraft;
  }, [roundDraft]);

  useEffect(() => {
    if (!session || session.username) {
      return;
    }

    let cancelled = false;
    void authService.ensureSessionProfile(session).then((nextSession) => {
      if (!cancelled) {
        setSession(nextSession);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    const unsubscribe = gameWsService.subscribe((event) => {
      if (event.type === 'state') {
        hasLiveStateRef.current = true;
        if (pendingSessionIdRef.current) {
          setJoinedSessionId(pendingSessionIdRef.current);
        }
        setMatchState(event.state);
        setPlayerLabels(event.playerLabels ?? {});
        setTransportRejected(null);
        setJoinRejected(null);
        setError('');
        return;
      }

      if ((event.type === 'error' || event.type === 'joinRejected' || event.type === 'transportRejected') && !hasLiveStateRef.current) {
        pendingSessionIdRef.current = '';
        setJoinedSessionId('');
        setMatchState(null);
        setPlayerLabels({});
      }

      if (event.type === 'roundResolved') {
        setLastResolvedDraft(currentRoundDraftRef.current.map((intent) => ({ ...intent })));
      }

      handleServiceEvent(
        event,
        setStatus,
        setMatchState,
        setError,
        setTransportRejected,
        setJoinRejected,
        setRoundDraft,
        setRoundSync,
        setLastResolvedRound,
        setRoundDraftRejected,
        setSelfBoardModel,
      );
    });

    return () => {
      unsubscribe();
      gameWsService.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!authToken) {
      return;
    }

    let cancelled = false;
    setIsDecksLoading(true);

    void deckService.list().then((result) => {
      if (cancelled) {
        return;
      }

      setIsDecksLoading(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setSavedDecks(result.decks);
      if (!deckId && result.decks[0]) {
        setDeckId(result.decks[0].id);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [authToken, deckId]);

  useEffect(() => {
    const totalSteps = lastResolvedRound?.orderedActions.length ?? 0;

    if (!lastResolvedRound || totalSteps === 0) {
      setResolvedPlaybackIndex(-1);
      setResolvedPlaybackComplete(true);
      return;
    }

    setResolvedPlaybackIndex(0);
    setResolvedPlaybackComplete(totalSteps === 1);
  }, [lastResolvedRound]);

  useEffect(() => {
    const totalSteps = lastResolvedRound?.orderedActions.length ?? 0;

    if (
      !lastResolvedRound ||
      totalSteps <= 1 ||
      resolvedPlaybackComplete ||
      resolvedPlaybackIndex < 0
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setResolvedPlaybackIndex((currentIndex) => {
        const nextIndex = Math.min(currentIndex + 1, totalSteps - 1);
        if (nextIndex >= totalSteps - 1) {
          setResolvedPlaybackComplete(true);
        }
        return nextIndex;
      });
    }, ROUND_RESOLUTION_PLAYBACK_STEP_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [lastResolvedRound, resolvedPlaybackComplete, resolvedPlaybackIndex]);

  useEffect(() => {
    const nextRoundSync = getRoundSyncFromState(matchState, playerId);
    if (!nextRoundSync) {
      return;
    }

    if (currentRoundRef.current !== nextRoundSync.roundNumber) {
      currentRoundRef.current = nextRoundSync.roundNumber;
      setRoundDraft((currentDraft) =>
        currentDraft.some((intent) => intent.roundNumber === nextRoundSync.roundNumber) ? currentDraft : []
      );
      setRoundDraftRejected(null);
      setDraftTargetId('');
      setRoundSync(nextRoundSync);
      return;
    }

    setRoundSync((current) => current ?? nextRoundSync);
  }, [matchState, playerId]);

  const matchSummary = useMemo(() => getMatchSummary(matchState), [matchState]);
  const localPlayer = useMemo(() => getLocalPlayerSummary(matchState, playerId), [matchState, playerId]);
  const playerBoards = useMemo(() => getPlayerBoardSummaries(matchState), [matchState]);
  const localHandCards = useMemo(() => getLocalHandCards(matchState, playerId), [matchState, playerId]);
  const creatures = useMemo(() => getCreatureSummaries(matchState), [matchState]);
  const matchEvents = useMemo(() => getMatchEvents(matchState), [matchState]);
  const alliedCreatures = useMemo(() => creatures.filter((creature) => creature.ownerId === playerId), [creatures, playerId]);
  const enemyCreatures = useMemo(() => creatures.filter((creature) => creature.ownerId !== playerId), [creatures, playerId]);
  const localBoardItems = useMemo(() => getPlayerBoardItemSummaries(matchState, playerId), [matchState, playerId]);
  const localBoardItemIdByRuntimeId = useMemo(
    () => new Map(localBoardItems.map((item) => [item.runtimeId, item.id] as const)),
    [localBoardItems],
  );
  const localBoardItemsById = useMemo(
    () => new Map(localBoardItems.map((item) => [item.id, item] as const)),
    [localBoardItems],
  );
  const canSummonMoreCreatures = alliedCreatures.length < 2;
  const enemyBoards = useMemo(() => playerBoards.filter((playerBoard) => playerBoard.playerId !== playerId), [playerBoards, playerId]);
  const localBoard = useMemo(
    () => playerBoards.find((playerBoard) => playerBoard.playerId === playerId) ?? null,
    [playerBoards, playerId]
  );
  const playerRosterSignature = useMemo(
    () => [...playerBoards]
      .map((playerBoard) => `${playerBoard.playerId}:${playerBoard.characterId}`)
      .sort((left, right) => left.localeCompare(right))
      .join('|'),
    [playerBoards],
  );
  const resolvedPlayerLabels = useMemo(
    () => (playerId && session?.username ? { ...playerLabels, [playerId]: session.username } : playerLabels),
    [playerId, playerLabels, session?.username],
  );
  const getPlayerDisplayName = useCallback(
    (candidatePlayerId?: string | null): string => {
      if (!candidatePlayerId) {
        return '';
      }

      return resolvedPlayerLabels[candidatePlayerId] ?? candidatePlayerId;
    },
    [resolvedPlayerLabels],
  );
  const localDisplayName = getPlayerDisplayName(playerId);
  const primaryEnemyBoard = enemyBoards[0] ?? null;
  const primaryEnemyDisplayName = getPlayerDisplayName(primaryEnemyBoard?.playerId);
  const enemyRibbonBoardItems = useMemo(
    () => (primaryEnemyBoard?.playerId ? getPlayerPublicRibbonBoardItems(matchState, primaryEnemyBoard.playerId) : []),
    [matchState, primaryEnemyBoard?.playerId],
  );
  const localCharacter = useMemo(
    () => (localPlayer?.characterId ? characterCatalogById.get(localPlayer.characterId) ?? null : null),
    [localPlayer]
  );
  const enemyCharacter = useMemo(
    () => (primaryEnemyBoard?.characterId ? characterCatalogById.get(primaryEnemyBoard.characterId) ?? null : null),
    [primaryEnemyBoard]
  );
  const currentRoundNumber = roundSync?.roundNumber ?? matchSummary?.roundNumber ?? 0;
  const isEnemySideActive = Boolean(roundSync?.opponentLocked);
  const isLocalSideActive = Boolean(roundSync?.selfLocked);
  const pendingTargetSelectionCount = useMemo(
    () =>
      roundDraft.filter(
        (intent) =>
          'target' in intent &&
          intent.target?.targetType &&
          !intent.target?.targetId,
      ).length,
    [roundDraft],
  );
  const canLockRound = Boolean(
    currentRoundNumber > 0 &&
      localPlayer &&
      localPlayer.characterId &&
      status === 'connected' &&
      !roundSync?.selfLocked &&
      pendingTargetSelectionCount === 0
  );
  const canActFromHand = Boolean(
    currentRoundNumber > 0 &&
      localPlayer &&
      localPlayer.characterId &&
      status === 'connected' &&
      !roundSync?.selfLocked
  );
  const selectedHandCard = useMemo(
    () => (selection?.kind === 'hand' ? localHandCards.find((card) => card.instanceId === selection.instanceId) ?? null : null),
    [localHandCards, selection]
  );
  const selectedHandCardIntent = useMemo(
    () =>
      selectedHandCard
        ? roundDraft.find(
            (intent) =>
              'cardInstanceId' in intent &&
              typeof intent.cardInstanceId === 'string' &&
              intent.cardInstanceId === selectedHandCard.instanceId
          ) ?? null
        : null,
    [roundDraft, selectedHandCard]
  );
  const handCardIntentIdsByInstanceId = useMemo(
    () =>
      new Map(
        roundDraft.flatMap((intent) =>
          'cardInstanceId' in intent && typeof intent.cardInstanceId === 'string'
            ? [[intent.cardInstanceId, intent.intentId] as const]
            : []
        )
      ),
    [roundDraft]
  );
  const stagedHandCardIds = useMemo(
    () => new Set(handCardIntentIdsByInstanceId.keys()),
    [handCardIntentIdsByInstanceId],
  );
  const availableHandCards = useMemo(
    () => localHandCards.filter((card) => !stagedHandCardIds.has(card.instanceId)),
    [localHandCards, stagedHandCardIds],
  );
  const selectedCreature = useMemo(
    () => (selection?.kind === 'creature' ? creatures.find((creature) => creature.creatureId === selection.creatureId) ?? null : null),
    [creatures, selection]
  );
  const selectedCardTargetType = useMemo(() => {
    if (!selectedHandCard) {
      return null;
    }

    if (selectedHandCardIntent && 'target' in selectedHandCardIntent) {
      return selectedHandCardIntent.target.targetType ?? null;
    }

    return roundIntentCardRegistry.get(selectedHandCard.cardId)?.targetType ?? null;
  }, [selectedHandCard, selectedHandCardIntent]);
  const isSelectedCreatureOwnedByLocalPlayer = Boolean(selectedCreature && selectedCreature.ownerId === playerId);
  const selectedCreatureHasSummoningSickness = Boolean(
    selectedCreature && currentRoundNumber > 0 && selectedCreature.summonedAtRound === currentRoundNumber
  );
  const selectedCreatureSuggestedAttackIntent = useMemo(() => {
    if (!selectedCreature || !isSelectedCreatureOwnedByLocalPlayer || !currentRoundNumber || !playerId) {
      return null;
    }

    return createInitialCreatureRoundIntent({
      state: {
        characters: matchState?.characters ?? {},
        creatures: matchState?.creatures ?? {},
        round: matchState?.round ?? {
          number: currentRoundNumber,
          status: 'draft',
          initiativePlayerId: playerId,
          players: {},
        },
      },
      intentId: 'preview_attack',
      roundNumber: currentRoundNumber,
      queueIndex: 0,
      playerId,
      creatureId: selectedCreature.creatureId,
      actionKind: 'Attack',
      preferredTargetId: draftTargetId || undefined,
    });
  }, [
    currentRoundNumber,
    draftTargetId,
    isSelectedCreatureOwnedByLocalPlayer,
    matchState?.characters,
    matchState?.creatures,
    matchState?.round,
    playerId,
    selectedCreature,
  ]);
  const attackTargetDraft = useMemo<TargetDraft | null>(() => {
    if (
      !selectedCreature ||
      !isSelectedCreatureOwnedByLocalPlayer ||
      !selectedCreatureSuggestedAttackIntent ||
      selectedCreatureSuggestedAttackIntent.kind !== 'Attack' ||
      !selectedCreatureSuggestedAttackIntent.target.targetId ||
      !selectedCreatureSuggestedAttackIntent.target.targetType
    ) {
      return null;
    }

    return {
      sourceInstanceId: selectedCreature.creatureId,
      targetType: selectedCreatureSuggestedAttackIntent.target.targetType,
      targetId: selectedCreatureSuggestedAttackIntent.target.targetId,
    };
  }, [isSelectedCreatureOwnedByLocalPlayer, selectedCreature, selectedCreatureSuggestedAttackIntent]);
  const getTargetCandidatesForType = useCallback((targetType: TargetType | null | undefined): TargetCandidateSummary[] => {
    const candidates: TargetCandidateSummary[] = [];

    if (!localPlayer || !targetType) {
      return candidates;
    }

    if (targetType === 'allyCharacter' || targetType === 'self' || targetType === 'any') {
      candidates.push({
        id: localPlayer.characterId,
        label: 'Твой маг',
        kind: 'character',
      });
    }

    if (targetType === 'enemyCharacter' || targetType === 'any') {
      enemyBoards.forEach((board) => {
        if (board.characterId) {
          candidates.push({
            id: board.characterId,
            label: `Маг ${getPlayerDisplayName(board.playerId)}`,
            kind: 'character',
          });
        }
      });
    }

    if (targetType === 'creature' || targetType === 'any') {
      creatures.forEach((creature) => {
        candidates.push({
          id: creature.creatureId,
          label: creature.ownerId === playerId ? `Твое существо ${creature.creatureId}` : `Существо ${creature.creatureId}`,
          kind: 'creature',
        });
      });
    }

    return candidates;
  }, [creatures, enemyBoards, getPlayerDisplayName, localPlayer, playerId]);
  const targetCandidates = useMemo<TargetCandidateSummary[]>(() => {
    const candidates: TargetCandidateSummary[] = [];

    if (!localPlayer) {
      return candidates;
    }

    if (selectedCardTargetType) {
      return getTargetCandidatesForType(selectedCardTargetType);
    }

    if (isSelectedCreatureOwnedByLocalPlayer) {
      enemyBoards.forEach((board) => {
        if (board.characterId) {
          candidates.push({
            id: board.characterId,
            label: `Маг ${getPlayerDisplayName(board.playerId)}`,
            kind: 'character',
          });
        }
      });

      enemyCreatures.forEach((creature) => {
        candidates.push({
          id: creature.creatureId,
          label: `Существо ${creature.creatureId}`,
          kind: 'creature',
        });
      });
    }

    return candidates;
  }, [
    enemyBoards,
    enemyCreatures,
    getPlayerDisplayName,
    getTargetCandidatesForType,
    isSelectedCreatureOwnedByLocalPlayer,
    localPlayer,
    selectedCardTargetType,
  ]);
  const knownTargetLabelsById = useMemo(() => {
    const labelMap = new Map<string, string>();

    if (localPlayer?.characterId) {
      labelMap.set(localPlayer.characterId, 'Твой маг');
    }

    enemyBoards.forEach((board) => {
      if (board.characterId) {
        labelMap.set(board.characterId, `Маг ${getPlayerDisplayName(board.playerId)}`);
      }
    });

    creatures.forEach((creature) => {
      labelMap.set(
        creature.creatureId,
        creature.ownerId === playerId ? `Твое существо ${creature.creatureId}` : `Существо ${creature.creatureId}`,
      );
    });

    return labelMap;
  }, [creatures, enemyBoards, getPlayerDisplayName, localPlayer, playerId]);
  const getRibbonTargetOptions = useCallback((targetType: TargetType | null | undefined): RibbonTargetOptionSummary[] =>
    getTargetCandidatesForType(targetType).map((candidate) => ({
      ...candidate,
      compactLabel: getRibbonTargetCompactLabel(candidate),
    })),
  [getTargetCandidatesForType]);
  const getDefaultTargetIdForType = useCallback(
    (targetType: TargetType | null | undefined): string | null =>
      getPreferredDefaultTargetId(targetType, getTargetCandidatesForType(targetType)),
    [getTargetCandidatesForType],
  );
  const selectedAttackTargetLabel = attackTargetDraft
    ? `${getTargetTypeLabel(attackTargetDraft.targetType)} -> ${knownTargetLabelsById.get(attackTargetDraft.targetId) ?? attackTargetDraft.targetId}`
    : selectedCreatureHasSummoningSickness
      ? 'атака закрыта до следующего раунда'
      : 'цель ещё не выбрана';
  const selectedCreatureActionStatusLabel = selectedCreatureHasSummoningSickness
    ? 'Атака закрыта, уклонение доступно'
    : roundSync?.selfLocked
      ? 'Раунд зафиксирован'
      : 'Выбери действие на карте';
  const canQueueEvade = Boolean(selectedCreature && isSelectedCreatureOwnedByLocalPlayer && canActFromHand);
  const canQueueAttack = Boolean(
    attackTargetDraft &&
      selectedCreature &&
      isSelectedCreatureOwnedByLocalPlayer &&
      canActFromHand &&
      !selectedCreatureHasSummoningSickness
  );

  const isSelectableTarget = (candidateId: string): boolean => targetCandidates.some((candidate) => candidate.id === candidateId);
  const isDraftTargetActive = (candidateId: string): boolean => draftTargetId === candidateId;
  const coreRoundActionByIntentId = useMemo(
    () => new Map((selfBoardModel?.roundActions ?? []).map((action) => [action.id, action] as const)),
    [selfBoardModel],
  );
  const previewLayerByIntentId = useMemo(() => {
    const layerMap = new Map<string, ResolutionLayer>();

    roundDraft.forEach((intent) => {
      const coreRoundAction = coreRoundActionByIntentId.get(intent.intentId);
      const selectedTargetType =
        intent.kind === 'CastSpell' || intent.kind === 'PlayCard' || intent.kind === 'Attack'
          ? intent.target.targetType
          : undefined;
      layerMap.set(
        intent.intentId,
        coreRoundAction?.placement.layer ?? getIntentPreviewLayer(intent, selectedTargetType),
      );
    });

    return layerMap;
  }, [coreRoundActionByIntentId, roundDraft]);

  const syncRoundDraft = useCallback((nextDraft: RoundActionIntentDraft[]): void => {
    if (!currentRoundNumber) {
      setError('Раунд ещё не синхронизирован с сервером.');
      return;
    }

    const normalizedDraft = nextDraft.map((intent, index) => ({
      ...intent,
      roundNumber: currentRoundNumber,
      queueIndex: index,
    }));

    try {
      gameWsService.replaceRoundDraft(currentRoundNumber, normalizedDraft);
      setRoundDraftRejected(null);
      setRoundDraft(normalizedDraft);
      setError('');
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Не удалось обновить боевую ленту');
    }
  }, [currentRoundNumber]);

  const buildIntentId = (kind: RoundActionIntentDraft['kind']): string => {
    intentSequenceRef.current += 1;
    return `${playerId || 'player'}_round_${currentRoundNumber}_${kind}_${intentSequenceRef.current}`;
  };

  const appendRoundIntent = useCallback((intent: RoundActionIntentDraft): void => {
    if (!currentRoundNumber) {
      setError('Раунд ещё не создан сервером.');
      return;
    }

    syncRoundDraft([...roundDraft, intent]);
  }, [currentRoundNumber, roundDraft, syncRoundDraft]);

  const upsertRoundIntent = useCallback(
    (
      matcher: (intent: RoundActionIntentDraft) => boolean,
      buildNextIntent: (existingIntent: RoundActionIntentDraft | null) => RoundActionIntentDraft
    ): void => {
      const existingIntent = roundDraft.find(matcher) ?? null;
      if (existingIntent) {
        syncRoundDraft(roundDraft.map((intent) => (intent.intentId === existingIntent.intentId ? buildNextIntent(existingIntent) : intent)));
        return;
      }

      appendRoundIntent(buildNextIntent(null));
    },
    [appendRoundIntent, roundDraft, syncRoundDraft]
  );

  const submitJoin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!playerId) {
      setError('Для PvP нужен вход в аккаунт.');
      return;
    }
    if (!authToken) {
      setError('Не удалось получить auth token для PvP.');
      return;
    }
    if (!deckId) {
      setError('Выбери сохранённую колоду для PvP.');
      return;
    }

    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId) {
      setError('Укажи sessionId матча.');
      return;
    }

    const parsedSeed = Number(seed);
    const joinPayload =
      mode === 'create'
        ? {
            type: 'join' as const,
            sessionId: normalizedSessionId,
            token: authToken,
            deckId,
            seed: Number.isFinite(parsedSeed) ? parsedSeed : 1,
          }
        : {
            type: 'join' as const,
            sessionId: normalizedSessionId,
            token: authToken,
            deckId,
          };

    setIsSubmitting(true);
    setError('');
    setMatchState(null);
    setPlayerLabels({});
    setJoinedSessionId('');
    setSelection(null);
    setDraftTargetId('');
    setRoundDraft([]);
    setTransportRejected(null);
    setJoinRejected(null);
    setRoundDraftRejected(null);
    setRoundSync(null);
    setLastResolvedRound(null);
    setLastResolvedDraft([]);
    hasLiveStateRef.current = false;
    pendingSessionIdRef.current = normalizedSessionId;
    currentRoundRef.current = null;

    try {
      await gameWsService.joinSession(joinPayload);
    } catch (joinError) {
      pendingSessionIdRef.current = '';
      setJoinedSessionId('');
      setError(joinError instanceof Error ? joinError.message : 'Не удалось подключиться к игровому серверу');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisconnect = () => {
    gameWsService.disconnect();
    setJoinedSessionId('');
    setMatchState(null);
    setPlayerLabels({});
    setSelection(null);
    setDraftTargetId('');
    setRoundDraft([]);
    setTransportRejected(null);
    setJoinRejected(null);
    setRoundDraftRejected(null);
    setRoundSync(null);
    setLastResolvedRound(null);
    setLastResolvedDraft([]);
    hasLiveStateRef.current = false;
    pendingSessionIdRef.current = '';
    currentRoundRef.current = null;
  };

  const handleLockRound = () => {
    if (!localPlayer || !currentRoundNumber) {
      setError('Локальный игрок или раунд ещё не синхронизированы.');
      return;
    }

    if (pendingTargetSelectionCount > 0) {
      setError('Сначала выбери цель для всех карт в ленте.');
      return;
    }

    try {
      gameWsService.lockRound(currentRoundNumber);
      setRoundDraftRejected(null);
      setError('');
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Не удалось зафиксировать раунд');
    }
  };

  const handleSummon = (card: HandCardSummary) => {
    if (!localPlayer) {
      setError('Локальный игрок ещё не синхронизирован с матчем.');
      return;
    }

    if (card.cardType !== 'summon') {
      setError('Для этой карты действие из UI пока не реализовано.');
      return;
    }

    upsertRoundIntent(
      (intent) => 'cardInstanceId' in intent && intent.cardInstanceId === card.instanceId,
      (existingIntent) => ({
        intentId: existingIntent?.intentId ?? buildIntentId('Summon'),
        roundNumber: currentRoundNumber,
        queueIndex: existingIntent?.queueIndex ?? roundDraft.length,
        kind: 'Summon',
        actorId: localPlayer.characterId,
        playerId: localPlayer.playerId,
        cardInstanceId: card.instanceId,
      })
    );
  };

  const handleHandCardClick = (card: HandCardSummary) => {
    setSelection({ kind: 'hand', instanceId: card.instanceId });
    setError('');

    if (!localPlayer || !currentRoundNumber || !canActFromHand) {
      return;
    }

    const existingIntent = roundDraft.find(
      (intent) => 'cardInstanceId' in intent && typeof intent.cardInstanceId === 'string' && intent.cardInstanceId === card.instanceId
    );

    if (existingIntent) {
      if ('target' in existingIntent && existingIntent.target?.targetId) {
        setDraftTargetId(String(existingIntent.target.targetId));
      } else {
        setDraftTargetId('');
      }
      return;
    }

    if (card.cardType === 'summon') {
      if (localPlayer.mana < card.mana) {
        return;
      }

      handleSummon(card);
      return;
    }

    if (!matchState) {
      setError('Состояние матча ещё не синхронизировано.');
      return;
    }

    const nextIntent = createInitialCardRoundIntent({
      state: {
        cardInstances: matchState.cardInstances ?? {},
        characters: matchState.characters ?? {},
        creatures: matchState.creatures ?? {},
      },
      cards: roundIntentCardRegistry,
      intentId: buildIntentId(card.cardType === 'spell' ? 'CastSpell' : 'PlayCard'),
      roundNumber: currentRoundNumber,
      queueIndex: roundDraft.length,
      playerId: localPlayer.playerId,
      actorId: localPlayer.characterId,
      cardInstanceId: card.instanceId,
    });
    if (!nextIntent) {
      setError('Не удалось собрать стартовое действие из карточного контракта.');
      return;
    }

    setDraftTargetId('target' in nextIntent && nextIntent.target.targetId ? String(nextIntent.target.targetId) : '');
    upsertRoundIntent(
      (intent) => 'cardInstanceId' in intent && intent.cardInstanceId === card.instanceId,
      () => nextIntent
    );
  };

  const handleQueueAttack = () => {
    if (!selectedCreature || !currentRoundNumber || !playerId) {
      setError('Сначала выбери своё существо.');
      return;
    }

    const nextIntent = createInitialCreatureRoundIntent({
      state: {
        characters: matchState?.characters ?? {},
        creatures: matchState?.creatures ?? {},
        round: matchState?.round ?? {
          number: currentRoundNumber,
          status: 'draft',
          initiativePlayerId: playerId,
          players: {},
        },
      },
      intentId: buildIntentId('Attack'),
      roundNumber: currentRoundNumber,
      queueIndex: roundDraft.length,
      playerId,
      creatureId: selectedCreature.creatureId,
      actionKind: 'Attack',
      preferredTargetId: draftTargetId || undefined,
    });
    if (!nextIntent) {
      setError('Не удалось собрать стартовую атаку из правил game-core.');
      return;
    }

    appendRoundIntent(nextIntent);
    setDraftTargetId('');
  };

  const handleQueueEvade = () => {
    if (!selectedCreature || !currentRoundNumber || !playerId) {
      setError('Сначала выбери своё существо.');
      return;
    }

    const nextIntent = createInitialCreatureRoundIntent({
      state: {
        characters: matchState?.characters ?? {},
        creatures: matchState?.creatures ?? {},
        round: matchState?.round ?? {
          number: currentRoundNumber,
          status: 'draft',
          initiativePlayerId: playerId,
          players: {},
        },
      },
      intentId: buildIntentId('Evade'),
      roundNumber: currentRoundNumber,
      queueIndex: roundDraft.length,
      playerId,
      creatureId: selectedCreature.creatureId,
      actionKind: 'Evade',
    });
    if (!nextIntent) {
      setError('Не удалось собрать стартовое уклонение из правил game-core.');
      return;
    }

    appendRoundIntent(nextIntent);
    setDraftTargetId('');
  };

  const handleRemoveRoundIntent = (intentId: string) => {
    syncRoundDraft(roundDraft.filter((intent) => intent.intentId !== intentId));
  };
  const handleRoundIntentTargetSelect = useCallback((intentId: string, targetType: TargetType, targetId: string) => {
    setDraftTargetId(targetId);
    syncRoundDraft(
      roundDraft.map((intent) =>
        intent.intentId === intentId && 'target' in intent
          ? {
              ...intent,
              target: {
                targetType,
                targetId,
              },
            }
          : intent,
      ),
    );
  }, [roundDraft, syncRoundDraft]);

  const getIntentCardSummary = useCallback(
    (instanceId: string): HandCardSummary | null => localHandCards.find((card) => card.instanceId === instanceId) ?? null,
    [localHandCards],
  );

  const getIntentLabel = useCallback(
    (intent: RoundActionIntentDraft): string => {
      switch (intent.kind) {
        case 'Summon': {
          const card = getIntentCardSummary(intent.cardInstanceId);
          return card ? `Призыв: ${card.name}` : `Призыв ${intent.cardInstanceId}`;
        }
        case 'CastSpell': {
          const card = getIntentCardSummary(intent.cardInstanceId);
          return card ? `Заклинание: ${card.name}` : `Заклинание ${intent.cardInstanceId}`;
        }
        case 'PlayCard': {
          const card = getIntentCardSummary(intent.cardInstanceId);
          return card ? `Розыгрыш: ${card.name}` : `Розыгрыш ${intent.cardInstanceId}`;
        }
        case 'Attack':
          return `Атака: ${intent.sourceCreatureId}`;
        case 'Evade':
          return 'Уклонение';
      }
    },
    [getIntentCardSummary],
  );

  const getIntentTargetLabel = useCallback(
    (intent: RoundActionIntentDraft): string => {
      if (intent.kind === 'Summon' || intent.kind === 'Evade') {
        return 'Без цели';
      }

      const { targetId, targetType } = intent.target;
      if (!targetId) {
        return 'Цель уточняется';
      }

      const targetLabel = knownTargetLabelsById.get(targetId);
      return `${getTargetTypeLabel(targetType ?? null)} -> ${targetLabel ?? targetId}`;
    },
    [knownTargetLabelsById],
  );
  const localRoundRibbonItems = useMemo<RoundRibbonActionSummary[]>(() => {
    if (selfBoardModel?.roundActions?.length) {
      return [...selfBoardModel.roundActions]
        .sort((left, right) => left.placement.orderIndex - right.placement.orderIndex)
        .map((action) => {
          const matchingDraft = roundDraft.find((intent) => intent.intentId === action.id) ?? null;
          const matchingCard =
            matchingDraft && 'cardInstanceId' in matchingDraft
              ? getIntentCardSummary(matchingDraft.cardInstanceId)
              : null;

          return {
            id: action.id,
            title:
              matchingCard?.name ??
              (matchingDraft ? getIntentLabel(matchingDraft) : `${action.kind} ${action.id}`),
            subtitle: matchingDraft
              ? getIntentTargetLabel(matchingDraft)
              : action.summary ?? `Слой ${getResolutionLayerLabel(action.placement.layer)}`,
            modeLabel: getRoundActionModeLabel(action.placement.layer),
            statusLabel: getRoundActionStatusDisplay(action.status),
            targetLabel: matchingDraft ? getActionTargetPreview(getIntentTargetLabel(matchingDraft)) : undefined,
            focusLabel: getRoundActionFocusLabel(
              getRoundActionModeLabel(action.placement.layer),
              matchingDraft ? getActionTargetPreview(getIntentTargetLabel(matchingDraft)) : undefined,
            ),
            effectSummary: matchingCard?.effect,
            cardSpeed: matchingCard?.speed,
            targetType: matchingDraft && 'target' in matchingDraft ? matchingDraft.target.targetType ?? null : null,
            targetId: matchingDraft && 'target' in matchingDraft ? matchingDraft.target.targetId ?? null : null,
            layer: action.placement.layer,
            status: action.status,
            orderIndex: action.placement.orderIndex,
            sourceType: action.source.type,
            sourceBoardItemId:
              action.source.type === 'boardItem'
                ? action.source.boardItemId
                : action.source.type === 'actor'
                  ? localBoardItemIdByRuntimeId.get(String(action.source.actorId))
                  : undefined,
          };
        });
    }

    return roundDraft.map((intent, index) => {
      const fallbackSourceBoardItemId =
        intent.kind === 'Attack'
          ? `creature:${intent.sourceCreatureId}`
          : intent.kind === 'Evade'
            ? localBoardItemIdByRuntimeId.get(String(intent.actorId))
            : undefined;
      const intentCard =
        'cardInstanceId' in intent && typeof intent.cardInstanceId === 'string'
          ? getIntentCardSummary(intent.cardInstanceId)
          : null;

      return {
        id: intent.intentId,
        title: intentCard?.name ?? getIntentLabel(intent),
        subtitle: getIntentTargetLabel(intent),
        modeLabel: getRoundActionModeLabel(previewLayerByIntentId.get(intent.intentId) ?? 'other_modifiers'),
        statusLabel: getRoundActionStatusDisplay(roundSync?.selfLocked ? 'locked' : 'draft'),
        targetLabel: getActionTargetPreview(getIntentTargetLabel(intent)),
        focusLabel: getRoundActionFocusLabel(
          getRoundActionModeLabel(previewLayerByIntentId.get(intent.intentId) ?? 'other_modifiers'),
          getActionTargetPreview(getIntentTargetLabel(intent)),
        ),
        effectSummary: intentCard?.effect,
        cardSpeed: intentCard?.speed,
        targetType: 'target' in intent ? intent.target.targetType ?? null : null,
        targetId: 'target' in intent ? intent.target.targetId ?? null : null,
        layer: previewLayerByIntentId.get(intent.intentId) ?? 'other_modifiers',
        status: roundSync?.selfLocked ? 'locked' : 'draft',
        orderIndex: index,
        sourceType:
          intent.kind === 'Attack'
            ? 'boardItem'
            : intent.kind === 'Evade'
              ? fallbackSourceBoardItemId
                ? 'boardItem'
                : 'actor'
              : 'card',
        sourceBoardItemId: fallbackSourceBoardItemId,
      };
    });
  }, [getIntentCardSummary, getIntentLabel, getIntentTargetLabel, localBoardItemIdByRuntimeId, previewLayerByIntentId, roundDraft, roundSync?.selfLocked, selfBoardModel]);
  const localBattleRibbonEntries = useMemo<LocalBattleRibbonEntrySummary[]>(() => {
    const actionById = new Map(localRoundRibbonItems.map((action) => [action.id, action] as const));

    if (selfBoardModel?.ribbonEntries?.length) {
      const orderedEntries = selfBoardModel.ribbonEntries.flatMap<LocalBattleRibbonEntrySummary>((entry) => {
        if (entry.kind === 'boardItem') {
          const item = localBoardItemsById.get(entry.boardItemId);
          if (!item) {
            return [];
          }

          return [{
            id: entry.id,
            kind: 'boardItem',
            orderIndex: entry.orderIndex,
            layer: entry.layer,
            item,
            attachedActions: entry.attachedRoundActionIds.flatMap((actionId) => {
              const action = actionById.get(actionId);
              return action ? [action] : [];
            }),
          }];
        }

        const action = actionById.get(entry.roundActionId);
        if (!action) {
          return [];
        }

        return [{
          id: entry.id,
          kind: 'roundAction',
          orderIndex: entry.orderIndex,
          layer: entry.layer,
          action,
        }];
      });

      if (orderedEntries.length > 0) {
        return orderedEntries;
      }
    }

    const attachedActionMap = new Map<string, RoundRibbonActionSummary[]>();
    const detachedActions: RoundRibbonActionSummary[] = [];

    localRoundRibbonItems.forEach((action) => {
      if (action.sourceBoardItemId && localBoardItemsById.has(action.sourceBoardItemId)) {
        const existing = attachedActionMap.get(action.sourceBoardItemId) ?? [];
        existing.push(action);
        attachedActionMap.set(action.sourceBoardItemId, existing);
        return;
      }

      detachedActions.push(action);
    });

    return [
      ...localBoardItems.map((item) => ({
        id: `boardItem:${item.id}`,
        kind: 'boardItem' as const,
        orderIndex: item.placementOrderIndex,
        layer: item.placementLayer,
        item,
        attachedActions: attachedActionMap.get(item.id) ?? [],
      })),
      ...detachedActions.map((action) => ({
        id: `roundAction:${action.id}`,
        kind: 'roundAction' as const,
        orderIndex: localBoardItems.length + action.orderIndex,
        layer: action.layer,
        action,
      })),
    ];
  }, [localBoardItems, localBoardItemsById, localRoundRibbonItems, selfBoardModel]);
  const hasLocalBattleRibbonEntries = localBattleRibbonEntries.length > 0;
  const lastResolvedDraftByIntentId = new Map(lastResolvedDraft.map((intent) => [intent.intentId, intent] as const));

  const resolvedTimelineEntries = !lastResolvedRound
    ? []
    : lastResolvedRound.orderedActions.map((action, index) => {
        const draft = lastResolvedDraftByIntentId.get(action.intentId) ?? null;
        const isLocalAction = action.playerId === playerId;

        return {
          order: index + 1,
          action,
          draft,
          ownerLabel: isLocalAction ? 'Ты' : `Игрок ${getPlayerDisplayName(action.playerId)}`,
          title: draft
            ? getIntentLabel(draft)
            : isLocalAction
              ? `Твоё действие ${action.intentId}`
              : 'Скрытое действие соперника',
          subtitle: draft
            ? getIntentTargetLabel(draft)
            : isLocalAction
              ? 'Детали действия не восстановлены локально'
              : 'Скрыто до раскрытия резолва',
        };
      });
  const activeResolvedTimelineEntry =
    resolvedPlaybackIndex >= 0 && resolvedPlaybackIndex < resolvedTimelineEntries.length
      ? resolvedTimelineEntries[resolvedPlaybackIndex]
      : null;
  const activeResolvedOwnerId = activeResolvedTimelineEntry?.action.playerId ?? null;
  const enemyPlaybackEntry =
    activeResolvedTimelineEntry && activeResolvedOwnerId && activeResolvedOwnerId !== playerId
      ? activeResolvedTimelineEntry
      : null;
  const localPlaybackEntry =
    activeResolvedTimelineEntry && activeResolvedOwnerId === playerId
      ? activeResolvedTimelineEntry
      : null;
  const isEnemyHandEmpty = (primaryEnemyBoard?.handSize ?? 0) === 0;
  const isEnemyLaneEmpty = !enemyPlaybackEntry && enemyRibbonBoardItems.length === 0;
  const isLocalLaneEmpty = !localPlaybackEntry && !hasLocalBattleRibbonEntries;
  const activeLocalPlaybackIntentId = localPlaybackEntry?.action.intentId ?? null;
  const activeLocalPlaybackRoundAction =
    activeLocalPlaybackIntentId && selfBoardModel?.roundActions?.length
      ? selfBoardModel.roundActions.find((action) => action.id === activeLocalPlaybackIntentId) ?? null
      : null;
  const activeLocalPlaybackSourceBoardItemId =
    activeLocalPlaybackRoundAction?.source.type === 'boardItem'
      ? activeLocalPlaybackRoundAction.source.boardItemId
      : null;
  const resolvedPlaybackStepLabel = activeResolvedTimelineEntry
    ? `Шаг ${resolvedPlaybackIndex + 1} из ${resolvedTimelineEntries.length}`
    : 'Ожидание playback';
  const localResolvedActionCount = resolvedTimelineEntries.filter((entry) => entry.action.playerId === playerId).length;
  const enemyResolvedActionCount = resolvedTimelineEntries.length - localResolvedActionCount;
  const hasActiveMatchConnection = Boolean(joinedSessionId || matchState);
  const selectedDeckName = savedDecks.find((deck) => deck.id === deckId)?.name ?? 'не выбрана';
  const activeEnemyPlaybackBoardItemId = useMemo(() => {
    if (!enemyPlaybackEntry) {
      return null;
    }

    const matchingItems = enemyRibbonBoardItems.filter((item) => item.placementLayer === enemyPlaybackEntry.action.layer);
    return matchingItems.length === 1 ? matchingItems[0].id : null;
  }, [enemyPlaybackEntry, enemyRibbonBoardItems]);

  const draftRejectionErrorsByIntentId = useMemo(() => {
    const errorMap = new Map<string, RoundDraftRejectedSummary['errors']>();
    if (!roundDraftRejected) {
      return errorMap;
    }

    roundDraftRejected.errors.forEach((entry) => {
      if (isPendingTargetSelectionError(entry)) {
        return;
      }

      if (!entry.intentId) {
        return;
      }

      const existing = errorMap.get(entry.intentId) ?? [];
      existing.push(entry);
      errorMap.set(entry.intentId, existing);
    });

    return errorMap;
  }, [roundDraftRejected]);

  const draftRejectionCommonErrors = useMemo(
    () =>
      roundDraftRejected?.errors.filter((entry) => !entry.intentId && !isPendingTargetSelectionError(entry)) ?? [],
    [roundDraftRejected],
  );
  const shouldShowRoundDraftRejected = Boolean(
    roundDraftRejected &&
      (
        roundDraftRejected.code !== 'validation_failed' ||
        (
          showDiagnostics &&
          roundDraftRejected.errors.some((entry) => !isPendingTargetSelectionError(entry))
        )
      ),
  );
  const visibleRoundDraftRejected = shouldShowRoundDraftRejected ? roundDraftRejected : null;
  const renderIntentValidationErrors = (intentId: string) =>
    !showDiagnostics
      ? null
      : draftRejectionErrorsByIntentId.get(intentId)?.map((entry) => (
          <div key={`${intentId}_${entry.code}_${entry.message}`} className={styles.roundQueueError}>
            <span className={styles.cardBadge}>{entry.code}</span>
            <span>{getRoundDraftValidationCodeLabel(entry.code)}</span>
          </div>
        )) ?? null;

  useEffect(() => {
    if (!selection) {
      return;
    }

    if (selection.kind === 'hand') {
      const stillExists = localHandCards.some((card) => card.instanceId === selection.instanceId);
      if (!stillExists) {
        setSelection(null);
        setDraftTargetId('');
      }
      return;
    }

    const stillExists = creatures.some((creature) => creature.creatureId === selection.creatureId);
    if (!stillExists) {
      setSelection(null);
    }
  }, [creatures, localHandCards, selection]);

  useEffect(() => {
    if (!currentRoundNumber || roundDraft.length === 0) {
      return;
    }

    let changed = false;
    const nextDraft = roundDraft.map((intent) => {
      if (!('target' in intent) || intent.target?.targetId || !intent.target?.targetType) {
        return intent;
      }

      const defaultTargetId = getDefaultTargetIdForType(intent.target.targetType);
      if (!defaultTargetId) {
        return intent;
      }

      changed = true;
      return {
        ...intent,
        target: {
          targetType: intent.target.targetType,
          targetId: defaultTargetId,
        },
      };
    });

    if (changed) {
      syncRoundDraft(nextDraft);
    }
  }, [currentRoundNumber, getDefaultTargetIdForType, roundDraft, syncRoundDraft]);

  const lastDraftRosterSignatureRef = useRef('');

  useEffect(() => {
    if (!playerRosterSignature) {
      lastDraftRosterSignatureRef.current = '';
      return;
    }

    if (!lastDraftRosterSignatureRef.current) {
      lastDraftRosterSignatureRef.current = playerRosterSignature;
      return;
    }

    if (lastDraftRosterSignatureRef.current !== playerRosterSignature) {
      setRoundDraft([]);
      setRoundDraftRejected(null);
      setDraftTargetId('');
      setSelection(null);
      setError('');
      lastDraftRosterSignatureRef.current = playerRosterSignature;
      return;
    }

    lastDraftRosterSignatureRef.current = playerRosterSignature;
  }, [playerRosterSignature]);

  useEffect(() => {
    if (!draftTargetId) {
      return;
    }

    if (!targetCandidates.some((candidate) => candidate.id === draftTargetId)) {
      setDraftTargetId('');
    }
  }, [draftTargetId, targetCandidates]);

  useEffect(() => {
    if (
      !selectedHandCard ||
      !selectedHandCardIntent ||
      selectedHandCardIntent.kind === 'Summon' ||
      !('target' in selectedHandCardIntent) ||
      !selectedCardTargetType ||
      !draftTargetId ||
      Boolean(roundSync?.selfLocked)
    ) {
      return;
    }

    if (
      selectedHandCardIntent.target.targetId === draftTargetId &&
      selectedHandCardIntent.target.targetType === selectedCardTargetType
    ) {
      return;
    }

    syncRoundDraft(
      roundDraft.map((intent) =>
        intent.intentId === selectedHandCardIntent.intentId
          ? {
              ...intent,
              target: {
                targetType: selectedCardTargetType,
                targetId: draftTargetId,
              },
            }
          : intent
      )
    );
  }, [
    draftTargetId,
    roundDraft,
    roundSync?.selfLocked,
    selectedCardTargetType,
    selectedHandCard,
    selectedHandCardIntent,
    syncRoundDraft,
  ]);

  if (!session) {
    return (
      <PageShell
        title="PvP матч"
        subtitle="Для реального PvP сейчас нужен вход в локальный аккаунт."
        actions={<HomeLinkButton />}
      >
        <Card title="Нужна авторизация">
          <div className={styles.noticeBlock}>
            <p className={styles.paragraph}>
              Сначала войди в аккаунт, чтобы использовать свой игровой идентификатор для PvP-сервера.
            </p>
            <div className={styles.inlineActions}>
              <Link className={styles.primaryButton} to={ROUTES.LOGIN}>
                Войти
              </Link>
              <Link className={styles.secondaryButton} to={ROUTES.REGISTER}>
                Создать аккаунт
              </Link>
            </div>
          </div>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="PvP матч"
      subtitle="Минимальный живой экран для подключения к реальному WebSocket-серверу."
      actions={<HomeLinkButton />}
    >
      <div className={styles.workbench}>
        <div className={styles.controlColumn}>
          <Card title="Панель матча" className={styles.themedCard}>
            {hasActiveMatchConnection && !showConnectionControls ? (
              <div className={styles.hudPanel}>
                <div className={styles.hudHeader}>
                  <div>
                    <span className={styles.summaryLabel}>Матч активен</span>
                    <strong className={styles.spotlightValue}>В игре</strong>
                  </div>
                  <span className={styles.cardBadge}>{getConnectionStatusLabel(status)}</span>
                </div>
                <div className={styles.hudGrid}>
                  <div className={styles.hudTile}>
                    <span className={styles.summaryLabel}>Сессия</span>
                    <strong>{joinedSessionId || sessionId}</strong>
                  </div>
                  <div className={styles.hudTile}>
                    <span className={styles.summaryLabel}>Режим</span>
                    <strong>{mode === 'create' ? 'Создатель' : 'Подключение'}</strong>
                  </div>
                  <div className={styles.hudTile}>
                    <span className={styles.summaryLabel}>Колода</span>
                    <strong>{selectedDeckName}</strong>
                  </div>
                  <div className={styles.hudTile}>
                    <span className={styles.summaryLabel}>Игрок</span>
                    <strong>{localDisplayName}</strong>
                  </div>
                </div>
                <div className={styles.inlineActions}>
                  <button className={styles.primaryButton} type="button" onClick={() => setShowConnectionControls(true)}>
                    Параметры подключения
                  </button>
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    onClick={handleDisconnect}
                    disabled={status === 'idle' || status === 'disconnected'}
                  >
                    Отключиться
                  </button>
                </div>
                <div className={styles.hint}>Форма подключения скрыта, чтобы не перегружать экран во время матча.</div>
              </div>
            ) : (
              <form className={styles.formGrid} onSubmit={submitJoin}>
                <div className={styles.segmentedRow}>
                  <button
                    className={mode === 'create' ? styles.segmentActive : styles.segmentButton}
                    type="button"
                    onClick={() => setMode('create')}
                  >
                    Создать матч
                  </button>
                  <button
                    className={mode === 'join' ? styles.segmentActive : styles.segmentButton}
                    type="button"
                    onClick={() => setMode('join')}
                  >
                    Войти в матч
                  </button>
                </div>

                <label className={styles.formRow}>
                  <span className={styles.label}>Игрок</span>
                  <input className={styles.input} type="text" value={localDisplayName} readOnly />
                </label>

                <label className={styles.formRow}>
                  <span className={styles.label}>Сессия</span>
                  <div className={styles.inlineField}>
                    <input
                      className={styles.input}
                      type="text"
                      value={sessionId}
                      onChange={(event) => setSessionId(event.target.value)}
                      placeholder="session_..."
                    />
                    <button
                      className={styles.secondaryButton}
                      type="button"
                      onClick={() => setSessionId(buildSessionId())}
                    >
                      Сгенерировать
                    </button>
                  </div>
                </label>

                <label className={styles.formRow}>
                  <span className={styles.label}>Seed матча</span>
                  <input
                    className={styles.input}
                    type="number"
                    value={seed}
                    onChange={(event) => setSeed(event.target.value)}
                    disabled={mode === 'join'}
                  />
                </label>

                <label className={styles.formRow}>
                  <span className={styles.label}>Колода</span>
                  <select
                    className={styles.input}
                    value={deckId}
                    onChange={(event) => setDeckId(event.target.value)}
                    disabled={isDecksLoading || savedDecks.length === 0}
                  >
                    <option value="">Выбери колоду</option>
                    {savedDecks.map((deck) => (
                      <option key={deck.id} value={deck.id}>
                        {deck.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className={styles.formActions}>
                  <button className={styles.primaryButton} type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Подключаемся...' : mode === 'create' ? 'Создать и подключиться' : 'Войти в матч'}
                  </button>
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    onClick={handleDisconnect}
                    disabled={status === 'idle' || status === 'disconnected'}
                  >
                    Отключиться
                  </button>
                  {hasActiveMatchConnection ? (
                    <button className={styles.secondaryButton} type="button" onClick={() => setShowConnectionControls(false)}>
                      Свернуть в HUD
                    </button>
                  ) : null}
                </div>

                <div className={styles.hintBlock}>
                  <div className={styles.hint}>Соединение: {getConnectionStatusLabel(status)}</div>
                  <div className={styles.hint}>
                    Активная сессия: {joinedSessionId || 'ещё не подключено'}
                  </div>
                  <div className={styles.hint}>Выбранная колода: {selectedDeckName}</div>
                  {mode === 'join' ? (
                    <div className={styles.hint}>В режиме входа seed не отправляется — используется seed создателя матча.</div>
                  ) : null}
                  {isDecksLoading ? (
                    <div className={styles.hint}>Загружаем доступные колоды...</div>
                  ) : null}
                </div>
              </form>
            )}

            {transportRejected ? (
              <div className={styles.roundRejectBox}>
                <strong>
                  Сервер отклонил сообщение {transportRejected.requestType ? `для ${transportRejected.requestType}` : 'без типа'}
                </strong>
                <div className={styles.roundQueueError}>
                  <span className={styles.cardBadge}>{transportRejected.code}</span>
                  <span>{getTransportRejectCodeLabel(transportRejected.code)}</span>
                </div>
                <span>{transportRejected.error}</span>
              </div>
            ) : null}
            {joinRejected ? (
              <div className={styles.roundRejectBox}>
                <strong>
                  Сервер отклонил вход {joinRejected.sessionId ? `в сессию ${joinRejected.sessionId}` : 'в матч'}
                </strong>
                <div className={styles.roundQueueError}>
                  <span className={styles.cardBadge}>{joinRejected.code}</span>
                  <span>{getJoinRejectCodeLabel(joinRejected.code)}</span>
                </div>
                <span>{joinRejected.error}</span>
              </div>
            ) : null}
            {error ? <div className={styles.errorBox}>{error}</div> : null}
          </Card>
        </div>

        <div className={styles.boardColumn}>
          <Card
            title="Игровое поле"
            className={styles.boardCard}
            contentClassName={styles.boardCardContent}
          >
            {matchSummary ? (
              <div className={styles.matchOverview}>
                <div className={styles.battlefield}>
                  <section className={styles.boardShell}>
                    <aside className={styles.boardSideColumn}>
                      <div className={`${styles.playerSideCard} ${isEnemySideActive ? styles.playerSideCardActive : ''}`.trim()}>
                        <span className={styles.playerSideLabel}>Соперник</span>
                        <button
                          className={`${styles.avatarTargetButton} ${primaryEnemyBoard?.characterId && isSelectableTarget(primaryEnemyBoard.characterId) ? styles.selectionSurfaceTargetable : ''} ${primaryEnemyBoard?.characterId && isDraftTargetActive(primaryEnemyBoard.characterId) ? styles.selectionSurfaceTargetActive : ''}`.trim()}
                          aria-label={getTargetButtonAriaLabel(`Маг ${primaryEnemyDisplayName || 'соперника'}`, Boolean(primaryEnemyBoard?.characterId && isSelectableTarget(primaryEnemyBoard.characterId)))}
                          type="button"
                          onClick={() => {
                            const enemyCharacterId = primaryEnemyBoard?.characterId;
                            if (enemyCharacterId && isSelectableTarget(enemyCharacterId)) {
                              setDraftTargetId(enemyCharacterId);
                            }
                          }}
                        >
                          <div
                            className={`${styles.playerPortraitFrame} ${getCharacterAccentClassName(enemyCharacter?.faculty)}`.trim()}
                          >
                            <div
                              className={`${styles.playerPortraitSilhouette} ${getCharacterAccentClassName(enemyCharacter?.faculty)}`.trim()}
                            >
                              {getCharacterInitials(enemyCharacter?.name ?? 'P1')}
                            </div>
                          </div>
                          <div className={styles.playerIdentity}>
                            <strong>{enemyCharacter?.name ?? 'Ожидание соперника'}</strong>
                            <span>{primaryEnemyDisplayName || 'Подключится позже'}</span>
                            <span>
                              {primaryEnemyBoard
                                ? getCharacterStatusLabel(enemyCharacter, primaryEnemyBoard.mana, primaryEnemyBoard.maxMana)
                                : 'Персонаж появится после подключения'}
                            </span>
                          </div>
                        </button>
                      </div>

                      <div className={`${styles.deckRail} ${styles.deckRailVertical} ${isEnemySideActive ? styles.deckRailActive : ''}`.trim()}>
                        <div className={styles.deckRailHeader}>
                          <span className={styles.summaryLabel}>Колода соперника</span>
                          <span className={styles.deckRailMeta}>
                            Колода: {primaryEnemyBoard?.deckSize ?? 0} · Рука: {primaryEnemyBoard?.handSize ?? 0}
                          </span>
                        </div>
                        <div className={styles.deckRailCards} aria-hidden="true">
                          {Array.from({ length: getDeckVisualCount(primaryEnemyBoard?.deckSize ?? 0) }).map((_, index, array) => (
                            <span
                              key={`enemy-deck-${index}`}
                              className={`${styles.deckCardBack} ${index === array.length - 1 ? styles.deckCardBackTop : ''}`.trim()}
                            />
                          ))}
                        </div>
                      </div>
                      <div className={styles.turnActionRail}>
                        <span className={styles.summaryLabel}>
                          Раунд {matchSummary.roundNumber} · {getRoundStatusLabel(matchSummary.roundStatus)}
                        </span>
                        <button
                          className={`${styles.primaryButton} ${styles.turnActionButton}`.trim()}
                          type="button"
                          onClick={handleLockRound}
                          disabled={!canLockRound}
                        >
                          {roundSync?.selfLocked ? 'Ждём ход соперника' : 'Завершить ход'}
                        </button>
                        <div className={styles.turnActionStatus}>
                          <span>
                            Ты: <strong>{roundSync?.selfLocked ? 'Готово' : 'Собираешь ленту'}</strong>
                          </span>
                          <span>
                            Соперник: <strong>{roundSync?.opponentLocked ? 'Готово' : 'Выбирает'}</strong>
                          </span>
                          {pendingTargetSelectionCount > 0 ? (
                            <span>
                              Выбери цель для <strong>{pendingTargetSelectionCount}</strong>{' '}
                              {pendingTargetSelectionCount === 1 ? 'карты' : 'карт'}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className={`${styles.deckRail} ${styles.deckRailVertical} ${isLocalSideActive ? styles.deckRailActive : ''}`.trim()}>
                        <div className={styles.deckRailHeader}>
                          <span className={styles.summaryLabel}>Твоя колода</span>
                          <span className={styles.deckRailMeta}>
                            Колода: {localBoard?.deckSize ?? 0} · Рука: {localBoard?.handSize ?? 0}
                          </span>
                        </div>
                        <div className={styles.deckRailCards} aria-hidden="true">
                          {Array.from({ length: getDeckVisualCount(localBoard?.deckSize ?? 0) }).map((_, index, array) => (
                            <span
                              key={`local-deck-${index}`}
                              className={`${styles.deckCardBack} ${index === array.length - 1 ? styles.deckCardBackTop : ''}`.trim()}
                            />
                          ))}
                        </div>
                      </div>

                      <div className={`${styles.playerSideCard} ${isLocalSideActive ? styles.playerSideCardActive : ''}`.trim()}>
                        <span className={styles.playerSideLabel}>Ты</span>
                        <button
                          className={`${styles.avatarTargetButton} ${localPlayer && isSelectableTarget(localPlayer.characterId) ? styles.selectionSurfaceTargetable : ''} ${localPlayer && isDraftTargetActive(localPlayer.characterId) ? styles.selectionSurfaceTargetActive : ''}`.trim()}
                          aria-label={getTargetButtonAriaLabel('Твой маг', Boolean(localPlayer && isSelectableTarget(localPlayer.characterId)))}
                          type="button"
                          onClick={() => {
                            if (localPlayer && isSelectableTarget(localPlayer.characterId)) {
                              setDraftTargetId(localPlayer.characterId);
                            }
                          }}
                        >
                          <div
                            className={`${styles.playerPortraitFrame} ${getCharacterAccentClassName(localCharacter?.faculty, true)}`.trim()}
                          >
                            <div
                              className={`${styles.playerPortraitSilhouette} ${styles.playerPortraitSilhouetteLocal} ${getCharacterAccentClassName(localCharacter?.faculty, true)}`.trim()}
                            >
                              {getCharacterInitials(localCharacter?.name ?? 'P2')}
                            </div>
                          </div>
                          <div className={styles.playerIdentity}>
                            <strong>{localCharacter?.name ?? 'Твой персонаж'}</strong>
                            <span>{localDisplayName}</span>
                            <span>
                              {localPlayer
                                ? getCharacterStatusLabel(localCharacter, localPlayer.mana, localPlayer.maxMana)
                                : 'Данные ещё не пришли'}
                            </span>
                          </div>
                        </button>
                      </div>
                    </aside>

                    <section className={styles.fieldFrame}>
                  <section className={`${styles.handTray} ${styles.opponentHandTray} ${isEnemyHandEmpty ? styles.compactZone : ''}`.trim()}>
                    <div className={styles.battleLaneHeader}>
                      <div>
                        <span className={styles.summaryLabel}>Рука соперника</span>
                        <strong>Карты оппонента</strong>
                      </div>
                      <span className={styles.battleCount}>{primaryEnemyBoard?.handSize ?? 0} карт</span>
                    </div>
                    {(primaryEnemyBoard?.handSize ?? 0) > 0 ? (
                      <div className={styles.opponentHandFanGrid} aria-hidden="true">
                        {Array.from({ length: primaryEnemyBoard?.handSize ?? 0 }).map((_, index) => (
                          <div key={`enemy-hand-${index}`} className={styles.opponentHandCard}>
                            <span className={styles.opponentHandCardBack} />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className={styles.emptyState}>У соперника пока нет карт в руке.</div>
                    )}
                  </section>

                  <section className={`${styles.battleLane} ${isEnemySideActive ? styles.battleLaneActive : ''} ${isEnemyLaneEmpty ? styles.compactZone : ''}`.trim()}>
                    <div className={styles.battleLaneHeader}>
                      <div>
                        <strong>{primaryEnemyDisplayName || 'Ожидание соперника'}</strong>
                      </div>
                    </div>
                    {enemyPlaybackEntry ? (
                      <div className={`${styles.ribbonCard} ${styles.ribbonCardPlayback}`.trim()} data-testid="enemy-resolution-playback-card">
                        <div className={styles.ribbonHeader}>
                          <div>
                            <span className={styles.summaryLabel}>Резолв сейчас</span>
                            <strong>{enemyPlaybackEntry.title}</strong>
                          </div>
                          <div className={styles.ribbonBadgeRow}>
                            <span className={styles.cardBadge}>{resolvedPlaybackStepLabel}</span>
                            <span className={styles.cardBadge}>{enemyPlaybackEntry.action.status}</span>
                          </div>
                        </div>
                        <span>{enemyPlaybackEntry.subtitle}</span>
                        <div className={styles.ribbonBadgeRow}>
                          <span className={styles.cardBadge}>{getResolutionLayerLabel(enemyPlaybackEntry.action.layer)}</span>
                          <span className={styles.cardBadge}>{getRoundActionReasonLabel(enemyPlaybackEntry.action.reasonCode)}</span>
                        </div>
                        <span className={styles.hint}>{enemyPlaybackEntry.action.summary}</span>
                      </div>
                    ) : null}
                    {enemyRibbonBoardItems.length > 0 ? (
                      <div className={styles.ribbonSection}>
                        <span className={styles.summaryLabel}>Боевая лента соперника</span>
                        <div className={styles.ribbonGrid}>
                          {enemyRibbonBoardItems.map((item) => {
                            const isEnemyPlaybackItemActive = activeEnemyPlaybackBoardItemId === item.id;

                            return (
                              item.subtype === 'creature' ? (
                                <div
                                  key={item.id}
                                  className={`${styles.ribbonCard} ${isEnemyPlaybackItemActive ? styles.ribbonCardPlaybackActive : ''}`.trim()}
                                  data-testid={isEnemyPlaybackItemActive ? 'enemy-playback-highlight-item' : undefined}
                                >
                                  <button
                                    className={`${styles.selectionSurface} ${selection?.kind === 'creature' && selection.creatureId === item.runtimeId ? styles.selectionSurfaceActive : ''} ${isSelectableTarget(item.runtimeId) ? styles.selectionSurfaceTargetable : ''} ${isDraftTargetActive(item.runtimeId) ? styles.selectionSurfaceTargetActive : ''}`.trim()}
                                    aria-label={getTargetButtonAriaLabel(`Существо ${item.runtimeId}`, isSelectableTarget(item.runtimeId))}
                                    type="button"
                                    onClick={() =>
                                      isSelectableTarget(item.runtimeId)
                                        ? setDraftTargetId(item.runtimeId)
                                        : setSelection({ kind: 'creature', creatureId: item.runtimeId })
                                    }
                                  >
                                    <div className={styles.ribbonHeader}>
                                      <div>
                                        <span className={styles.summaryLabel}>Существо соперника</span>
                                        <strong>{item.title}</strong>
                                      </div>
                                      <div className={styles.ribbonBadgeRow}>
                                        <span className={styles.cardBadge}>{item.lifetimeType === 'persistent' ? 'Закреплено' : 'Раунд'}</span>
                                        <span className={styles.cardBadge}>{getResolutionLayerLabel(item.placementLayer)}</span>
                                        <span className={styles.cardBadge}>Соперник</span>
                                      </div>
                                    </div>
                                    <span className={styles.hint}>{item.runtimeId}</span>
                                    <div className={styles.ribbonStats}>
                                      <span>HP {item.hp ?? 0}/{item.maxHp ?? 0}</span>
                                      <span>ATK {item.attack ?? 0}</span>
                                      <span>SPD {item.speed ?? 0}</span>
                                    </div>
                                  </button>
                                </div>
                              ) : (
                                <div
                                  key={item.id}
                                  className={`${styles.ribbonCard} ${styles.ribbonCardEffect} ${isEnemyPlaybackItemActive ? styles.ribbonCardPlaybackActive : ''}`.trim()}
                                  data-testid={isEnemyPlaybackItemActive ? 'enemy-playback-highlight-item' : undefined}
                                >
                                  <div className={styles.ribbonHeader}>
                                    <div>
                                      <span className={styles.summaryLabel}>Эффект соперника</span>
                                      <strong>{item.title}</strong>
                                    </div>
                                    <div className={styles.ribbonBadgeRow}>
                                      <span className={styles.cardBadge}>{item.lifetimeType === 'persistent' ? 'Закреплено' : 'Раунд'}</span>
                                      <span className={styles.cardBadge}>{getResolutionLayerLabel(item.placementLayer)}</span>
                                      {item.duration !== undefined ? <span className={styles.cardBadge}>{getDurationLabel(item.duration)}</span> : null}
                                    </div>
                                  </div>
                                  <span className={styles.hint}>{item.subtitle}</span>
                                </div>
                              )
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className={styles.emptyState}>Пока пусто. Здесь появятся закреплённые сущности и эффекты соперника.</div>
                    )}
                  </section>

                  <section className={`${styles.battleLane} ${isLocalSideActive ? styles.battleLaneActive : ''} ${isLocalLaneEmpty ? styles.compactZone : ''}`.trim()}>
                    <div className={styles.battleLaneHeader}>
                      <div>
                        <strong>{localDisplayName}</strong>
                      </div>
                    </div>
                    {localPlaybackEntry ? (
                      <div className={`${styles.ribbonCard} ${styles.ribbonCardPlayback}`.trim()} data-testid="local-resolution-playback-card">
                        <div className={styles.ribbonHeader}>
                          <div>
                            <span className={styles.summaryLabel}>Резолв сейчас</span>
                            <strong>{localPlaybackEntry.title}</strong>
                          </div>
                          <div className={styles.ribbonBadgeRow}>
                            <span className={styles.cardBadge}>{resolvedPlaybackStepLabel}</span>
                            <span className={styles.cardBadge}>
                              {getRoundActionStatusDisplay(localPlaybackEntry.action.status)} · {localPlaybackEntry.action.status}
                            </span>
                          </div>
                        </div>
                        <span>{localPlaybackEntry.subtitle}</span>
                        <div className={styles.ribbonBadgeRow}>
                          <span className={styles.cardBadge}>{getResolutionLayerLabel(localPlaybackEntry.action.layer)}</span>
                          <span className={styles.cardBadge}>{getRoundActionReasonLabel(localPlaybackEntry.action.reasonCode)}</span>
                        </div>
                        <span className={styles.hint}>{localPlaybackEntry.action.summary}</span>
                      </div>
                    ) : null}
                    {hasLocalBattleRibbonEntries ? (
                      <div className={styles.ribbonSection}>
                        <span className={styles.summaryLabel}>Твоя боевая лента</span>
                        <div className={styles.ribbonGrid}>
                          {localBattleRibbonEntries.map((entry) => {
                            if (entry.kind === 'boardItem') {
                              const { item, attachedActions } = entry;
                              const isSelectedBoardCreature =
                                item.subtype === 'creature' &&
                                selection?.kind === 'creature' &&
                                selection.creatureId === item.runtimeId;
                              const isPlaybackBoardItemActive = activeLocalPlaybackSourceBoardItemId === item.id;
                              const localCardClassName = [
                                styles.ribbonCard,
                                item.subtype === 'effect' ? styles.ribbonCardEffect : styles.ribbonCardLocal,
                                attachedActions.length > 0 ? styles.ribbonCardActive : '',
                                isPlaybackBoardItemActive ? styles.ribbonCardPlaybackActive : '',
                              ]
                                .filter(Boolean)
                                .join(' ');

                              return item.subtype === 'creature' ? (
                                <div key={entry.id} className={localCardClassName}>
                                  <button
                                    className={`${styles.selectionSurface} ${selection?.kind === 'creature' && selection.creatureId === item.runtimeId ? styles.selectionSurfaceActive : ''} ${isSelectableTarget(item.runtimeId) ? styles.selectionSurfaceTargetable : ''} ${isDraftTargetActive(item.runtimeId) ? styles.selectionSurfaceTargetActive : ''}`.trim()}
                                    aria-label={getTargetButtonAriaLabel(`Существо ${item.runtimeId}`, isSelectableTarget(item.runtimeId))}
                                    type="button"
                                    onClick={() =>
                                      isSelectableTarget(item.runtimeId)
                                        ? setDraftTargetId(item.runtimeId)
                                        : setSelection({ kind: 'creature', creatureId: item.runtimeId })
                                    }
                                  >
                                    <div className={styles.ribbonHeader}>
                                      <div>
                                        <span className={styles.summaryLabel}>Существо на поле</span>
                                        <strong>{item.title}</strong>
                                      </div>
                                      <div className={styles.ribbonBadgeRow}>
                                        <span className={styles.cardBadge}>{item.lifetimeType === 'persistent' ? 'Закреплено' : 'Раунд'}</span>
                                        <span className={styles.cardBadge}>{getResolutionLayerLabel(item.placementLayer)}</span>
                                        <span className={styles.cardBadge}>Твоё</span>
                                        {attachedActions.length > 0 ? (
                                          <span className={styles.cardBadge}>Активно: {attachedActions.length}</span>
                                        ) : null}
                                      </div>
                                    </div>
                                    <span className={styles.hint}>{item.runtimeId}</span>
                                    <div className={styles.ribbonStats}>
                                      <span>HP {item.hp ?? 0}/{item.maxHp ?? 0}</span>
                                      <span>ATK {item.attack ?? 0}</span>
                                      <span>SPD {item.speed ?? 0}</span>
                                    </div>
                                  </button>
                                  {attachedActions.length > 0 ? (
                                    <div className={styles.ribbonActionStack}>
                                      <span className={styles.summaryLabel}>Активность в раунде</span>
                                      {attachedActions.map((action) => (
                                        <div
                                          key={`${item.id}_${action.id}`}
                                          className={`${styles.ribbonInlineAction} ${getRibbonActionToneClassName(action.layer)} ${activeLocalPlaybackIntentId === action.id ? styles.ribbonInlineActionActive : ''}`.trim()}
                                          data-testid={activeLocalPlaybackIntentId === action.id ? 'local-playback-inline-action' : undefined}
                                        >
                                          <div className={styles.ribbonBadgeRow}>
                                            <span className={`${styles.cardBadge} ${getActionToneBadgeClassName(action.layer)}`.trim()}>{action.modeLabel}</span>
                                            <span className={styles.cardBadge}>Шаг #{action.orderIndex + 1}</span>
                                            <span className={styles.cardBadge}>{action.statusLabel}</span>
                                            <span className={styles.cardBadge}>{getResolutionLayerLabel(action.layer)}</span>
                                          </div>
                                          <div className={styles.ribbonActionText}>
                                            <strong>{action.title}</strong>
                                            <span>{action.subtitle}</span>
                                          </div>
                                          <div className={`${styles.ribbonActionCallout} ${getActionCalloutToneClassName(action.layer)}`.trim()}>
                                            <span className={styles.ribbonActionCalloutMode}>Сейчас выбрано</span>
                                            <strong className={styles.ribbonActionCalloutFocus}>{action.focusLabel}</strong>
                                          </div>
                                          {action.targetLabel ? (
                                            <div className={styles.ribbonBadgeRow}>
                                              <span className={`${styles.cardBadge} ${styles.cardBadgeTarget}`.trim()}>
                                                Цель: {action.targetLabel}
                                              </span>
                                            </div>
                                          ) : null}
                                          {renderIntentValidationErrors(action.id)}
                                          <div className={styles.inlineActions}>
                                            <button
                                              className={styles.secondaryButton}
                                              type="button"
                                              onClick={() => handleRemoveRoundIntent(action.id)}
                                              disabled={Boolean(roundSync?.selfLocked)}
                                            >
                                              Убрать из ленты
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                  {isSelectedBoardCreature && item.ownerId === playerId ? (
                                    <div className={styles.inlineConfigurator}>
                                      <div className={styles.indicatorRail}>
                                        <div className={styles.indicatorPill}>
                                          <span className={styles.indicatorKicker}>Режим</span>
                                          <strong className={styles.indicatorValue}>{selectedCreatureActionStatusLabel}</strong>
                                        </div>
                                        <div className={styles.indicatorPill}>
                                          <span className={styles.indicatorKicker}>Текущая цель</span>
                                          <strong className={styles.indicatorValue}>{selectedAttackTargetLabel}</strong>
                                        </div>
                                      </div>
                                      <div className={styles.indicatorRail}>
                                        <button
                                          aria-label="Добавить уклонение в ленту"
                                          className={`${styles.indicatorButton} ${styles.indicatorButtonDefensive}`.trim()}
                                          type="button"
                                          onClick={handleQueueEvade}
                                          disabled={!canQueueEvade || Boolean(roundSync?.selfLocked)}
                                        >
                                          <span className={styles.indicatorKicker}>Действие</span>
                                          <strong className={styles.indicatorValue}>Уклонение</strong>
                                        </button>
                                        <button
                                          aria-label="Добавить атаку в ленту"
                                          className={`${styles.indicatorButton} ${styles.indicatorButtonOffensive}`.trim()}
                                          type="button"
                                          onClick={handleQueueAttack}
                                          disabled={!canQueueAttack || Boolean(roundSync?.selfLocked)}
                                        >
                                          <span className={styles.indicatorKicker}>Действие</span>
                                          <strong className={styles.indicatorValue}>Атака</strong>
                                          <span className={styles.indicatorSubvalue}>{selectedAttackTargetLabel}</span>
                                        </button>
                                        <button
                                          className={styles.secondaryButton}
                                          type="button"
                                          onClick={() => setDraftTargetId('')}
                                          disabled={!draftTargetId}
                                        >
                                          Сбросить цель
                                        </button>
                                      </div>
                                      <div className={styles.hint}>
                                        Сменить цель можно только кликом по подсвеченной сущности прямо на поле.
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <div key={entry.id} className={localCardClassName}>
                                  <div className={styles.ribbonHeader}>
                                    <div>
                                      <span className={styles.summaryLabel}>Эффект на поле</span>
                                      <strong>{item.title}</strong>
                                    </div>
                                    <div className={styles.ribbonBadgeRow}>
                                      <span className={styles.cardBadge}>{item.lifetimeType === 'persistent' ? 'Закреплено' : 'Раунд'}</span>
                                      <span className={styles.cardBadge}>{getResolutionLayerLabel(item.placementLayer)}</span>
                                      {item.duration !== undefined ? <span className={styles.cardBadge}>{getDurationLabel(item.duration)}</span> : null}
                                      {attachedActions.length > 0 ? (
                                        <span className={styles.cardBadge}>Активно: {attachedActions.length}</span>
                                      ) : null}
                                    </div>
                                  </div>
                                  <span className={styles.hint}>{item.subtitle}</span>
                                  {attachedActions.length > 0 ? (
                                    <div className={styles.ribbonActionStack}>
                                      <span className={styles.summaryLabel}>Активность в раунде</span>
                                      {attachedActions.map((action) => (
                                        <div
                                          key={`${item.id}_${action.id}`}
                                          className={`${styles.ribbonInlineAction} ${getRibbonActionToneClassName(action.layer)} ${activeLocalPlaybackIntentId === action.id ? styles.ribbonInlineActionActive : ''}`.trim()}
                                          data-testid={activeLocalPlaybackIntentId === action.id ? 'local-playback-inline-action' : undefined}
                                        >
                                          <div className={styles.ribbonBadgeRow}>
                                            <span className={`${styles.cardBadge} ${getActionToneBadgeClassName(action.layer)}`.trim()}>{action.modeLabel}</span>
                                            <span className={styles.cardBadge}>Шаг #{action.orderIndex + 1}</span>
                                            <span className={styles.cardBadge}>{action.statusLabel}</span>
                                            <span className={styles.cardBadge}>{getResolutionLayerLabel(action.layer)}</span>
                                          </div>
                                          <div className={styles.ribbonActionText}>
                                            <strong>{action.title}</strong>
                                            <span>{action.subtitle}</span>
                                          </div>
                                          <div className={`${styles.ribbonActionCallout} ${getActionCalloutToneClassName(action.layer)}`.trim()}>
                                            <span className={styles.ribbonActionCalloutMode}>Сейчас выбрано</span>
                                            <strong className={styles.ribbonActionCalloutFocus}>{action.focusLabel}</strong>
                                          </div>
                                          {action.targetLabel ? (
                                            <div className={styles.ribbonBadgeRow}>
                                              <span className={`${styles.cardBadge} ${styles.cardBadgeTarget}`.trim()}>
                                                Цель: {action.targetLabel}
                                              </span>
                                            </div>
                                          ) : null}
                                          {renderIntentValidationErrors(action.id)}
                                          <div className={styles.inlineActions}>
                                            <button
                                              className={styles.secondaryButton}
                                              type="button"
                                              onClick={() => handleRemoveRoundIntent(action.id)}
                                              disabled={Boolean(roundSync?.selfLocked)}
                                            >
                                              Убрать из ленты
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            }

                            const action = entry.action;
                            const ribbonTargetOptions = action.targetType ? getRibbonTargetOptions(action.targetType) : [];
                            const canAdjustActionTarget = action.sourceType === 'card' && ribbonTargetOptions.length > 0;

                            return (
                              <div
                                key={entry.id}
                                className={`${styles.ribbonCard} ${styles.ribbonCardAction} ${getRibbonActionToneClassName(action.layer)} ${activeLocalPlaybackIntentId === action.id ? styles.ribbonCardPlaybackActive : ''}`.trim()}
                                data-testid={activeLocalPlaybackIntentId === action.id ? 'local-playback-action-card' : undefined}
                              >
                                <div className={styles.ribbonActionLayout}>
                                  {canAdjustActionTarget ? (
                                    <div className={styles.ribbonTargetTabs} aria-label="Выбор цели для действия">
                                      {ribbonTargetOptions.map((candidate) => (
                                        <button
                                          key={`${action.id}_${candidate.id}`}
                                          className={`${styles.ribbonTargetTab} ${action.targetId === candidate.id ? styles.ribbonTargetTabActive : ''}`.trim()}
                                          type="button"
                                          aria-label={getRibbonTargetTabAriaLabel(candidate.label)}
                                          onClick={() => handleRoundIntentTargetSelect(action.id, action.targetType!, candidate.id)}
                                          disabled={Boolean(roundSync?.selfLocked)}
                                        >
                                          <span className={styles.ribbonTargetTabIcon}>{candidate.compactLabel}</span>
                                        </button>
                                      ))}
                                    </div>
                                  ) : null}
                                  <div className={styles.ribbonActionBody}>
                                    <div className={styles.ribbonHeader}>
                                      <div className={styles.ribbonActionMain}>
                                        <strong>{action.title}</strong>
                                      </div>
                                      <div className={styles.ribbonBadgeRow}>
                                        <span className={`${styles.cardBadge} ${getActionToneBadgeClassName(action.layer)}`.trim()}>{action.modeLabel}</span>
                                        {showDiagnostics ? (
                                          <>
                                            <span className={styles.cardBadge}>Шаг #{action.orderIndex + 1}</span>
                                            <span className={styles.cardBadge}>{action.statusLabel}</span>
                                          </>
                                        ) : null}
                                      </div>
                                    </div>
                                    {action.cardSpeed || action.effectSummary ? (
                                      <div className={styles.ribbonActionDetails}>
                                        {action.cardSpeed ? <span className={styles.handStatPill}>SPD {action.cardSpeed}</span> : null}
                                        {action.effectSummary ? (
                                          <span className={styles.ribbonActionEffect}>{action.effectSummary}</span>
                                        ) : null}
                                      </div>
                                    ) : null}
                                    {showDiagnostics ? (
                                      <div className={`${styles.ribbonActionCallout} ${getActionCalloutToneClassName(action.layer)}`.trim()}>
                                        <span className={styles.ribbonActionCalloutMode}>
                                          {canAdjustActionTarget ? 'Выбранная цель' : 'Сейчас выбрано'}
                                        </span>
                                        <strong className={styles.ribbonActionCalloutFocus}>
                                          {action.targetLabel ?? action.focusLabel}
                                        </strong>
                                      </div>
                                    ) : null}
                                    <span className={styles.ribbonActionAssistive}>
                                      {action.targetLabel ?? action.subtitle}
                                    </span>
                                    {renderIntentValidationErrors(action.id)}
                                    {showDiagnostics ? (
                                      <div className={styles.ribbonBadgeRow}>
                                        <span className={styles.cardBadge}>{getResolutionLayerLabel(action.layer)}</span>
                                        {action.targetLabel ? (
                                          <span className={`${styles.cardBadge} ${styles.cardBadgeTarget}`.trim()}>
                                            Цель: {action.targetLabel}
                                          </span>
                                        ) : null}
                                      </div>
                                    ) : null}
                                    <div className={styles.inlineActions}>
                                      <button
                                        className={styles.secondaryButton}
                                        type="button"
                                        onClick={() => handleRemoveRoundIntent(action.id)}
                                        disabled={Boolean(roundSync?.selfLocked)}
                                      >
                                        Убрать из ленты
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className={styles.emptyState}>Пока пусто. Разыграй карту из руки или активируй объект поля.</div>
                    )}
                  </section>

                  {visibleRoundDraftRejected ? (
                    <div className={styles.roundRejectBox}>
                      <strong>
                        Сервер отклонил: {visibleRoundDraftRejected.operation === 'lock' ? 'завершение хода' : 'обновление'}{' '}
                        {visibleRoundDraftRejected.roundNumber > 0
                          ? `раунда ${visibleRoundDraftRejected.roundNumber}`
                          : 'текущей ленты'}
                      </strong>
                      <div className={styles.roundQueueError}>
                        <span className={styles.cardBadge}>{visibleRoundDraftRejected.code}</span>
                        <span>{getRoundDraftRejectCodeLabel(visibleRoundDraftRejected.code)}</span>
                      </div>
                      <span>{visibleRoundDraftRejected.error}</span>
                      {draftRejectionCommonErrors.map((entry) => (
                        <div key={`${entry.code}_${entry.message}`} className={styles.roundQueueError}>
                          <span className={styles.cardBadge}>{entry.code}</span>
                          <span>{getRoundDraftValidationCodeLabel(entry.code)}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className={styles.hint}>
                    Порядок в боевой ленте показывает только текущий замысел. Во время разыгрывания шаги всё равно идут по боевым слоям.
                  </div>

                  <section className={styles.handTray}>
                      <div className={styles.battleLaneHeader}>
                        <div>
                          <span className={styles.summaryLabel}>Твоя рука</span>
                          <strong>Карты для текущего раунда</strong>
                        </div>
                        <span className={styles.battleCount}>{availableHandCards.length} карт</span>
                      </div>
                      {availableHandCards.length > 0 ? (
                        <div className={styles.handFanGrid}>
                          {availableHandCards.map((card) => (
                            <div
                              key={card.instanceId}
                              className={`${styles.handCard} ${card.cardType === 'summon' ? styles.handCardPlayable : ''} ${getCardAccentClassName(card.cardType)}`.trim()}
                            >
                              <button
                                className={`${styles.selectionSurface} ${selection?.kind === 'hand' && selection.instanceId === card.instanceId ? styles.selectionSurfaceActive : ''}`.trim()}
                                type="button"
                                onClick={() => handleHandCardClick(card)}
                              >
                                <div
                                  className={`${styles.handCardArtwork} ${getCardSchoolAccentClassName(card.school)}`.trim()}
                                >
                                  <div className={styles.handCardTop}>
                                    <span className={styles.handManaGem}>{card.mana}</span>
                                    <div className={styles.handCardBadgeStack}>
                                      <span className={styles.cardBadge}>{getCardTypeLabel(card.cardType)}</span>
                                      {card.school ? (
                                        <span className={styles.cardBadge}>{getCatalogSchoolLabel(card.school)}</span>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                                <div className={styles.handCardBody}>
                                  <strong className={styles.handCardTitle}>{card.name}</strong>
                                  {(card.hp || card.attack || card.speed) ? (
                                    <div className={styles.handCardStats}>
                                      {card.hp ? <span className={styles.handStatPill}>HP {card.hp}</span> : null}
                                      {card.attack ? <span className={styles.handStatPill}>ATK {card.attack}</span> : null}
                                      {card.speed ? <span className={styles.handStatPill}>SPD {card.speed}</span> : null}
                                    </div>
                                  ) : null}
                                  {card.effect ? (
                                    <span className={styles.handCardEffect}>{card.effect}</span>
                                  ) : (
                                    <span className={styles.handCardSubtitle}>
                                      {card.cardType === 'summon' ? 'Призыв существа' : 'Розыгрыш эффекта'}
                                    </span>
                                  )}
                                  {handCardIntentIdsByInstanceId.has(card.instanceId) ? (
                                    <div className={styles.handCardFooter}>
                                      <div className={styles.handMetaRow}>
                                        <span className={styles.cardBadge}>В ленте</span>
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className={styles.emptyState}>
                          {localHandCards.length > 0
                            ? 'Все карты из руки уже перенесены в боевую ленту.'
                            : 'После старта матча здесь появятся реальные карты из руки.'}
                        </div>
                      )}
                    </section>
                    </section>
                  </section>
                </div>
              </div>
            ) : (
              <div className={styles.boardEmpty}>
                <div className={styles.matchSpotlight}>
                  <span className={styles.summaryLabel}>Игровое поле</span>
                  <strong className={styles.spotlightValue}>Ожидание матча</strong>
                  <p className={styles.paragraph}>
                    Сначала подключись через панель слева. После первого `state` здесь появится основное поле боя.
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className={styles.contextColumn}>
          <Card title="Режим экрана" className={styles.themedCard}>
            <div className={styles.focusPanel}>
              <div className={styles.matchSpotlight}>
                <span className={styles.summaryLabel}>Отображение</span>
                <strong className={styles.spotlightValue}>{showDiagnostics ? 'Диагностика включена' : 'Боевой режим'}</strong>
                <p className={styles.paragraph}>
                  В боевом режиме скрываем сырые snapshot/debug-блоки и оставляем только информацию, полезную прямо во время матча.
                </p>
                <div className={styles.inlineActions}>
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    onClick={() => setShowDiagnostics((current) => !current)}
                  >
                    {showDiagnostics ? 'Скрыть диагностику' : 'Показать диагностику'}
                  </button>
                </div>
              </div>
            </div>
          </Card>

          <Card title="Статус мага" className={styles.themedCard}>
            {localPlayer ? (
              <div className={styles.heroPanel}>
                <div className={styles.heroPanelHeader}>
                  <div>
                    <span className={styles.summaryLabel}>Твой маг</span>
                    <strong>{localDisplayName}</strong>
                  </div>
                  <span className={styles.heroChip}>{roundSync?.selfLocked ? 'Готово' : 'Настройка'}</span>
                </div>
                <div className={styles.detailsList}>
                  <div className={styles.detailRow}>
                    <span>Игрок</span>
                    <strong>{localDisplayName}</strong>
                  </div>
                  <div className={styles.detailRow}>
                    <span>Персонаж</span>
                    <strong>{localPlayer.characterId}</strong>
                  </div>
                  <div className={styles.detailRow}>
                    <span>Мана</span>
                    <strong>
                      {localPlayer.mana} / {localPlayer.maxMana}
                    </strong>
                  </div>
                  <div className={styles.detailRow}>
                    <span>Очки действия</span>
                    <strong>{localPlayer.actionPoints}</strong>
                  </div>
                  <div className={styles.detailRow}>
                    <span>Существа</span>
                    <strong>{alliedCreatures.length} / 2</strong>
                  </div>
                </div>
                {!canSummonMoreCreatures ? (
                  <p className={styles.hint}>На столе уже максимум 2 твоих существа, поэтому призыв временно недоступен.</p>
                ) : null}
              </div>
            ) : (
              <div className={styles.emptyState}>Локальный игрок появится после первого server `state`.</div>
            )}
          </Card>

          {showDiagnostics ? (
            <Card title="Зоны игроков" className={styles.themedCard}>
              {playerBoards.length > 0 ? (
                <div className={styles.playerBoardList}>
                  {playerBoards.map((playerBoard) => (
                    <div
                      key={playerBoard.playerId}
                      className={`${styles.playerBoard} ${playerBoard.locked ? styles.playerBoardActive : ''}`.trim()}
                    >
                      <div className={styles.playerBoardHeader}>
                        <strong>{getPlayerDisplayName(playerBoard.playerId)}</strong>
                        <span>{playerBoard.locked ? 'Готово' : 'Выбор'}</span>
                      </div>
                      <div className={styles.zoneGrid}>
                        <span>deck: {playerBoard.deckSize}</span>
                        <span>hand: {playerBoard.handSize}</span>
                        <span>discard: {playerBoard.discardSize}</span>
                        <span>
                          mana: {playerBoard.mana}/{playerBoard.maxMana}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>Зоны игроков появятся после первого server `state`.</div>
              )}
            </Card>
          ) : null}

          <Card title="Последний резолв" className={styles.themedCard}>
            {lastResolvedRound ? (
              <div className={styles.focusPanel}>
                <div className={styles.resolveSummaryStrip}>
                  <div className={styles.resolveSummaryPill}>
                    <span className={styles.indicatorKicker}>Раунд</span>
                    <strong className={styles.indicatorValue}>#{lastResolvedRound.roundNumber}</strong>
                  </div>
                  <div className={styles.resolveSummaryPill}>
                    <span className={styles.indicatorKicker}>Всего шагов</span>
                    <strong className={styles.indicatorValue}>{resolvedTimelineEntries.length}</strong>
                  </div>
                  <div className={styles.resolveSummaryPill}>
                    <span className={styles.indicatorKicker}>Твои шаги</span>
                    <strong className={styles.indicatorValue}>{localResolvedActionCount}</strong>
                    <span className={styles.indicatorSubvalue}>Соперник: {enemyResolvedActionCount}</span>
                  </div>
                </div>
                {activeResolvedTimelineEntry ? (
                  <div className={styles.indicatorRail}>
                    <div className={styles.indicatorPill}>
                      <span className={styles.indicatorKicker}>Резолв</span>
                      <strong className={styles.indicatorValue} data-testid="resolution-playback-status">
                        {resolvedPlaybackComplete ? 'Завершён' : 'Идёт'}
                      </strong>
                      <span className={styles.indicatorSubvalue} data-testid="resolution-playback-step">
                        {resolvedPlaybackStepLabel}
                      </span>
                    </div>
                    <div className={styles.indicatorPill}>
                      <span className={styles.indicatorKicker}>Текущий шаг резолва</span>
                      <strong className={styles.indicatorValue} data-testid="resolution-playback-title">
                        {activeResolvedTimelineEntry.title}
                      </strong>
                      <span className={styles.indicatorSubvalue}>{activeResolvedTimelineEntry.subtitle}</span>
                    </div>
                    <div className={styles.indicatorPill}>
                      <span className={styles.indicatorKicker}>Результат шага</span>
                      <strong className={styles.indicatorValue}>{activeResolvedTimelineEntry.action.status}</strong>
                      <span className={styles.indicatorSubvalue} data-testid="resolution-playback-summary">
                        {activeResolvedTimelineEntry.action.summary}
                      </span>
                    </div>
                  </div>
                ) : null}
                {resolvedTimelineEntries.length > 0 ? (
                  <div className={styles.roundQueueList}>
                    {resolvedTimelineEntries.map(({ order, action, title, subtitle, ownerLabel }, index) => (
                      <div
                        key={action.intentId}
                        className={`${styles.roundQueueItem} ${getRoundQueueToneClassName(action.layer)} ${index === resolvedPlaybackIndex ? styles.roundQueueItemActive : ''}`.trim()}
                      >
                        <div className={styles.roundQueueMain}>
                          <span className={styles.roundQueueIndex}>{order}</span>
                          <div className={styles.roundQueueText}>
                            <strong>{title}</strong>
                            <span>{subtitle}</span>
                          </div>
                        </div>
                        <div className={styles.roundQueueMeta}>
                          <div className={styles.roundQueueTagRow}>
                            <span className={styles.cardBadge}>{ownerLabel}</span>
                            <span className={`${styles.cardBadge} ${getActionToneBadgeClassName(action.layer)}`.trim()}>
                              {getResolutionLayerLabel(action.layer)}
                            </span>
                            {index === resolvedPlaybackIndex ? <span className={styles.cardBadge}>Сейчас</span> : null}
                          </div>
                          <div className={styles.roundQueueOutcome}>
                            <span className={styles.cardBadge}>
                              {getRoundActionStatusDisplay(action.status)} · {action.status}
                            </span>
                            <strong>{getRoundActionReasonLabel(action.reasonCode)}</strong>
                          </div>
                          {showDiagnostics ? <span className={styles.cardBadge}>{action.reasonCode}</span> : null}
                        </div>
                        <div className={styles.roundQueueSummary}>{action.summary}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyState}>Раунд {lastResolvedRound.roundNumber} завершился без результативных действий.</div>
                )}
                {resolvedTimelineEntries.length > 0 ? (
                  <div className={styles.hint}>
                    Шаги показаны в фактическом порядке server-side резолва. Для твоих intent локальные label и target восстановлены по `intentId`.
                  </div>
                ) : null}
              </div>
            ) : (
              <div className={styles.emptyState}>После первого `roundResolved` здесь появится порядок фактического резолва.</div>
            )}
          </Card>

          <Card title="Лента матча" className={styles.themedCard}>
            {matchEvents.length > 0 ? (
              <div className={styles.eventFeed}>
                {matchEvents.map((event) => (
                  <div key={event.id} className={styles.eventItem}>
                    <strong>{event.title}</strong>
                    <span>{event.description}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>После первых действий здесь появится читаемая лента матча.</div>
            )}
          </Card>

          {showDiagnostics ? (
            <Card title="Debug state" className={styles.themedCard}>
              <details className={styles.debugPanel}>
                <summary className={styles.debugSummary}>Открыть raw snapshot</summary>
                <pre className={styles.rawState}>
                  {matchState ? JSON.stringify(matchState, null, 2) : 'Ожидание данных матча...'}
                </pre>
              </details>
            </Card>
          ) : null}
        </div>
      </div>
    </PageShell>
  );
};
