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
import { getResolutionLayerForCardDefinition } from '@game-core/rounds/compileRoundActions';
import type { CardDefinition, PlayerBoardModel, ResolutionLayer, ResolvedRoundAction, RoundDraftValidationError, RoundResolutionResult, TargetType } from '@game-core/types';
import {
  getResolutionLayerLabel,
  getRoundDraftRejectCodeLabel,
  getRoundDraftValidationCodeLabel,
  getRoundActionReasonLabel,
  getTargetTypeLabel,
} from '@game-core/rounds/presentation';
import { Card, HomeLinkButton, PageShell } from '@/components';
import { ROUTES } from '@/constants';
import rawCardData from '@/data/cardCatalog';
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

interface ResolvedTimelineEntrySummary {
  order: number;
  action: ResolvedRoundAction;
  ownerLabel: string;
  title: string;
  subtitle: string;
}

interface ResolvedLayerStageSummary {
  layer: ResolutionLayer;
  modeLabel: string;
  entries: ResolvedTimelineEntrySummary[];
  index: number;
  localActionCount: number;
  enemyActionCount: number;
}

const ROUND_RESOLUTION_PLAYBACK_STEP_MS = 800;
const ROUND_RESOLUTION_REPLAY_AUTO_CLOSE_MS = 900;

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

const mergeDraftIntentTargets = (
  currentDraft: RoundActionIntentDraft[],
  incomingDraft: RoundActionIntentDraft[],
): RoundActionIntentDraft[] => {
  const currentById = new Map(currentDraft.map((intent) => [intent.intentId, intent] as const));

  return incomingDraft.map((incomingIntent) => {
    if (!('target' in incomingIntent)) {
      return incomingIntent;
    }

    const currentIntent = currentById.get(incomingIntent.intentId);
    if (!currentIntent || !('target' in currentIntent)) {
      return incomingIntent;
    }

    const incomingTargetType = incomingIntent.target?.targetType;
    const incomingTargetId = incomingIntent.target?.targetId;
    const currentTargetType = currentIntent.target?.targetType;
    const currentTargetId = currentIntent.target?.targetId;

    if (
      incomingTargetId ||
      (!currentTargetId && !currentTargetType) ||
      (incomingTargetType && currentTargetType && incomingTargetType !== currentTargetType)
    ) {
      return incomingIntent;
    }

    return {
      ...incomingIntent,
      target: {
        targetType: incomingTargetType ?? currentTargetType,
        targetId: currentTargetId,
      },
    };
  });
};
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

const getStepCountLabel = (count: number): string => {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) {
    return 'шагов';
  }

  const mod10 = count % 10;
  if (mod10 === 1) {
    return 'шаг';
  }

  if (mod10 >= 2 && mod10 <= 4) {
    return 'шага';
  }

  return 'шагов';
};

const getResolutionStageHint = (layer: ResolutionLayer): string => {
  switch (layer) {
    case 'summon':
      return 'Сначала раскрываются призывы и новые сущности, которые входят в общий порядок раунда.';
    case 'defensive_modifiers':
    case 'defensive_spells':
      return 'Защитные ответы показываются отдельным этапом, чтобы читать контр-игру до атаки.';
    case 'other_modifiers':
      return 'Поддержка и модификаторы раскрываются отдельной волной до агрессивных действий.';
    case 'offensive_control_spells':
      return 'Боевые и контрольные заклинания идут как самостоятельный слой перед прямыми атаками.';
    case 'attacks':
      return 'Только после этого раскрываются удары существ и персонажей.';
    case 'cleanup_end_of_round':
      return 'Финальный этап фиксирует cleanup и пост-эффекты завершения раунда.';
    default:
      return 'Резолв раскрывается по слоям, а не единым текстовым списком.';
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

const getRoundActionTargetSubtitle = (
  kind: RoundActionIntentDraft['kind'],
  targetType?: TargetType | null,
  targetId?: string | null,
  knownTargetLabelsById?: ReadonlyMap<string, string>,
  fallbackTargetId?: string | null,
): string => {
  if (kind === 'Summon' || kind === 'Evade') {
    return 'Без цели';
  }

  if (!targetType) {
    return 'Цель не указана';
  }

  const resolvedTargetId = targetId ?? fallbackTargetId ?? null;
  if (!resolvedTargetId) {
    return 'Цель уточняется';
  }

  const targetLabel = knownTargetLabelsById?.get(resolvedTargetId);
  return `${getTargetTypeLabel(targetType)} -> ${targetLabel ?? resolvedTargetId}`;
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
    case 'duplicate_character':
      return 'Этот персонаж уже занят в матче. Выберите колоду с другим магом';
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
  cardDefinition: CardDefinition | null,
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
    case 'PlayCard': {
      if (cardDefinition) {
        return getResolutionLayerForCardDefinition(cardDefinition);
      }

      return intent.kind === 'CastSpell'
        ? selectedTargetType === 'self' || selectedTargetType === 'allyCharacter'
          ? 'defensive_spells'
          : 'offensive_control_spells'
        : selectedTargetType === 'self' || selectedTargetType === 'allyCharacter'
          ? 'defensive_modifiers'
          : 'other_modifiers';
    }
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const getRuntimeIdFromBoardItemId = (boardItemId: string): string | null => {
  const separatorIndex = boardItemId.indexOf(':');
  if (separatorIndex < 0 || separatorIndex === boardItemId.length - 1) {
    return null;
  }

  return boardItemId.slice(separatorIndex + 1);
};

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
    setError('');
    return;
  }

  if (event.type === 'roundDraftSnapshot') {
    const sortedDraft = [...event.intents].sort((left, right) => left.queueIndex - right.queueIndex);
    setRoundDraft((currentDraft) => mergeDraftIntentTargets(currentDraft, sortedDraft));
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
  const [draftTarget, setDraftTarget] = useState<TargetDraft | null>(null);
  const [roundDraft, setRoundDraft] = useState<RoundActionIntentDraft[]>([]);
  const [roundSync, setRoundSync] = useState<RoundSyncSummary | null>(null);
  const [roundDraftRejected, setRoundDraftRejected] = useState<RoundDraftRejectedSummary | null>(null);
  const [lastResolvedRound, setLastResolvedRound] = useState<RoundResolutionResult | null>(null);
  const [selfBoardModel, setSelfBoardModel] = useState<PlayerBoardModel | null>(null);
  const [resolvedPlaybackIndex, setResolvedPlaybackIndex] = useState(-1);
  const [resolvedPlaybackComplete, setResolvedPlaybackComplete] = useState(true);
  const [isResolvedReplayOpen, setIsResolvedReplayOpen] = useState(false);
  const [isResolvedReplayPinned, setIsResolvedReplayPinned] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showConnectionControls, setShowConnectionControls] = useState(false);
  const hasLiveStateRef = useRef(false);
  const pendingSessionIdRef = useRef('');
  const intentSequenceRef = useRef(0);
  const currentRoundRef = useRef<number | null>(null);
  const roundDraftRef = useRef<RoundActionIntentDraft[]>([]);

  useEffect(() => {
    roundDraftRef.current = roundDraft;
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
      setIsResolvedReplayOpen(false);
      setIsResolvedReplayPinned(false);
      return;
    }

    setResolvedPlaybackIndex(0);
    setResolvedPlaybackComplete(totalSteps === 1);
    setIsResolvedReplayOpen(true);
    setIsResolvedReplayPinned(false);
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
      setDraftTarget(null);
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
  const allResolvedBoardItems = useMemo(
    () => playerBoards.flatMap((playerBoard) => getPlayerBoardItemSummaries(matchState, playerBoard.playerId)),
    [matchState, playerBoards],
  );
  const resolvedBoardItemsById = useMemo(
    () => new Map(allResolvedBoardItems.map((item) => [item.id, item] as const)),
    [allResolvedBoardItems],
  );
  const resolvedBoardItemIdByRuntimeId = useMemo(
    () => new Map(allResolvedBoardItems.map((item) => [item.runtimeId, item.id] as const)),
    [allResolvedBoardItems],
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
  const getResolvedCharacterLabel = useCallback(
    (characterId?: string | null): string | null => {
      if (!characterId) {
        return null;
      }

      if (characterId === localPlayer?.characterId) {
        return 'Твой маг';
      }

      const ownerBoard = playerBoards.find((playerBoard) => playerBoard.characterId === characterId);
      if (ownerBoard) {
        return `Маг ${getPlayerDisplayName(ownerBoard.playerId)}`;
      }

      const character = characterCatalogById.get(characterId);
      return character ? `Маг ${character.name}` : null;
    },
    [getPlayerDisplayName, localPlayer?.characterId, playerBoards],
  );
  const getResolvedBoardItemLabel = useCallback(
    (boardItemId?: string | null, runtimeId?: string | null): string | null => {
      const boardItem =
        (boardItemId ? resolvedBoardItemsById.get(boardItemId) : undefined) ??
        (runtimeId ? resolvedBoardItemsById.get(resolvedBoardItemIdByRuntimeId.get(runtimeId) ?? '') : undefined);
      if (boardItem) {
        return boardItem.title;
      }

      const fallbackRuntimeId = runtimeId ?? (boardItemId ? getRuntimeIdFromBoardItemId(boardItemId) : null);
      return fallbackRuntimeId ? `Существо ${fallbackRuntimeId}` : null;
    },
    [resolvedBoardItemIdByRuntimeId, resolvedBoardItemsById],
  );
  const localDisplayName = getPlayerDisplayName(playerId);
  const primaryEnemyBoard = enemyBoards[0] ?? null;
  const primaryEnemyDisplayName = getPlayerDisplayName(primaryEnemyBoard?.playerId);
  const enemyRibbonBoardItems = useMemo(
    () => (primaryEnemyBoard?.playerId ? getPlayerPublicRibbonBoardItems(matchState, primaryEnemyBoard.playerId) : []),
    [matchState, primaryEnemyBoard?.playerId],
  );
  const enemyRibbonBoardItemIdByRuntimeId = useMemo(
    () => new Map(enemyRibbonBoardItems.map((item) => [item.runtimeId, item.id] as const)),
    [enemyRibbonBoardItems],
  );
  const localCharacter = useMemo(
    () => (localPlayer?.characterId ? characterCatalogById.get(localPlayer.characterId) ?? null : null),
    [localPlayer]
  );
  const enemyCharacter = useMemo(
    () => (primaryEnemyBoard?.characterId ? characterCatalogById.get(primaryEnemyBoard.characterId) ?? null : null),
    [primaryEnemyBoard]
  );
  const localCharacterState = useMemo(() => {
    if (!localPlayer?.characterId || !matchState?.characters) {
      return null;
    }

    return matchState.characters[localPlayer.characterId] ?? null;
  }, [localPlayer, matchState?.characters]);
  const enemyCharacterState = useMemo(() => {
    if (!primaryEnemyBoard?.characterId || !matchState?.characters) {
      return null;
    }

    return matchState.characters[primaryEnemyBoard.characterId] ?? null;
  }, [matchState?.characters, primaryEnemyBoard?.characterId]);
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
  const isSelfBoardModelDraftSynced = useMemo(() => {
    if (!selfBoardModel) {
      return false;
    }

    if (roundDraft.length === 0) {
      return (selfBoardModel.roundActions?.length ?? 0) === 0;
    }

    const boardModelActionIds = new Set(selfBoardModel.roundActions.map((action) => action.id));
    return roundDraft.every((intent) => boardModelActionIds.has(intent.intentId));
  }, [roundDraft, selfBoardModel]);
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
      preferredTargetId:
        draftTarget?.sourceInstanceId === selectedCreature.creatureId
          ? draftTarget.targetId
          : undefined,
    });
  }, [
    currentRoundNumber,
    draftTarget,
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
  const applyDraftTargetForSelection = useCallback((targetId: string) => {
    if (selectedHandCard && selectedCardTargetType) {
      setDraftTarget({
        sourceInstanceId: selectedHandCard.instanceId,
        targetType: selectedCardTargetType,
        targetId,
      });
      return;
    }

    if (
      selectedCreature &&
      selectedCreatureSuggestedAttackIntent?.kind === 'Attack' &&
      selectedCreatureSuggestedAttackIntent.target.targetType
    ) {
      setDraftTarget({
        sourceInstanceId: selectedCreature.creatureId,
        targetType: selectedCreatureSuggestedAttackIntent.target.targetType,
        targetId,
      });
      return;
    }

    setDraftTarget(null);
  }, [selectedCardTargetType, selectedCreature, selectedCreatureSuggestedAttackIntent, selectedHandCard]);
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
        getResolvedBoardItemLabel(null, creature.creatureId) ?? `Существо ${creature.creatureId}`,
      );
    });

    return labelMap;
  }, [creatures, enemyBoards, getPlayerDisplayName, getResolvedBoardItemLabel, localPlayer]);
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
  const activeDraftTargetId = useMemo(() => {
    if (!selection || !draftTarget) {
      return '';
    }

    const selectedSourceId = selection.kind === 'hand' ? selection.instanceId : selection.creatureId;
    return draftTarget.sourceInstanceId === selectedSourceId ? draftTarget.targetId : '';
  }, [draftTarget, selection]);
  const isDraftTargetActive = (candidateId: string): boolean => activeDraftTargetId === candidateId;
  const coreRoundActionByIntentId = useMemo(
    () => new Map((selfBoardModel?.roundActions ?? []).map((action) => [action.id, action] as const)),
    [selfBoardModel],
  );
  const previewLayerByIntentId = useMemo(() => {
    const layerMap = new Map<string, ResolutionLayer>();

    roundDraft.forEach((intent) => {
      const coreRoundAction = coreRoundActionByIntentId.get(intent.intentId);
      const intentCardDefinition =
        'cardInstanceId' in intent
          ? (() => {
              const handCard = localHandCards.find((card) => card.instanceId === intent.cardInstanceId);
              return handCard ? roundIntentCardRegistry.get(handCard.cardId) ?? null : null;
            })()
          : null;
      const selectedTargetType =
        intent.kind === 'CastSpell' || intent.kind === 'PlayCard' || intent.kind === 'Attack'
          ? intent.target.targetType
          : undefined;
      layerMap.set(
        intent.intentId,
        coreRoundAction?.placement.layer ?? getIntentPreviewLayer(intent, intentCardDefinition, selectedTargetType),
      );
    });

    return layerMap;
  }, [coreRoundActionByIntentId, localHandCards, roundDraft]);

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
      roundDraftRef.current = normalizedDraft;
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

    syncRoundDraft([...roundDraftRef.current, intent]);
  }, [currentRoundNumber, syncRoundDraft]);

  const upsertRoundIntent = useCallback(
    (
      matcher: (intent: RoundActionIntentDraft) => boolean,
      buildNextIntent: (existingIntent: RoundActionIntentDraft | null) => RoundActionIntentDraft
    ): void => {
      const currentDraft = roundDraftRef.current;
      const existingIntent = currentDraft.find(matcher) ?? null;
      if (existingIntent) {
        syncRoundDraft(currentDraft.map((intent) => (intent.intentId === existingIntent.intentId ? buildNextIntent(existingIntent) : intent)));
        return;
      }

      appendRoundIntent(buildNextIntent(null));
    },
    [appendRoundIntent, syncRoundDraft]
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
    setDraftTarget(null);
    setRoundDraft([]);
    setTransportRejected(null);
    setJoinRejected(null);
    setRoundDraftRejected(null);
    setRoundSync(null);
    setLastResolvedRound(null);
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
    setDraftTarget(null);
    setRoundDraft([]);
    setTransportRejected(null);
    setJoinRejected(null);
    setRoundDraftRejected(null);
    setRoundSync(null);
    setLastResolvedRound(null);
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
        queueIndex: existingIntent?.queueIndex ?? roundDraftRef.current.length,
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

    const currentDraft = roundDraftRef.current;
    const existingIntent = currentDraft.find(
      (intent) => 'cardInstanceId' in intent && typeof intent.cardInstanceId === 'string' && intent.cardInstanceId === card.instanceId
    );

    if (existingIntent) {
      if ('target' in existingIntent && existingIntent.target?.targetId && existingIntent.target.targetType) {
        setDraftTarget({
          sourceInstanceId: card.instanceId,
          targetType: existingIntent.target.targetType,
          targetId: String(existingIntent.target.targetId),
        });
      } else {
        setDraftTarget(null);
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
      queueIndex: currentDraft.length,
      playerId: localPlayer.playerId,
      actorId: localPlayer.characterId,
      cardInstanceId: card.instanceId,
    });
    if (!nextIntent) {
      setError('Не удалось собрать стартовое действие из карточного контракта.');
      return;
    }

    setDraftTarget(
      'target' in nextIntent && nextIntent.target.targetId && nextIntent.target.targetType
        ? {
            sourceInstanceId: card.instanceId,
            targetType: nextIntent.target.targetType,
            targetId: String(nextIntent.target.targetId),
          }
        : null
    );
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
      queueIndex: roundDraftRef.current.length,
      playerId,
      creatureId: selectedCreature.creatureId,
      actionKind: 'Attack',
      preferredTargetId:
        draftTarget?.sourceInstanceId === selectedCreature.creatureId
          ? draftTarget.targetId
          : undefined,
    });
    if (!nextIntent) {
      setError('Не удалось собрать стартовую атаку из правил game-core.');
      return;
    }

    appendRoundIntent(nextIntent);
    setDraftTarget(null);
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
      queueIndex: roundDraftRef.current.length,
      playerId,
      creatureId: selectedCreature.creatureId,
      actionKind: 'Evade',
    });
    if (!nextIntent) {
      setError('Не удалось собрать стартовое уклонение из правил game-core.');
      return;
    }

    appendRoundIntent(nextIntent);
    setDraftTarget(null);
  };

  const handleRemoveRoundIntent = (intentId: string) => {
    syncRoundDraft(roundDraftRef.current.filter((intent) => intent.intentId !== intentId));
  };
  const handleRoundIntentTargetSelect = useCallback((intentId: string, targetType: TargetType, targetId: string) => {
    const matchingIntent = roundDraftRef.current.find((intent) => intent.intentId === intentId);
    if (matchingIntent) {
      if ('cardInstanceId' in matchingIntent) {
        setDraftTarget({
          sourceInstanceId: matchingIntent.cardInstanceId,
          targetType,
          targetId,
        });
      } else if (matchingIntent.kind === 'Attack') {
        setDraftTarget({
          sourceInstanceId: matchingIntent.sourceCreatureId,
          targetType,
          targetId,
        });
      }
    }
    syncRoundDraft(
      roundDraftRef.current.map((intent) =>
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
  }, [syncRoundDraft]);

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
      if (!('target' in intent)) {
        return getRoundActionTargetSubtitle(intent.kind, null, null, knownTargetLabelsById);
      }

      return getRoundActionTargetSubtitle(
        intent.kind,
        intent.target.targetType ?? null,
        intent.target.targetId ?? null,
        knownTargetLabelsById,
      );
    },
    [knownTargetLabelsById],
  );
  const getResolvedActionTitle = useCallback(
    (action: ResolvedRoundAction): string => {
      const cardName = (action.source.type === 'card' && action.source.definitionId
        ? cardCatalogById.get(action.source.definitionId)?.name
        : undefined) ?? (action.definitionId ? cardCatalogById.get(action.definitionId)?.name : undefined);
      const sourceLabel =
        action.source.type === 'boardItem'
          ? getResolvedBoardItemLabel(action.source.boardItemId, action.actorId)
          : action.source.type === 'actor'
            ? getResolvedCharacterLabel(action.source.actorId) ?? getResolvedBoardItemLabel(null, action.source.actorId)
            : cardName ?? null;

      switch (action.kind) {
        case 'Summon':
          return cardName ? `Призыв: ${cardName}` : `Призыв: ${sourceLabel ?? action.cardInstanceId ?? action.intentId}`;
        case 'CastSpell':
          return cardName ? `Заклинание: ${cardName}` : `Заклинание: ${sourceLabel ?? action.cardInstanceId ?? action.intentId}`;
        case 'PlayCard':
          return cardName ? `Розыгрыш: ${cardName}` : `Розыгрыш: ${sourceLabel ?? action.cardInstanceId ?? action.intentId}`;
        case 'Attack':
          return `Атака: ${sourceLabel ?? action.actorId}`;
        case 'Evade':
          return sourceLabel ? `Уклонение: ${sourceLabel}` : 'Уклонение';
      }
    },
    [getResolvedBoardItemLabel, getResolvedCharacterLabel],
  );
  const getResolvedActionTargetLabel = useCallback(
    (action: ResolvedRoundAction): string => {
      if (!action.target?.targetType) {
        return action.kind === 'Summon' || action.kind === 'Evade' ? 'Без цели' : 'Цель не указана';
      }

      if (!action.target.targetId) {
        return 'Цель уточняется';
      }

      const targetLabel = knownTargetLabelsById.get(action.target.targetId);
      return `${getTargetTypeLabel(action.target.targetType)} -> ${targetLabel ?? action.target.targetId}`;
    },
    [knownTargetLabelsById],
  );
  const localRoundRibbonItems = useMemo<RoundRibbonActionSummary[]>(() => {
    if (selfBoardModel?.roundActions?.length && isSelfBoardModelDraftSynced) {
      return [...selfBoardModel.roundActions]
        .sort((left, right) => left.placement.orderIndex - right.placement.orderIndex)
        .map((action) => {
          const matchingDraft = roundDraft.find((intent) => intent.intentId === action.id) ?? null;
          const matchingCard =
            matchingDraft && 'cardInstanceId' in matchingDraft
              ? getIntentCardSummary(matchingDraft.cardInstanceId)
              : null;
          const resolvedTargetType =
            matchingDraft && 'target' in matchingDraft
              ? matchingDraft.target.targetType ?? action.target?.targetType ?? null
              : action.target?.targetType ?? null;
          const resolvedTargetId =
            matchingDraft && 'target' in matchingDraft
              ? matchingDraft.target.targetId ?? action.target?.targetId ?? null
              : action.target?.targetId ?? null;
          const fallbackTargetId = resolvedTargetId ?? getDefaultTargetIdForType(resolvedTargetType);
          const draftTargetLabel = matchingDraft ? getActionTargetPreview(getIntentTargetLabel(matchingDraft)) : undefined;
          const actionTargetLabel = getActionTargetPreview(
            getRoundActionTargetSubtitle(
              action.kind,
              resolvedTargetType,
              resolvedTargetId,
              knownTargetLabelsById,
              fallbackTargetId,
            ),
          );
          const resolvedTargetLabel = draftTargetLabel ?? actionTargetLabel;
          const resolvedSubtitle =
            matchingDraft && draftTargetLabel
              ? getIntentTargetLabel(matchingDraft)
              : actionTargetLabel ??
                (matchingDraft
                  ? getIntentTargetLabel(matchingDraft)
                  : action.summary ?? `Слой ${getResolutionLayerLabel(action.placement.layer)}`);

          return {
            id: action.id,
            title:
              matchingCard?.name ??
              (matchingDraft ? getIntentLabel(matchingDraft) : `${action.kind} ${action.id}`),
            subtitle: resolvedSubtitle,
            modeLabel: getRoundActionModeLabel(action.placement.layer),
            statusLabel: getRoundActionStatusDisplay(action.status),
            targetLabel: resolvedTargetLabel,
            focusLabel: getRoundActionFocusLabel(
              getRoundActionModeLabel(action.placement.layer),
              resolvedTargetLabel,
            ),
            effectSummary: matchingCard?.effect,
            cardSpeed: matchingCard?.speed,
            targetType: resolvedTargetType,
            targetId: resolvedTargetId ?? fallbackTargetId,
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
  }, [
    getDefaultTargetIdForType,
    knownTargetLabelsById,
    getIntentCardSummary,
    getIntentLabel,
    getIntentTargetLabel,
    isSelfBoardModelDraftSynced,
    localBoardItemIdByRuntimeId,
    previewLayerByIntentId,
    roundDraft,
    roundSync?.selfLocked,
    selfBoardModel,
  ]);
  const localBattleRibbonEntries = useMemo<LocalBattleRibbonEntrySummary[]>(() => {
    const actionById = new Map(localRoundRibbonItems.map((action) => [action.id, action] as const));

    if (selfBoardModel?.ribbonEntries?.length && isSelfBoardModelDraftSynced) {
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
  }, [isSelfBoardModelDraftSynced, localBoardItems, localBoardItemsById, localRoundRibbonItems, selfBoardModel]);
  const visibleLocalBattleRibbonEntries = useMemo<LocalBattleRibbonEntrySummary[]>(
    () =>
      !isResolvedReplayOpen
        ? localBattleRibbonEntries
        : localBattleRibbonEntries.flatMap((entry) =>
            entry.kind === 'boardItem'
              ? [
                  {
                    ...entry,
                    attachedActions: [],
                  },
                ]
              : [],
          ),
    [isResolvedReplayOpen, localBattleRibbonEntries],
  );
  const hasLocalBattleRibbonEntries = visibleLocalBattleRibbonEntries.length > 0;

  const resolvedTimelineEntries = useMemo<ResolvedTimelineEntrySummary[]>(
    () =>
      !lastResolvedRound
        ? []
        : lastResolvedRound.orderedActions.map((action) => {
            const isLocalAction = action.playerId === playerId;

            return {
              order: action.orderIndex + 1,
              action,
              ownerLabel: isLocalAction ? 'Ты' : `Игрок ${getPlayerDisplayName(action.playerId)}`,
              title: getResolvedActionTitle(action),
              subtitle: getResolvedActionTargetLabel(action),
            };
          }),
    [getPlayerDisplayName, getResolvedActionTargetLabel, getResolvedActionTitle, lastResolvedRound, playerId],
  );
  const resolvedLayerStages = useMemo<ResolvedLayerStageSummary[]>(() => {
    const stages: ResolvedLayerStageSummary[] = [];

    resolvedTimelineEntries.forEach((entry) => {
      const lastStage = stages[stages.length - 1];
      if (lastStage && lastStage.layer === entry.action.layer) {
        lastStage.entries.push(entry);
        if (entry.action.playerId === playerId) {
          lastStage.localActionCount += 1;
        } else {
          lastStage.enemyActionCount += 1;
        }
        return;
      }

      stages.push({
        layer: entry.action.layer,
        modeLabel: getRoundActionModeLabel(entry.action.layer),
        entries: [entry],
        index: stages.length,
        localActionCount: entry.action.playerId === playerId ? 1 : 0,
        enemyActionCount: entry.action.playerId === playerId ? 0 : 1,
      });
    });

    return stages;
  }, [playerId, resolvedTimelineEntries]);
  const activeResolvedTimelineEntry =
    resolvedPlaybackIndex >= 0 && resolvedPlaybackIndex < resolvedTimelineEntries.length
      ? resolvedTimelineEntries[resolvedPlaybackIndex]
      : null;
  const activeResolvedLayerStage =
    activeResolvedTimelineEntry
      ? resolvedLayerStages.find((stage) =>
          stage.entries.some((entry) => entry.action.intentId === activeResolvedTimelineEntry.action.intentId),
        ) ?? null
      : null;
  const activeResolvedLayerStageIndex = activeResolvedLayerStage?.index ?? -1;
  const activeResolvedLayerStepIndex =
    activeResolvedLayerStage && activeResolvedTimelineEntry
      ? activeResolvedLayerStage.entries.findIndex(
          (entry) => entry.action.intentId === activeResolvedTimelineEntry.action.intentId,
        )
      : -1;
  const activeResolvedOwnerId = activeResolvedTimelineEntry?.action.playerId ?? null;
  const enemyPlaybackEntry =
    activeResolvedTimelineEntry && activeResolvedOwnerId && activeResolvedOwnerId !== playerId
      ? activeResolvedTimelineEntry
      : null;
  const localPlaybackEntry =
    activeResolvedTimelineEntry && activeResolvedOwnerId === playerId
      ? activeResolvedTimelineEntry
      : null;
  const visibleEnemyPlaybackEntry = isResolvedReplayOpen ? enemyPlaybackEntry : null;
  const visibleLocalPlaybackEntry = isResolvedReplayOpen ? localPlaybackEntry : null;
  const isEnemyHandEmpty = (primaryEnemyBoard?.handSize ?? 0) === 0;
  const isEnemyLaneEmpty = !visibleEnemyPlaybackEntry && enemyRibbonBoardItems.length === 0;
  const isLocalLaneEmpty = !visibleLocalPlaybackEntry && !hasLocalBattleRibbonEntries;
  const activeLocalPlaybackIntentId = visibleLocalPlaybackEntry?.action.intentId ?? null;
  const resolvePlaybackSourceBoardItemId = useCallback(
    (
      action: ResolvedRoundAction | null | undefined,
      boardItemIdByRuntimeId: ReadonlyMap<string, string>,
      boardItems: BoardItemSummary[],
    ): string | null => {
      if (!action) {
        return null;
      }

      if (action.source.type === 'boardItem') {
        return action.source.boardItemId;
      }

      if (action.source.type === 'actor') {
        return boardItemIdByRuntimeId.get(action.source.actorId) ?? null;
      }

      if (action.kind === 'Summon') {
        const matchingItems = boardItems.filter((item) => item.placementLayer === action.layer);
        return matchingItems.length === 1 ? matchingItems[0].id : null;
      }

      return boardItemIdByRuntimeId.get(action.actorId) ?? null;
    },
    [],
  );
  const activeLocalPlaybackSourceBoardItemId = resolvePlaybackSourceBoardItemId(
    visibleLocalPlaybackEntry?.action,
    localBoardItemIdByRuntimeId,
    localBoardItems,
  );
  const resolvedPlaybackStepLabel = activeResolvedTimelineEntry
    ? `Шаг ${resolvedPlaybackIndex + 1} из ${resolvedTimelineEntries.length}`
    : 'Ожидание playback';
  const resolvedLayerPlaybackLabel =
    activeResolvedLayerStageIndex >= 0
      ? `Этап ${activeResolvedLayerStageIndex + 1} из ${resolvedLayerStages.length}`
      : 'Ожидание этапа';
  const resolvedLayerPlaybackStepLabel =
    activeResolvedLayerStage && activeResolvedLayerStepIndex >= 0
      ? `Шаг ${activeResolvedLayerStepIndex + 1} из ${activeResolvedLayerStage.entries.length} в слое`
      : 'Шаг слоя ещё не выбран';
  const localResolvedActionCount = resolvedTimelineEntries.filter((entry) => entry.action.playerId === playerId).length;
  const enemyResolvedActionCount = resolvedTimelineEntries.length - localResolvedActionCount;
  const hasActiveMatchConnection = Boolean(joinedSessionId || matchState);
  const selectedDeckName = savedDecks.find((deck) => deck.id === deckId)?.name ?? 'не выбрана';
  const activeEnemyPlaybackBoardItemId = resolvePlaybackSourceBoardItemId(
    visibleEnemyPlaybackEntry?.action,
    enemyRibbonBoardItemIdByRuntimeId,
    enemyRibbonBoardItems,
  );
  const visibleEnemyPlaybackBoardItemId = isResolvedReplayOpen ? activeEnemyPlaybackBoardItemId : null;
  const visibleLocalPlaybackSourceBoardItemId = isResolvedReplayOpen ? activeLocalPlaybackSourceBoardItemId : null;
  const hasReplayAvailable = Boolean(lastResolvedRound && resolvedTimelineEntries.length > 0);
  const hasCurrentRoundAdvancedPastReplay =
    Boolean(lastResolvedRound) && currentRoundNumber > (lastResolvedRound?.roundNumber ?? 0);
  const activeResolvedStageEntryCount = activeResolvedLayerStage?.entries.length ?? 0;

  const restartResolvedReplay = useCallback(
    (pinned: boolean) => {
      const totalSteps = lastResolvedRound?.orderedActions.length ?? 0;
      if (!lastResolvedRound || totalSteps === 0) {
        return;
      }

      setResolvedPlaybackIndex(0);
      setResolvedPlaybackComplete(totalSteps === 1);
      setIsResolvedReplayPinned(pinned);
      setIsResolvedReplayOpen(true);
    },
    [lastResolvedRound],
  );

  const handleToggleResolvedReplay = useCallback(() => {
    if (!hasReplayAvailable) {
      return;
    }

    if (isResolvedReplayOpen) {
      setIsResolvedReplayOpen(false);
      setIsResolvedReplayPinned(false);
      return;
    }

    restartResolvedReplay(true);
  }, [hasReplayAvailable, isResolvedReplayOpen, restartResolvedReplay]);

  useEffect(() => {
    if (
      !isResolvedReplayOpen ||
      isResolvedReplayPinned ||
      !resolvedPlaybackComplete ||
      !hasCurrentRoundAdvancedPastReplay
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsResolvedReplayOpen(false);
    }, ROUND_RESOLUTION_REPLAY_AUTO_CLOSE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    hasCurrentRoundAdvancedPastReplay,
    isResolvedReplayOpen,
    isResolvedReplayPinned,
    resolvedPlaybackComplete,
  ]);

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
        setDraftTarget(null);
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
      setDraftTarget(null);
      setSelection(null);
      setError('');
      lastDraftRosterSignatureRef.current = playerRosterSignature;
      return;
    }

    lastDraftRosterSignatureRef.current = playerRosterSignature;
  }, [playerRosterSignature]);

  useEffect(() => {
    if (!draftTarget) {
      return;
    }

    if (!selection) {
      setDraftTarget(null);
      return;
    }

    const selectedSourceId = selection.kind === 'hand' ? selection.instanceId : selection.creatureId;
    if (draftTarget.sourceInstanceId !== selectedSourceId) {
      return;
    }

    if (!targetCandidates.some((candidate) => candidate.id === draftTarget.targetId)) {
      setDraftTarget(null);
    }
  }, [draftTarget, selection, targetCandidates]);

  useEffect(() => {
    if (
      !selectedHandCard ||
      !selectedHandCardIntent ||
      selectedHandCardIntent.kind === 'Summon' ||
      !('target' in selectedHandCardIntent) ||
      !selectedCardTargetType ||
      !draftTarget ||
      draftTarget.sourceInstanceId !== selectedHandCard.instanceId ||
      Boolean(roundSync?.selfLocked)
    ) {
      return;
    }

    if (
      selectedHandCardIntent.target.targetId === draftTarget.targetId &&
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
                targetId: draftTarget.targetId,
              },
            }
          : intent
      )
    );
  }, [
    draftTarget,
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
                              applyDraftTargetForSelection(enemyCharacterId);
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
                            {primaryEnemyBoard && enemyCharacterState ? (
                              <div className={styles.playerIdentityStats}>
                                <span className={styles.playerIdentityStat}>
                                  HP {enemyCharacterState.hp}/{enemyCharacterState.maxHp}
                                </span>
                                <span className={styles.playerIdentityStat}>
                                  Мана {primaryEnemyBoard.mana}/{primaryEnemyBoard.maxMana}
                                </span>
                                <span className={styles.playerIdentityStat}>
                                  Ловкость {enemyCharacterState.dexterity}
                                </span>
                                <span className={styles.playerIdentityStat}>
                                  Конц. {enemyCharacterState.concentration}
                                </span>
                              </div>
                            ) : null}
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
                              applyDraftTargetForSelection(localPlayer.characterId);
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
                            {localPlayer && localCharacterState ? (
                              <div className={styles.playerIdentityStats}>
                                <span className={styles.playerIdentityStat}>
                                  HP {localCharacterState.hp}/{localCharacterState.maxHp}
                                </span>
                                <span className={styles.playerIdentityStat}>
                                  Мана {localPlayer.mana}/{localPlayer.maxMana}
                                </span>
                                <span className={styles.playerIdentityStat}>
                                  Ловкость {localCharacterState.dexterity}
                                </span>
                                <span className={styles.playerIdentityStat}>
                                  Конц. {localCharacterState.concentration}
                                </span>
                              </div>
                            ) : null}
                          </div>
                        </button>
                      </div>
                    </aside>

                    <section className={styles.fieldFrame}>
                  <div className={styles.fieldFrameToolbar}>
                    <div className={styles.fieldFrameMode}>
                      <span className={styles.summaryLabel}>Сцена поля</span>
                      <strong>{isResolvedReplayOpen ? 'Просмотр прошлого резолва' : 'Текущий драфт'}</strong>
                      <span className={styles.hint}>
                        {isResolvedReplayOpen && lastResolvedRound
                          ? `Раунд ${lastResolvedRound.roundNumber} · ${resolvedLayerPlaybackLabel}`
                          : `Раунд ${matchSummary.roundNumber} · ${getRoundStatusLabel(matchSummary.roundStatus)}`}
                      </span>
                    </div>
                    {hasReplayAvailable ? (
                      <button
                        className={`${styles.replayToggleButton} ${isResolvedReplayOpen ? styles.replayToggleButtonActive : ''}`.trim()}
                        type="button"
                        aria-label={isResolvedReplayOpen ? 'Вернуться к текущему драфту' : 'Открыть прошлый резолв'}
                        onClick={handleToggleResolvedReplay}
                      >
                        <span className={styles.replayToggleEye} aria-hidden="true">
                          <span className={styles.replayToggleEyePupil} />
                        </span>
                        <span className={styles.replayToggleLabel}>
                          {isResolvedReplayOpen ? 'Закрыть резолв' : 'Глаз'}
                        </span>
                      </button>
                    ) : null}
                  </div>

                  {isResolvedReplayOpen && lastResolvedRound ? (
                    <div className={styles.resolveReplayBanner} data-testid="resolution-replay-banner">
                      <div>
                        <span className={styles.summaryLabel}>Просмотр прошлого раунда</span>
                        <strong className={styles.resolveReplayTitle}>Резолв раунда #{lastResolvedRound.roundNumber}</strong>
                        <span className={styles.hint}>
                          Пока открыт replay, текущее поле драфта скрыто и не смешивается с прошлым раундом.
                        </span>
                      </div>
                      <div className={styles.resolveReplayMeta}>
                        <span className={styles.cardBadge}>{resolvedPlaybackStepLabel}</span>
                        <span className={styles.cardBadge}>{resolvedLayerPlaybackLabel}</span>
                        <span className={styles.cardBadge}>
                          {activeResolvedStageEntryCount} {getStepCountLabel(activeResolvedStageEntryCount)}
                        </span>
                      </div>
                    </div>
                  ) : null}

                  {!isResolvedReplayOpen ? (
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
                  ) : null}

                  <section className={`${styles.battleLane} ${isEnemySideActive ? styles.battleLaneActive : ''} ${isEnemyLaneEmpty ? styles.compactZone : ''}`.trim()}>
                    <div className={styles.battleLaneHeader}>
                      <div>
                        <strong>{isResolvedReplayOpen ? `Резолв соперника · ${primaryEnemyDisplayName || 'Ожидание соперника'}` : primaryEnemyDisplayName || 'Ожидание соперника'}</strong>
                      </div>
                    </div>
                    {visibleEnemyPlaybackEntry ? (
                      <div className={`${styles.ribbonCard} ${styles.ribbonCardPlayback}`.trim()} data-testid="enemy-resolution-playback-card">
                        <div className={styles.ribbonHeader}>
                          <div>
                            <span className={styles.summaryLabel}>Резолв сейчас</span>
                            <strong>{visibleEnemyPlaybackEntry.title}</strong>
                          </div>
                          <div className={styles.ribbonBadgeRow}>
                            <span className={styles.cardBadge}>{resolvedPlaybackStepLabel}</span>
                            <span className={styles.cardBadge}>{visibleEnemyPlaybackEntry.action.status}</span>
                          </div>
                        </div>
                        <span>{visibleEnemyPlaybackEntry.subtitle}</span>
                        <div className={styles.ribbonBadgeRow}>
                          <span className={styles.cardBadge}>{getResolutionLayerLabel(visibleEnemyPlaybackEntry.action.layer)}</span>
                          <span className={styles.cardBadge}>{getRoundActionReasonLabel(visibleEnemyPlaybackEntry.action.reasonCode)}</span>
                        </div>
                        <span className={styles.hint}>{visibleEnemyPlaybackEntry.action.summary}</span>
                      </div>
                    ) : null}
                    {enemyRibbonBoardItems.length > 0 ? (
                      <div className={styles.ribbonSection}>
                        <span className={styles.summaryLabel}>{isResolvedReplayOpen ? 'Сцена соперника' : 'Боевая лента соперника'}</span>
                        <div className={styles.ribbonGrid}>
                          {enemyRibbonBoardItems.map((item) => {
                            const isEnemyPlaybackItemActive = visibleEnemyPlaybackBoardItemId === item.id;

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
                                        ? applyDraftTargetForSelection(item.runtimeId)
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
                        <strong>{isResolvedReplayOpen ? `Твой резолв · ${localDisplayName}` : localDisplayName}</strong>
                      </div>
                    </div>
                    {visibleLocalPlaybackEntry ? (
                      <div className={`${styles.ribbonCard} ${styles.ribbonCardPlayback}`.trim()} data-testid="local-resolution-playback-card">
                        <div className={styles.ribbonHeader}>
                          <div>
                            <span className={styles.summaryLabel}>Резолв сейчас</span>
                            <strong>{visibleLocalPlaybackEntry.title}</strong>
                          </div>
                          <div className={styles.ribbonBadgeRow}>
                            <span className={styles.cardBadge}>{resolvedPlaybackStepLabel}</span>
                            <span className={styles.cardBadge}>
                              {getRoundActionStatusDisplay(visibleLocalPlaybackEntry.action.status)} · {visibleLocalPlaybackEntry.action.status}
                            </span>
                          </div>
                        </div>
                        <span>{visibleLocalPlaybackEntry.subtitle}</span>
                        <div className={styles.ribbonBadgeRow}>
                          <span className={styles.cardBadge}>{getResolutionLayerLabel(visibleLocalPlaybackEntry.action.layer)}</span>
                          <span className={styles.cardBadge}>{getRoundActionReasonLabel(visibleLocalPlaybackEntry.action.reasonCode)}</span>
                        </div>
                        <span className={styles.hint}>{visibleLocalPlaybackEntry.action.summary}</span>
                      </div>
                    ) : null}
                    {hasLocalBattleRibbonEntries ? (
                      <div className={styles.ribbonSection}>
                        <span className={styles.summaryLabel}>{isResolvedReplayOpen ? 'Твоя сцена' : 'Твоя боевая лента'}</span>
                        <div className={styles.ribbonGrid}>
                          {visibleLocalBattleRibbonEntries.map((entry) => {
                            if (entry.kind === 'boardItem') {
                              const { item, attachedActions } = entry;
                              const isSelectedBoardCreature =
                                item.subtype === 'creature' &&
                                selection?.kind === 'creature' &&
                                selection.creatureId === item.runtimeId;
                              const isPlaybackBoardItemActive = visibleLocalPlaybackSourceBoardItemId === item.id;
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
                                        ? applyDraftTargetForSelection(item.runtimeId)
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
                                          onClick={() => setDraftTarget(null)}
                                          disabled={!activeDraftTargetId}
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

                    {!isResolvedReplayOpen ? (
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
                    ) : null}
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
                    <span className={styles.indicatorKicker}>Этапов</span>
                    <strong className={styles.indicatorValue}>{resolvedLayerStages.length}</strong>
                  </div>
                  <div className={styles.resolveSummaryPill}>
                    <span className={styles.indicatorKicker}>Твои шаги</span>
                    <strong className={styles.indicatorValue}>{localResolvedActionCount}</strong>
                    <span className={styles.indicatorSubvalue}>Соперник: {enemyResolvedActionCount}</span>
                  </div>
                </div>
                {resolvedLayerStages.length > 0 ? (
                  <div className={styles.resolveFlowStrip}>
                    <div className={styles.resolveFlowNode}>
                      <span className={styles.indicatorKicker}>Скрытый драфт</span>
                      <strong className={styles.resolveFlowTitle}>Оба игрока собрали намерения</strong>
                      <span className={styles.indicatorSubvalue}>
                        Ты: {localResolvedActionCount} · Соперник: {enemyResolvedActionCount}
                      </span>
                    </div>
                    <span className={styles.resolveFlowArrow} aria-hidden="true">
                      →
                    </span>
                    <div className={`${styles.resolveFlowNode} ${styles.resolveFlowNodeActive}`.trim()}>
                      <span className={styles.indicatorKicker}>Общий резолв</span>
                      <strong className={styles.resolveFlowTitle}>
                        {activeResolvedLayerStage ? activeResolvedLayerStage.modeLabel : 'Ожидание этапа'}
                      </strong>
                      <span className={styles.indicatorSubvalue}>{resolvedLayerPlaybackLabel}</span>
                    </div>
                  </div>
                ) : null}
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
                {activeResolvedLayerStage ? (
                  <div className={styles.resolveStageViewer} data-testid="resolution-stage-viewer">
                    <div className={styles.resolveStageHeader}>
                      <div>
                        <span className={styles.summaryLabel}>Этап общего резолва</span>
                        <strong className={styles.resolveStageTitle} data-testid="resolution-layer-playback-title">
                          {activeResolvedLayerStage.modeLabel}
                        </strong>
                        <span className={styles.hint}>{getResolutionStageHint(activeResolvedLayerStage.layer)}</span>
                      </div>
                      <div className={styles.resolveStageBadgeRow}>
                        <span className={styles.cardBadge} data-testid="resolution-layer-playback-step">
                          {resolvedLayerPlaybackLabel}
                        </span>
                        <span className={`${styles.cardBadge} ${getActionToneBadgeClassName(activeResolvedLayerStage.layer)}`.trim()}>
                          {activeResolvedLayerStage.entries.length} {getStepCountLabel(activeResolvedLayerStage.entries.length)}
                        </span>
                        <span className={styles.cardBadge}>{resolvedLayerPlaybackStepLabel}</span>
                      </div>
                    </div>
                    <div className={styles.resolveStageTrack}>
                      {resolvedLayerStages.map((stage) => {
                        const isActiveStage = stage.index === activeResolvedLayerStageIndex;
                        const isCompletedStage =
                          stage.index < activeResolvedLayerStageIndex ||
                          (resolvedPlaybackComplete && stage.index === activeResolvedLayerStageIndex);

                        return (
                          <div
                            key={`${stage.layer}_${stage.index}`}
                            className={[
                              styles.resolveStageChip,
                              isActiveStage ? styles.resolveStageChipActive : '',
                              isCompletedStage ? styles.resolveStageChipComplete : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                          >
                            <span className={styles.resolveStageChipIndex}>{stage.index + 1}</span>
                            <div className={styles.resolveStageChipText}>
                              <strong>{stage.modeLabel}</strong>
                              <span>
                                {stage.entries.length} {getStepCountLabel(stage.entries.length)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className={styles.resolveStageGrid}>
                      {activeResolvedLayerStage.entries.map((entry) => {
                        const isActiveStageEntry =
                          entry.action.intentId === activeResolvedTimelineEntry?.action.intentId;

                        return (
                          <article
                            key={entry.action.intentId}
                            className={[
                              styles.resolveStageCard,
                              getRoundQueueToneClassName(entry.action.layer),
                              isActiveStageEntry ? styles.resolveStageCardActive : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                          >
                            <div className={styles.resolveStageCardHeader}>
                              <span className={styles.resolveStageCardOrder}>{entry.order}</span>
                              <div className={styles.resolveStageCardHeading}>
                                <strong>{entry.title}</strong>
                                <span>{entry.subtitle}</span>
                              </div>
                            </div>
                            <div className={styles.resolveStageCardMeta}>
                              <span className={styles.cardBadge}>{entry.ownerLabel}</span>
                              <span className={`${styles.cardBadge} ${getActionToneBadgeClassName(entry.action.layer)}`.trim()}>
                                {getRoundActionModeLabel(entry.action.layer)}
                              </span>
                              {isActiveStageEntry ? <span className={styles.cardBadge}>Сейчас</span> : null}
                            </div>
                            <div className={styles.resolveStageCardOutcome}>
                              <strong>{getRoundActionReasonLabel(entry.action.reasonCode)}</strong>
                              <span>{entry.action.summary}</span>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                {resolvedTimelineEntries.length > 0 ? (
                  <div className={styles.resolveTimelineSection}>
                    <div className={styles.resolveTimelineHeader}>
                      <div>
                        <span className={styles.summaryLabel}>Полный порядок</span>
                        <strong>Все шаги общего резолва</strong>
                      </div>
                    </div>
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
                  </div>
                ) : (
                  <div className={styles.emptyState}>Раунд {lastResolvedRound.roundNumber} завершился без результативных действий.</div>
                )}
                {resolvedTimelineEntries.length > 0 ? (
                  <div className={styles.hint}>
                    Шаги показаны в фактическом порядке общего server-side резолва. После `roundResolved` и твои, и вражеские действия отображаются как публичная лента раунда.
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
