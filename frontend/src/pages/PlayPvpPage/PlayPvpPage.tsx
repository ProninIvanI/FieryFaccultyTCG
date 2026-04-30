import { FocusEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
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
import type { CardDefinition, PlayerBoardModel, ResolutionLayer, ResolvePlaybackFrame, ResolvedRoundAction, RoundDraftValidationError, RoundResolutionResult, TargetType } from '@game-core/types';
import {
  getResolutionLayerLabel,
  getRoundDraftRejectCodeLabel,
  getRoundDraftValidationCodeLabel,
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
  RoundAuditEvent,
  RoundActionIntentDraft,
  RoundDraftRejectedServerMessage,
  TransportRejectedServerMessage,
} from '@/types';
import { buildMatchFeedRounds, type MatchFeedEntrySummary, type MatchFeedRoundSummary } from './matchFeed';
import {
  buildResolvedTimelineEntries,
  getResolvedActionActorLabel as getResolvedActionActorLabelBase,
  getResolvedActionOutcomeLabel as getResolvedActionOutcomeLabelBase,
  getResolvedActionSentence as getResolvedActionSentenceBase,
  getResolvedActionTargetLabel as getResolvedActionTargetLabelBase,
  getResolvedActionTone as getResolvedActionToneBase,
  type ResolvedTimelineEntrySummary,
} from './resolvedActionPresentation';
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

type PlaybackFieldValue = string | number | boolean | null;

interface PlayerBoardSummary extends LocalPlayerSummary {
  deckSize: number;
  handSize: number;
  discardSize: number;
  locked: boolean;
}

const getPlaybackFrames = (round: RoundResolutionResult | null): ResolvePlaybackFrame[] =>
  round?.playbackFrames ?? [];

const getPlaybackStepCount = (round: RoundResolutionResult | null): number => {
  const playbackFrameCount = getPlaybackFrames(round).length;
  return playbackFrameCount > 0 ? playbackFrameCount : round?.orderedActions.length ?? 0;
};

const getPlaybackFieldKey = (entityType: string, entityId: string, field: string): string =>
  `${entityType}:${entityId}:${field}`;

const buildPlaybackFieldValues = (
  frames: ResolvePlaybackFrame[],
  activeIndex: number,
): Map<string, PlaybackFieldValue> => {
  const values = new Map<string, PlaybackFieldValue>();

  frames.forEach((frame) => {
    frame.changes.forEach((change) => {
      const key = getPlaybackFieldKey(change.entity.type, change.entity.id, change.field);
      if (!values.has(key)) {
        values.set(key, change.from);
      }
    });
  });

  frames.slice(0, activeIndex + 1).forEach((frame) => {
    frame.changes.forEach((change) => {
      values.set(getPlaybackFieldKey(change.entity.type, change.entity.id, change.field), change.to);
    });
  });

  return values;
};

const getPlaybackNumberOverride = (
  values: ReadonlyMap<string, PlaybackFieldValue>,
  entityType: string,
  entityId: string | undefined,
  field: string,
): number | null => {
  if (!entityId) {
    return null;
  }

  const value = values.get(getPlaybackFieldKey(entityType, entityId, field));
  return typeof value === 'number' ? value : null;
};

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

interface SceneInspectSummary {
  id: string;
  title: string;
  kicker?: string;
  cornerLabel: string;
  badges: string[];
  stats: Array<{ label: string; value: number | string }>;
  details: string[];
}

type SceneInspectTarget =
  | { kind: 'hand'; id: string }
  | { kind: 'boardItem'; id: string }
  | { kind: 'roundAction'; id: string };

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
  school?: 'fire' | 'water' | 'earth' | 'air';
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
  mana?: number;
  school?: 'fire' | 'water' | 'earth' | 'air';
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
  selfDraftCount: number;
  opponentDraftCount: number;
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

const getHandCardInspectSummary = (card: HandCardSummary): SceneInspectSummary => ({
  id: card.instanceId,
  title: card.name,
  cornerLabel: `Мана ${card.mana}`,
  badges: [
    getCardTypeLabel(card.cardType),
    ...(card.school ? [getCatalogSchoolLabel(card.school)] : []),
  ],
  stats: [
    ...(card.hp ? [{ label: 'HP' as const, value: card.hp }] : []),
    ...(card.attack ? [{ label: 'ATK' as const, value: card.attack }] : []),
    ...(card.speed ? [{ label: 'SPD' as const, value: card.speed }] : []),
  ],
  details: [
    card.effect ??
      (card.cardType === 'summon'
        ? 'Призыв существа из руки в фазу summon.'
        : 'Розыгрыш эффекта после фиксации хода и резолва раунда.'),
  ],
});

const getBoardItemInspectSummary = (
  item: BoardItemSummary,
  options: {
    attachedActionCount: number;
  },
): SceneInspectSummary => ({
  id: item.id,
  title: item.title,
  cornerLabel: item.duration !== undefined ? getDurationLabel(item.duration) : 'На поле',
  badges: [
    item.subtype === 'creature' ? 'Существо' : 'Эффект',
    item.lifetimeType === 'persistent' ? 'Закреплено' : 'Раунд',
    ...(item.school ? [getCatalogSchoolLabel(item.school)] : []),
    ...(item.duration !== undefined ? [getDurationLabel(item.duration)] : []),
    ...(options.attachedActionCount > 0 ? [`Действий: ${options.attachedActionCount}`] : []),
  ],
  stats: [
    ...(item.hp !== undefined && item.maxHp !== undefined
      ? [{ label: 'HP', value: `${item.hp}/${item.maxHp}` }]
      : []),
    ...(item.attack !== undefined ? [{ label: 'ATK', value: item.attack }] : []),
    ...(item.speed !== undefined ? [{ label: 'SPD', value: item.speed }] : []),
  ],
  details: [item.subtitle],
});

const getRoundActionInspectSummary = (action: RoundRibbonActionSummary): SceneInspectSummary => ({
  id: action.id,
  title: action.title,
  cornerLabel: action.mana !== undefined ? `Мана ${action.mana}` : 'В ленте',
  badges: [
    action.modeLabel,
    ...(action.school ? [getCatalogSchoolLabel(action.school)] : []),
    ...(action.targetLabel ? ['Цель выбрана'] : []),
  ],
  stats: [...(action.cardSpeed ? [{ label: 'SPD', value: action.cardSpeed }] : [])],
  details: [
    ...(action.effectSummary ? [action.effectSummary] : []),
    ...(action.targetLabel && action.targetLabel !== action.subtitle ? [`Цель: ${action.targetLabel}`] : []),
    ...(!action.effectSummary || action.subtitle !== action.effectSummary ? [action.subtitle] : []),
  ],
});

const isSameSceneInspectTarget = (
  left: SceneInspectTarget | null,
  right: SceneInspectTarget,
): boolean => left?.kind === right.kind && left.id === right.id;

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

const getRibbonArtworkAccentClassName = (
  school?: 'fire' | 'water' | 'earth' | 'air',
  variant: 'creature' | 'effect' | 'action' = 'action',
): string => {
  if (school) {
    return getCardSchoolAccentClassName(school);
  }

  switch (variant) {
    case 'creature':
      return styles.ribbonArtworkCreature;
    case 'effect':
      return styles.ribbonArtworkEffect;
    case 'action':
      return styles.ribbonArtworkNeutral;
  }
};

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
    case 'deck_invalid':
      return 'Выбранная колода не проходит правила PvP';
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

const getInviteJoinRejectHint = (
  code: JoinRejectedServerMessage['code'],
): string | null => {
  switch (code) {
    case 'session_full':
      return 'Эта invite-сессия уже занята. Скорее всего матч был запущен раньше или ссылка устарела.';
    case 'seed_mismatch':
      return 'Параметры invite-сессии больше не совпадают с состоянием сервера. Лучше запросить новое приглашение.';
    case 'unauthorized':
      return 'Сессия входа истекла. Перезайдите в аккаунт и откройте приглашение заново.';
    case 'deck_unavailable':
      return 'Для входа по приглашению нужна доступная колода. Выберите другую колоду и попробуйте снова.';
    case 'deck_invalid':
      return 'Колода из приглашения сейчас невалидна для PvP. Проверьте состав колоды и персонажа.';
    default:
      return null;
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

const toInviteMode = (value: string | null): 'create' | 'join' | null => {
  if (value === 'create' || value === 'join') {
    return value;
  }

  return null;
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

const normalizedCardCatalog = normalizeCatalog(rawCardData);
const cardCatalogById = new Map(normalizedCardCatalog.cards.map((card) => [card.id, card] as const));
const cardNameByDefinitionId = new Map(normalizedCardCatalog.cards.map((card) => [card.id, card.name] as const));
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

const getDraftManaCost = (draft: RoundActionIntentDraft[], handCards: HandCardSummary[]): number => {
  const handCardManaByInstanceId = new Map(handCards.map((card) => [card.instanceId, card.mana] as const));

  return draft.reduce((total, intent) => {
    if (!('cardInstanceId' in intent) || typeof intent.cardInstanceId !== 'string') {
      return total;
    }

    return total + (handCardManaByInstanceId.get(intent.cardInstanceId) ?? 0);
  }, 0);
};

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
    selfDraftCount:
      isRecord(selfRoundPlayer) && typeof selfRoundPlayer.draftCount === 'number' ? selfRoundPlayer.draftCount : 0,
    opponentDraftCount:
      isRecord(opponentRoundPlayer) && typeof opponentRoundPlayer.draftCount === 'number'
        ? opponentRoundPlayer.draftCount
        : 0,
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
  setResolvedRoundHistory: (
    value: RoundResolutionResult[] | ((current: RoundResolutionResult[]) => RoundResolutionResult[])
  ) => void,
  setRoundDraftRejected: (value: RoundDraftRejectedSummary | null) => void,
  setSelfBoardModel: (value: PlayerBoardModel | null) => void,
  setRoundAuditEvents: (value: RoundAuditEvent[] | ((current: RoundAuditEvent[]) => RoundAuditEvent[])) => void,
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
      selfDraftCount: sortedDraft.length,
      opponentDraftCount: current?.roundNumber === event.roundNumber ? current.opponentDraftCount : 0,
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
      selfDraftCount: event.selfDraftCount,
      opponentDraftCount: event.opponentDraftCount,
    });
    setError('');
    return;
  }

  if (event.type === 'roundResolved') {
    setLastResolvedRound(event.result);
    setResolvedRoundHistory((currentHistory) => {
      const withoutCurrentRound = currentHistory.filter((entry) => entry.roundNumber !== event.result.roundNumber);
      return [...withoutCurrentRound, event.result].sort((left, right) => left.roundNumber - right.roundNumber);
    });
    setSelfBoardModel(null);
    setRoundDraftRejected(null);
    setError('');
    return;
  }

  if (event.type === 'roundAudit') {
    setRoundAuditEvents((current) => [...current, event.event].slice(-120));
    return;
  }

  if (event.type === 'error') {
    setError(event.error);
  }
};

const ExitDoorIcon = () => (
  <span className={styles.exitDoorIcon} aria-hidden="true">
    <span className={styles.exitDoorPanel} />
    <span className={styles.exitDoorHandle} />
  </span>
);

const MatchFeedScrollIcon = () => (
  <span className={styles.matchFeedScrollIcon} aria-hidden="true">
    <span className={styles.matchFeedScrollRollTop} />
    <span className={styles.matchFeedScrollSheet} />
    <span className={styles.matchFeedScrollLine} />
    <span className={styles.matchFeedScrollLine} />
  </span>
);

export const PlayPvpPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const invitedMode = toInviteMode(searchParams.get('mode'));
  const invitedSessionId = searchParams.get('sessionId')?.trim() ?? '';
  const invitedSeed = searchParams.get('seed')?.trim() ?? '';
  const shouldAutoJoinInvite = searchParams.get('autojoin') === '1';
  const [session, setSession] = useState<AuthSession | null>(() => authService.getSession());
  const playerId = session?.userId ?? '';
  const authToken = session?.token ?? '';
  const [mode, setMode] = useState<'create' | 'join'>(invitedMode ?? 'create');
  const [sessionId, setSessionId] = useState(() => invitedSessionId || buildSessionId());
  const [seed, setSeed] = useState(invitedSeed || '1');
  const [deckId, setDeckId] = useState('');
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
  const [sceneInspectTarget, setSceneInspectTarget] = useState<SceneInspectTarget | null>(null);
  const [manaRejectedHandCardId, setManaRejectedHandCardId] = useState<string | null>(null);
  const [draftTarget, setDraftTarget] = useState<TargetDraft | null>(null);
  const [roundDraft, setRoundDraft] = useState<RoundActionIntentDraft[]>([]);
  const [roundSync, setRoundSync] = useState<RoundSyncSummary | null>(null);
  const [roundDraftRejected, setRoundDraftRejected] = useState<RoundDraftRejectedSummary | null>(null);
  const [lastResolvedRound, setLastResolvedRound] = useState<RoundResolutionResult | null>(null);
  const [resolvedRoundHistory, setResolvedRoundHistory] = useState<RoundResolutionResult[]>([]);
  const [expandedFeedRoundNumber, setExpandedFeedRoundNumber] = useState<number | null>(null);
  const [selfBoardModel, setSelfBoardModel] = useState<PlayerBoardModel | null>(null);
  const [resolvedPlaybackIndex, setResolvedPlaybackIndex] = useState(-1);
  const [resolvedPlaybackComplete, setResolvedPlaybackComplete] = useState(true);
  const [isResolvedReplayOpen, setIsResolvedReplayOpen] = useState(false);
  const [isResolvedReplayPinned, setIsResolvedReplayPinned] = useState(false);
  const [isExitConfirmOpen, setIsExitConfirmOpen] = useState(false);
  const [isMatchFeedOpen, setIsMatchFeedOpen] = useState(false);
  const [, setRoundAuditEvents] = useState<RoundAuditEvent[]>([]);
  const hasLiveStateRef = useRef(false);
  const autoJoinAttemptedRef = useRef(false);
  const pendingSessionIdRef = useRef('');
  const intentSequenceRef = useRef(0);
  const currentRoundRef = useRef<number | null>(null);
  const roundDraftRef = useRef<RoundActionIntentDraft[]>([]);
  const resolvedReplayItemRefs = useRef<Record<string, HTMLElement | null>>({});
  const resolvedReplayTrackRef = useRef<HTMLDivElement | null>(null);
  const matchFeedPanelRef = useRef<HTMLDivElement | null>(null);
  const matchFeedToggleRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    roundDraftRef.current = roundDraft;
  }, [roundDraft]);

  useEffect(() => {
    if (!isMatchFeedOpen) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (matchFeedPanelRef.current?.contains(target) || matchFeedToggleRef.current?.contains(target)) {
        return;
      }

      setIsMatchFeedOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isMatchFeedOpen]);

  useEffect(() => {
    if (!error) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setError('');
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [error]);

  useEffect(() => {
    if (!invitedSessionId) {
      return;
    }

    setSessionId(invitedSessionId);
    setMode(invitedMode ?? 'create');
    if (invitedSeed) {
      setSeed(invitedSeed);
    }
  }, [invitedMode, invitedSeed, invitedSessionId]);

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
        setResolvedRoundHistory,
        setRoundDraftRejected,
        setSelfBoardModel,
        setRoundAuditEvents,
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

      if (!deckId && result.decks[0]) {
        setDeckId(result.decks[0].id);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [authToken, deckId]);

  const submitJoinRequest = useCallback(async () => {
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
    setResolvedRoundHistory([]);
    setExpandedFeedRoundNumber(null);
    setRoundAuditEvents([]);
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
  }, [authToken, deckId, mode, playerId, seed, sessionId]);

  useEffect(() => {
    if (
      !shouldAutoJoinInvite ||
      autoJoinAttemptedRef.current ||
      !authToken ||
      !deckId ||
      isDecksLoading ||
      isSubmitting ||
      joinedSessionId ||
      pendingSessionIdRef.current
    ) {
      return;
    }

    autoJoinAttemptedRef.current = true;
    void submitJoinRequest();
  }, [
    authToken,
    deckId,
    isDecksLoading,
    isSubmitting,
    joinedSessionId,
    shouldAutoJoinInvite,
    submitJoinRequest,
  ]);

  useEffect(() => {
    const totalSteps = getPlaybackStepCount(lastResolvedRound);

    if (!lastResolvedRound || totalSteps === 0) {
      setResolvedPlaybackIndex(-1);
      setResolvedPlaybackComplete(true);
      setIsResolvedReplayOpen(false);
      setIsResolvedReplayPinned(false);
      return;
    }

    setResolvedPlaybackIndex(0);
    setResolvedPlaybackComplete(false);
    setIsResolvedReplayOpen(true);
    setIsResolvedReplayPinned(false);
  }, [lastResolvedRound]);

  useEffect(() => {
    const totalSteps = getPlaybackStepCount(lastResolvedRound);

    if (
      !lastResolvedRound ||
      totalSteps === 0 ||
      resolvedPlaybackComplete ||
      resolvedPlaybackIndex < 0
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (resolvedPlaybackIndex >= totalSteps - 1) {
        setResolvedPlaybackComplete(true);
        return;
      }

      setResolvedPlaybackIndex((currentIndex) => Math.min(currentIndex + 1, totalSteps - 1));
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
  const roundDraftManaCost = useMemo(
    () => getDraftManaCost(roundDraft, localHandCards),
    [localHandCards, roundDraft],
  );
  const remainingDraftMana = Math.max(0, (localPlayer?.mana ?? 0) - roundDraftManaCost);
  const canLockRound = Boolean(
    currentRoundNumber > 0 &&
      localPlayer &&
      localPlayer.characterId &&
      status === 'connected' &&
      !roundSync?.selfLocked &&
      !roundDraftRejected &&
      pendingTargetSelectionCount === 0 &&
      roundDraftManaCost <= localPlayer.mana
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
  const availableHandCardIds = useMemo(
    () => new Set(availableHandCards.map((card) => card.instanceId)),
    [availableHandCards],
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
    setResolvedRoundHistory([]);
    setExpandedFeedRoundNumber(null);
    setRoundAuditEvents([]);
    hasLiveStateRef.current = false;
    pendingSessionIdRef.current = '';
    currentRoundRef.current = null;
  };

  const handleConfirmExit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    handleDisconnect();
    setIsExitConfirmOpen(false);
    navigate(ROUTES.HOME);
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

    if (roundDraftRejected) {
      setError('Сервер отклонил текущую ленту. Убери проблемную карту или собери ход заново.');
      return;
    }

    if (roundDraftManaCost > localPlayer.mana) {
      setError('На текущую ленту не хватает маны.');
      return;
    }

    try {
      gameWsService.lockRound(currentRoundNumber);
      setSelection(null);
      setSceneInspectTarget(null);
      setDraftTarget(null);
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

  const handleHandCardClick = (card: HandCardSummary, event?: { currentTarget: HTMLButtonElement }) => {
    if (!canActFromHand) {
      setSelection(null);
      setDraftTarget(null);
      setSceneInspectTarget(null);
      setManaRejectedHandCardId(null);
      setError('');
      return;
    }

    setManaRejectedHandCardId(null);
    setSelection({ kind: 'hand', instanceId: card.instanceId });
    setError('');

    if (!localPlayer || !currentRoundNumber) {
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

    if (localPlayer.mana < roundDraftManaCost + card.mana) {
      event?.currentTarget.blur();
      setSelection(null);
      setDraftTarget(null);
      setSceneInspectTarget(null);
      setManaRejectedHandCardId(card.instanceId);
      setError(`Не хватает маны: доступно ${remainingDraftMana}, карта стоит ${card.mana}.`);
      return;
    }

    if (card.cardType === 'summon') {
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
    const removedIntent = roundDraftRef.current.find((intent) => intent.intentId === intentId);

    if (removedIntent) {
      if ('cardInstanceId' in removedIntent) {
        setSceneInspectTarget((current) =>
          current?.kind === 'hand' && current.id === removedIntent.cardInstanceId ? null : current,
        );
        setSelection((current) =>
          current?.kind === 'hand' && current.instanceId === removedIntent.cardInstanceId ? null : current,
        );
        setDraftTarget((current) =>
          current?.sourceInstanceId === removedIntent.cardInstanceId ? null : current,
        );
      }

      if (removedIntent.kind === 'Attack') {
        setSceneInspectTarget((current) =>
          current?.kind === 'roundAction' && current.id === removedIntent.intentId ? null : current,
        );
        setDraftTarget((current) =>
          current?.sourceInstanceId === removedIntent.sourceCreatureId ? null : current,
        );
      }

      if (removedIntent.kind === 'Evade') {
        setSceneInspectTarget((current) =>
          current?.kind === 'roundAction' && current.id === removedIntent.intentId ? null : current,
        );
      }
    }

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
  const getResolvedActionTargetLabel = useCallback(
    (action: ResolvedRoundAction): string =>
      getResolvedActionTargetLabelBase(
        {
          playerId,
          knownTargetLabelsById,
          cardNameByDefinitionId,
          getPlayerDisplayName,
          getResolvedBoardItemLabel,
          getResolvedCharacterLabel,
        },
        action,
      ),
    [getPlayerDisplayName, getResolvedBoardItemLabel, getResolvedCharacterLabel, knownTargetLabelsById, playerId],
  );
  const getResolvedActionActorLabel = useCallback(
    (action: ResolvedRoundAction): string =>
      getResolvedActionActorLabelBase(
        {
          playerId,
          knownTargetLabelsById,
          cardNameByDefinitionId,
          getPlayerDisplayName,
          getResolvedBoardItemLabel,
          getResolvedCharacterLabel,
        },
        action,
      ),
    [getPlayerDisplayName, getResolvedBoardItemLabel, getResolvedCharacterLabel, knownTargetLabelsById, playerId],
  );
  const getResolvedActionOutcomeLabel = useCallback(
    (action: ResolvedRoundAction): string => getResolvedActionOutcomeLabelBase(action),
    [],
  );
  const getResolvedActionTone = useCallback(
    (action: ResolvedRoundAction): MatchFeedEntrySummary['tone'] => getResolvedActionToneBase(action),
    [],
  );
  const getResolvedActionSentence = useCallback(
    (action: ResolvedRoundAction): string =>
      getResolvedActionSentenceBase(
        {
          playerId,
          knownTargetLabelsById,
          cardNameByDefinitionId,
          getPlayerDisplayName,
          getResolvedBoardItemLabel,
          getResolvedCharacterLabel,
        },
        action,
      ),
    [getPlayerDisplayName, getResolvedBoardItemLabel, getResolvedCharacterLabel, knownTargetLabelsById, playerId],
  );
  const matchFeedRounds = useMemo<MatchFeedRoundSummary[]>(
    () =>
      buildMatchFeedRounds({
        matchState,
        resolvedRoundHistory,
        knownTargetLabelsById,
        getResolvedActionActorLabel,
        getResolvedActionSentence,
        getResolvedActionTargetLabel,
        getResolvedActionOutcomeLabel,
        getResolvedActionTone,
      }),
    [
      getResolvedActionActorLabel,
      getResolvedActionOutcomeLabel,
      getResolvedActionSentence,
      getResolvedActionTargetLabel,
      getResolvedActionTone,
      knownTargetLabelsById,
      matchState,
      resolvedRoundHistory,
    ],
  );

  useEffect(() => {
    if (matchFeedRounds.length === 0) {
      setExpandedFeedRoundNumber(null);
      return;
    }

    setExpandedFeedRoundNumber((current) => {
      if (current !== null && matchFeedRounds.some((round) => round.roundNumber === current)) {
        return current;
      }

      return null;
    });
  }, [matchFeedRounds]);

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
            mana: matchingCard?.mana,
            school: matchingCard?.school,
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
        mana: intentCard?.mana,
        school: intentCard?.school,
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
  const localRoundRibbonItemsById = useMemo(
    () => new Map(localRoundRibbonItems.map((action) => [action.id, action] as const)),
    [localRoundRibbonItems],
  );
  const localBoardItemAttachedActionCountById = useMemo(
    () =>
      new Map(
        localBattleRibbonEntries.flatMap((entry) =>
          entry.kind === 'boardItem' ? [[entry.item.id, entry.attachedActions.length] as const] : [],
        ),
      ),
    [localBattleRibbonEntries],
  );
  const resolvedSceneInspectTarget = useMemo<SceneInspectTarget | null>(() => {
    if (sceneInspectTarget) {
      return sceneInspectTarget;
    }

    if (selection?.kind === 'hand' && availableHandCardIds.has(selection.instanceId)) {
      return { kind: 'hand', id: selection.instanceId };
    }

    return null;
  }, [availableHandCardIds, sceneInspectTarget, selection]);
  const sceneInspectSummary = useMemo(() => {
    if (!resolvedSceneInspectTarget) {
      return null;
    }

    if (resolvedSceneInspectTarget.kind === 'hand') {
      const card = availableHandCards.find((entry) => entry.instanceId === resolvedSceneInspectTarget.id);
      return card ? getHandCardInspectSummary(card) : null;
    }

    if (resolvedSceneInspectTarget.kind === 'boardItem') {
      const item = localBoardItemsById.get(resolvedSceneInspectTarget.id);
      if (!item) {
        return null;
      }

      return getBoardItemInspectSummary(item, {
        attachedActionCount: localBoardItemAttachedActionCountById.get(item.id) ?? 0,
      });
    }

    const action = localRoundRibbonItemsById.get(resolvedSceneInspectTarget.id);
    return action ? getRoundActionInspectSummary(action) : null;
  }, [
    localBoardItemAttachedActionCountById,
    localBoardItemsById,
    availableHandCards,
    localRoundRibbonItemsById,
    resolvedSceneInspectTarget,
  ]);
  const inspectedHandCardId = resolvedSceneInspectTarget?.kind === 'hand' ? resolvedSceneInspectTarget.id : null;
  const inspectedBoardItemId = resolvedSceneInspectTarget?.kind === 'boardItem' ? resolvedSceneInspectTarget.id : null;
  const inspectedRoundActionId =
    resolvedSceneInspectTarget?.kind === 'roundAction' ? resolvedSceneInspectTarget.id : null;
  const sceneInspectSelectionLabel = useMemo(() => {
    if (!resolvedSceneInspectTarget) {
      return null;
    }

    if (resolvedSceneInspectTarget.kind === 'hand') {
      return selection?.kind === 'hand' && selection.instanceId === resolvedSceneInspectTarget.id
        ? 'Выбрана'
        : null;
    }

    if (resolvedSceneInspectTarget.kind === 'boardItem') {
      const selectedBoardItemId =
        selection?.kind === 'creature' ? localBoardItemIdByRuntimeId.get(selection.creatureId) ?? null : null;
      return selectedBoardItemId === resolvedSceneInspectTarget.id ? 'Выбрана' : null;
    }

    return null;
  }, [localBoardItemIdByRuntimeId, resolvedSceneInspectTarget, selection]);
  const handleSceneInspectLeave = useCallback((target: SceneInspectTarget) => {
    setSceneInspectTarget((current) => (isSameSceneInspectTarget(current, target) ? null : current));
  }, []);
  const handleSceneInspectBlur = useCallback(
    (event: FocusEvent<HTMLElement>, target: SceneInspectTarget) => {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
        return;
      }

      handleSceneInspectLeave(target);
    },
    [handleSceneInspectLeave],
  );

  useEffect(() => {
    if (!sceneInspectTarget) {
      return;
    }

    if (sceneInspectTarget.kind === 'hand') {
      if (!availableHandCardIds.has(sceneInspectTarget.id)) {
        setSceneInspectTarget(null);
      }
      return;
    }

    if (sceneInspectTarget.kind === 'boardItem') {
      if (!localBoardItemsById.has(sceneInspectTarget.id)) {
        setSceneInspectTarget(null);
      }
      return;
    }

    if (!localRoundRibbonItemsById.has(sceneInspectTarget.id)) {
      setSceneInspectTarget(null);
    }
  }, [availableHandCardIds, localBoardItemsById, localRoundRibbonItemsById, sceneInspectTarget]);
  const hasLocalBattleRibbonEntries = visibleLocalBattleRibbonEntries.length > 0;

  const resolvedTimelineEntries = useMemo<ResolvedTimelineEntrySummary[]>(
    () =>
      buildResolvedTimelineEntries(
        {
          playerId,
          knownTargetLabelsById,
          cardNameByDefinitionId,
          getPlayerDisplayName,
          getResolvedBoardItemLabel,
          getResolvedCharacterLabel,
        },
        lastResolvedRound,
        matchState,
      ),
    [
      getPlayerDisplayName,
      getResolvedBoardItemLabel,
      getResolvedCharacterLabel,
      knownTargetLabelsById,
      matchState,
      lastResolvedRound,
      playerId,
    ],
  );
  const resolvePlaybackFrames = useMemo(
    () => getPlaybackFrames(lastResolvedRound),
    [lastResolvedRound],
  );
  const activeResolvePlaybackFrame =
    resolvedPlaybackIndex >= 0 && resolvedPlaybackIndex < resolvePlaybackFrames.length
      ? resolvePlaybackFrames[resolvedPlaybackIndex]
      : null;
  const hasResolvedPlaybackActiveStep =
    !resolvedPlaybackComplete || getPlaybackStepCount(lastResolvedRound) <= 1;
  const activeResolvedTimelineEntry =
    activeResolvePlaybackFrame?.actionIntentId
      ? resolvedTimelineEntries.find((entry) => entry.action.intentId === activeResolvePlaybackFrame.actionIntentId) ?? null
      : hasResolvedPlaybackActiveStep &&
          resolvedPlaybackIndex >= 0 &&
          resolvedPlaybackIndex < resolvedTimelineEntries.length
        ? resolvedTimelineEntries[resolvedPlaybackIndex]
        : null;
  const playbackFieldValues = useMemo(
    () =>
      isResolvedReplayOpen && resolvePlaybackFrames.length > 0
        ? buildPlaybackFieldValues(resolvePlaybackFrames, resolvedPlaybackIndex)
        : new Map<string, PlaybackFieldValue>(),
    [isResolvedReplayOpen, resolvePlaybackFrames, resolvedPlaybackIndex],
  );
  const localDisplayHp =
    getPlaybackNumberOverride(playbackFieldValues, 'character', localPlayer?.characterId, 'hp') ??
    localCharacterState?.hp;
  const enemyDisplayHp =
    getPlaybackNumberOverride(playbackFieldValues, 'character', primaryEnemyBoard?.characterId, 'hp') ??
    enemyCharacterState?.hp;
  const localDisplayMana =
    getPlaybackNumberOverride(playbackFieldValues, 'player', localPlayer?.playerId, 'mana') ??
    localPlayer?.mana;
  const enemyDisplayMana =
    getPlaybackNumberOverride(playbackFieldValues, 'player', primaryEnemyBoard?.playerId, 'mana') ??
    primaryEnemyBoard?.mana;
  const enemyPreparationCount = Math.max(0, roundSync?.opponentDraftCount ?? 0);
  const visibleEnemyHandCount = Math.max(0, (primaryEnemyBoard?.handSize ?? 0) - enemyPreparationCount);
  const isEnemyHandEmpty = visibleEnemyHandCount === 0;
  const isLocalLaneEmpty = !hasLocalBattleRibbonEntries;
  const enemyPreparationToneClassName = roundSync?.opponentLocked
    ? styles.opponentIntentTrayLocked
    : styles.opponentIntentTrayActive;
  const activeLocalPlaybackIntentId =
    isResolvedReplayOpen && activeResolvedTimelineEntry?.action.playerId === playerId
      ? activeResolvedTimelineEntry.action.intentId
      : null;
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
    isResolvedReplayOpen && activeResolvedTimelineEntry?.action.playerId === playerId
      ? activeResolvedTimelineEntry.action
      : null,
    localBoardItemIdByRuntimeId,
    localBoardItems,
  );
  const inviteJoinRejectHint =
    invitedSessionId && joinRejected?.sessionId === invitedSessionId
      ? getInviteJoinRejectHint(joinRejected.code)
      : null;
  const visibleLocalPlaybackSourceBoardItemId = isResolvedReplayOpen ? activeLocalPlaybackSourceBoardItemId : null;
  const hasReplayAvailable = Boolean(lastResolvedRound && resolvedTimelineEntries.length > 0);
  const hasCurrentRoundAdvancedPastReplay =
    Boolean(lastResolvedRound) && currentRoundNumber > (lastResolvedRound?.roundNumber ?? 0);
  const restartResolvedReplay = useCallback(
    (pinned: boolean) => {
      const totalSteps = getPlaybackStepCount(lastResolvedRound);
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

  useEffect(() => {
    if (!isResolvedReplayOpen || !activeResolvedTimelineEntry) {
      return;
    }

    const replayTrack = resolvedReplayTrackRef.current;
    const replayItem = resolvedReplayItemRefs.current[activeResolvedTimelineEntry.action.intentId];

    if (!replayTrack || !replayItem) {
      return;
    }

    const nextScrollLeft =
      replayItem.offsetLeft - Math.max(0, (replayTrack.clientWidth - replayItem.clientWidth) / 2);
    const boundedScrollLeft = Math.max(0, nextScrollLeft);

    if (typeof replayTrack.scrollTo === 'function') {
      replayTrack.scrollTo({
        left: boundedScrollLeft,
        behavior: 'smooth',
      });
    } else {
      replayTrack.scrollLeft = boundedScrollLeft;
    }

    if (typeof document.scrollingElement?.scrollTo === 'function') {
      document.scrollingElement.scrollTo({
        left: 0,
        top: document.scrollingElement.scrollTop,
      });
    } else if (document.scrollingElement) {
      document.scrollingElement.scrollLeft = 0;
    }
  }, [activeResolvedTimelineEntry, isResolvedReplayOpen]);

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
        roundDraftRejected.errors.some((entry) => !isPendingTargetSelectionError(entry))
      ),
  );
  const visibleRoundDraftRejected = shouldShowRoundDraftRejected ? roundDraftRejected : null;
  const renderIntentValidationErrors = (intentId: string) =>
    !shouldShowRoundDraftRejected
      ? null
      : draftRejectionErrorsByIntentId.get(intentId)?.map((entry) => (
          <div key={`${intentId}_${entry.code}_${entry.message}`} className={styles.roundQueueError}>
            <span className={styles.cardBadge}>{entry.code}</span>
            <span>{getRoundDraftValidationCodeLabel(entry.code)}</span>
          </div>
        )) ?? null;

  useEffect(() => {
    if (!roundSync?.selfLocked) {
      return;
    }

    setSelection(null);
    setSceneInspectTarget(null);
    setDraftTarget(null);
  }, [roundSync?.selfLocked]);

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
        title="Дуэль магов"
        subtitle="Войдите в аккаунт, чтобы выйти на арену."
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
    <div className={styles.scenePage}>
      <div className={styles.sceneTopBar}>
        <div className={styles.sceneTitleBlock}>
          <h1 className={styles.sceneTitle}>Дуэль магов</h1>
          {!matchSummary ? (
            <div className={styles.sceneMeta}>
              <span className={styles.sceneHint}>
                Подключись к матчу, чтобы открыть арену.
              </span>
            </div>
          ) : null}
        </div>
        <div className={styles.sceneActions}>
          <button
            className={styles.exitMatchButton}
            type="button"
            onClick={() => setIsExitConfirmOpen(true)}
            aria-label="Выйти из матча"
            title="Выйти из матча"
          >
            <ExitDoorIcon />
          </button>
        </div>
      </div>

      <div className={styles.sceneAlerts}>
        {transportRejected || joinRejected ? (
          <>
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
              {inviteJoinRejectHint ? <span>{inviteJoinRejectHint}</span> : null}
            </div>
          ) : null}
          </>
        ) : null}
      </div>

      {isExitConfirmOpen ? (
        <div className={styles.exitConfirmOverlay}>
          <form
            className={styles.exitConfirmDialog}
            onSubmit={handleConfirmExit}
            role="dialog"
            aria-modal="true"
            aria-labelledby="exit-confirm-title"
          >
            <div className={styles.exitConfirmHeader}>
              <span className={styles.panelSectionKicker}>Выход из матча</span>
              <strong id="exit-confirm-title" className={styles.panelSectionTitle}>
                Покинуть дуэль?
              </strong>
            </div>
            <p className={styles.paragraph}>
              Ты выйдешь на главную страницу, а текущее PvP-соединение будет закрыто.
            </p>
            <div className={styles.formActions}>
              <button className={styles.primaryButton} type="submit">
                Выйти из матча
              </button>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => setIsExitConfirmOpen(false)}
              >
                Остаться
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className={styles.workbench}>
        <div className={styles.boardColumn}>
          <Card
            className={`${styles.boardCard} ${styles.sceneBoardCard}`.trim()}
            contentClassName={styles.boardCardContent}
          >
            {error ? (
              <div className={styles.boardErrorToast} role="alert">
                {error}
              </div>
            ) : null}
            <button
              ref={matchFeedToggleRef}
              className={`${styles.matchFeedToggleButton} ${isMatchFeedOpen ? styles.matchFeedToggleButtonActive : ''}`.trim()}
              type="button"
              onClick={() => setIsMatchFeedOpen((current) => !current)}
              aria-label={isMatchFeedOpen ? 'Скрыть историю раундов' : 'Открыть историю раундов'}
              aria-expanded={isMatchFeedOpen}
            >
              <MatchFeedScrollIcon />
              {matchFeedRounds.length > 0 ? <span className={styles.matchFeedToggleCount}>{matchFeedRounds.length}</span> : null}
            </button>
            <div
              ref={matchFeedPanelRef}
              className={`${styles.matchFeedDrawer} ${isMatchFeedOpen ? styles.matchFeedDrawerOpen : ''}`.trim()}
              aria-hidden={!isMatchFeedOpen}
            >
              <div className={styles.matchFeedDrawerHeader}>
                <div className={styles.panelSectionHeading}>
                  <span className={styles.panelSectionKicker}>История матча</span>
                  <strong className={styles.panelSectionTitle}>Летопись раундов</strong>
                </div>
                <span className={styles.cardBadge}>
                  {matchFeedRounds.length > 0 ? `${matchFeedRounds.length} раунд${matchFeedRounds.length === 1 ? '' : matchFeedRounds.length < 5 ? 'а' : 'ов'}` : 'Пока пусто'}
                </span>
              </div>
              <div className={styles.matchFeedDrawerBody}>
                {matchFeedRounds.length > 0 ? (
                  <div className={styles.matchFeed} data-testid="match-feed">
                    {matchFeedRounds.map((round) => {
                      const isExpanded = round.roundNumber === expandedFeedRoundNumber;

                      return (
                        <section key={round.roundNumber} className={styles.matchFeedRound}>
                          <button
                            type="button"
                            className={styles.matchFeedRoundToggle}
                            onClick={() =>
                              setExpandedFeedRoundNumber((current) => (current === round.roundNumber ? null : round.roundNumber))
                            }
                            aria-expanded={isExpanded}
                          >
                            <div className={styles.matchFeedRoundHeading}>
                              <strong>{round.title}</strong>
                              <span>{round.subtitle}</span>
                            </div>
                            <span className={styles.matchFeedRoundChevron}>{isExpanded ? 'Свернуть' : 'Раскрыть'}</span>
                          </button>

                          {isExpanded ? (
                            <div className={styles.matchFeedEntries}>
                              {round.entries.map((entry) => (
                                <article
                                  key={entry.id}
                                  className={`${styles.matchFeedEntry} ${
                                    entry.tone === 'success'
                                      ? styles.matchFeedEntryToneSuccess
                                      : entry.tone === 'warning'
                                        ? styles.matchFeedEntryToneWarning
                                        : entry.tone === 'danger'
                                          ? styles.matchFeedEntryToneDanger
                                          : styles.matchFeedEntryToneNeutral
                                  }`}
                                >
                                  <div className={styles.matchFeedEntryMain}>
                                    <strong>{entry.actorLabel}</strong>
                                    <span>{entry.actionLabel}</span>
                                  </div>
                                  {entry.targetLabel ? <div className={styles.matchFeedEntryMeta}>Цель: {entry.targetLabel}</div> : null}
                                  <div className={styles.matchFeedEntryOutcome}>{entry.outcomeLabel}</div>
                                  {entry.detailText ? <div className={styles.matchFeedEntryDetail}>{entry.detailText}</div> : null}
                                  {entry.detailItems?.length ? (
                                    <div className={styles.matchFeedEntryDetails}>
                                      {entry.detailItems.map((detailItem) => (
                                        <div key={detailItem} className={styles.matchFeedEntryDetailItem}>
                                          {detailItem}
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                </article>
                              ))}
                            </div>
                          ) : null}
                        </section>
                      );
                    })}
                  </div>
                ) : (
                  <div className={styles.emptyState}>Раунды появятся после первого резолва.</div>
                )}
              </div>
            </div>
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
                            {primaryEnemyBoard && enemyCharacterState ? (
                              <div className={styles.playerIdentityStats}>
                                <span className={styles.playerIdentityStat}>
                                  HP {enemyDisplayHp ?? enemyCharacterState.hp}/{enemyCharacterState.maxHp}
                                </span>
                                <span className={styles.playerIdentityStat}>
                                  Мана {enemyDisplayMana ?? primaryEnemyBoard.mana}/{primaryEnemyBoard.maxMana}
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
                      <div className={styles.turnActionRail}>
                        <div className={styles.turnActionControls}>
                          <button
                            className={`${styles.primaryButton} ${styles.turnActionButton}`.trim()}
                            type="button"
                            onClick={handleLockRound}
                            disabled={!canLockRound}
                          >
                            {roundSync?.selfLocked ? 'Ждём ход соперника' : 'Завершить ход'}
                          </button>
                          {hasReplayAvailable ? (
                            <button
                              className={`${styles.replayToggleButton} ${styles.turnActionReplayButton} ${isResolvedReplayOpen ? styles.replayToggleButtonActive : ''}`.trim()}
                              type="button"
                              aria-label={isResolvedReplayOpen ? 'Вернуться к текущему драфту' : 'Открыть прошлый резолв'}
                              onClick={handleToggleResolvedReplay}
                            >
                              <span className={styles.replayToggleEye} aria-hidden="true">
                                <span className={styles.replayToggleEyePupil} />
                              </span>
                            </button>
                          ) : null}
                        </div>
                        <div className={styles.turnActionStatus}>
                          <span>
                            Ты: <strong>{roundSync?.selfLocked ? 'Готово' : 'Собираешь ленту'}</strong>
                          </span>
                          <span>
                            Соперник: <strong>{roundSync?.opponentLocked ? 'Готово' : 'Выбирает'}</strong>
                          </span>
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
                            {localPlayer && localCharacterState ? (
                              <div className={styles.playerIdentityStats}>
                                <span className={styles.playerIdentityStat}>
                                  HP {localDisplayHp ?? localCharacterState.hp}/{localCharacterState.maxHp}
                                </span>
                                <span className={styles.playerIdentityStat}>
                                  Мана {localDisplayMana ?? localPlayer.mana}/{localPlayer.maxMana}
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

                    <section
                      className={`${styles.fieldFrame} ${isResolvedReplayOpen ? styles.fieldFrameReplay : styles.fieldFrameLive}`.trim()}
                    >
                      {isResolvedReplayOpen ? (
                        <section className={styles.resolveReplayScene} data-testid="resolution-replay-strip">
                          {activeResolvePlaybackFrame ? (
                            <div className={styles.resolvePlaybackFramePanel} data-testid="resolution-playback-frame">
                              <span className={styles.summaryLabel}>Resolve</span>
                              <strong>{activeResolvePlaybackFrame.label}</strong>
                              {activeResolvePlaybackFrame.changes.length > 0 ? (
                                <div className={styles.resolvePlaybackFrameChanges}>
                                  {activeResolvePlaybackFrame.changes.map((change) => (
                                    <span
                                      key={`${change.entity.type}-${change.entity.id}-${change.field}-${change.from}-${change.to}`}
                                      className={styles.cardBadge}
                                    >
                                      {change.field}: {String(change.from ?? 0)} {'->'} {String(change.to ?? 0)}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                          <div
                            ref={resolvedReplayTrackRef}
                            className={[
                              styles.resolveReplayTrack,
                              resolvedTimelineEntries.length === 1
                                ? styles.resolveReplayTrackSolo
                                : resolvedTimelineEntries.length <= 3
                                  ? styles.resolveReplayTrackSparse
                                  : resolvedTimelineEntries.length >= 6
                                    ? styles.resolveReplayTrackDense
                                    : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                          >
                            {resolvedTimelineEntries.map((entry, index) => {
                              const isReplayItemActive =
                                hasResolvedPlaybackActiveStep &&
                                activeResolvedTimelineEntry?.action.intentId === entry.action.intentId;
                              const isReplayItemResolved =
                                resolvedPlaybackComplete ||
                                (
                                  activeResolvedTimelineEntry
                                    ? entry.action.orderIndex < activeResolvedTimelineEntry.action.orderIndex
                                    : index < resolvedPlaybackIndex
                                );

                              return (
                                <article
                                  key={entry.action.intentId}
                                  ref={(node) => {
                                    resolvedReplayItemRefs.current[entry.action.intentId] = node;
                                  }}
                                  className={[
                                    styles.resolveReplayItem,
                                    getRoundQueueToneClassName(entry.action.layer),
                                    entry.action.playerId === playerId
                                      ? styles.resolveReplayItemLocal
                                      : styles.resolveReplayItemEnemy,
                                    isReplayItemActive ? styles.resolveReplayItemActive : '',
                                    isReplayItemResolved ? styles.resolveReplayItemResolved : '',
                                  ]
                                    .filter(Boolean)
                                    .join(' ')}
                                  data-testid={isReplayItemActive ? 'resolution-replay-item-active' : 'resolution-replay-item'}
                                >
                                  <div className={styles.resolveReplayItemHeader}>
                                    <span className={styles.resolveReplayItemOrder}>{entry.order}</span>
                                    <div className={styles.resolveReplayItemHeading}>
                                      <span className={styles.summaryLabel}>{entry.ownerLabel}</span>
                                      <strong>{entry.title}</strong>
                                    </div>
                                  </div>
                                  {entry.subtitle ? (
                                    <span className={styles.resolveReplayItemSubtitle}>{entry.subtitle}</span>
                                  ) : null}
                                  <div className={styles.resolveReplayItemMeta}>
                                    <span className={`${styles.cardBadge} ${getActionToneBadgeClassName(entry.action.layer)}`.trim()}>
                                      {getRoundActionModeLabel(entry.action.layer)}
                                    </span>
                                    {entry.action.status !== 'resolved' ? (
                                      <span className={styles.cardBadge}>{getResolvedActionOutcomeLabel(entry.action)}</span>
                                    ) : null}
                                    {isReplayItemActive ? <span className={styles.cardBadge}>Сейчас</span> : null}
                                  </div>
                                  {entry.summary ? (
                                    <span className={styles.resolveReplayItemSummary}>{entry.summary}</span>
                                  ) : null}
                                  {isReplayItemActive && activeResolvePlaybackFrame ? (
                                    <span className={styles.resolveReplayItemSummary}>{activeResolvePlaybackFrame.label}</span>
                                  ) : null}
                                  {entry.detailItems.length ? (
                                    <div className={styles.resolveReplayItemDetails}>
                                      {entry.detailItems.map((detailItem) => (
                                        <div key={detailItem} className={styles.resolveReplayItemDetail}>
                                          {detailItem}
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                </article>
                              );
                            })}
                          </div>
                        </section>
                      ) : null}

                      {!isResolvedReplayOpen ? (
                        <div className={styles.sceneStage} data-testid="pvp-scene-stage">
                          <div className={styles.enemyBand}>
                            <section
                              className={`${styles.handTray} ${styles.opponentHandTray} ${isEnemyHandEmpty ? styles.compactZone : ''}`.trim()}
                              data-testid="opponent-hand-tray"
                            >
                              {visibleEnemyHandCount > 0 ? (
                                <div className={styles.opponentHandFanGrid} aria-hidden="true">
                                  {Array.from({ length: visibleEnemyHandCount }).map((_, index) => (
                                    <div
                                      key={`enemy-hand-${index}`}
                                      className={styles.opponentHandCard}
                                      data-testid="opponent-hand-card"
                                    >
                                      <span className={styles.opponentHandCardBack} />
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </section>
                            <section
                              className={`${styles.opponentIntentTray} ${enemyPreparationToneClassName}`.trim()}
                              data-testid="opponent-hidden-draft-zone"
                              aria-label="Скрытая подготовка соперника"
                            >
                              <div className={styles.opponentIntentFan} aria-hidden="true">
                                {enemyPreparationCount > 0 ? (
                                  Array.from({ length: enemyPreparationCount }).map((_, index) => (
                                    <span
                                      key={`opponent-intent-${index}`}
                                      className={`${styles.opponentIntentCard} ${index === 0 ? styles.opponentIntentCardLead : ''}`.trim()}
                                    />
                                  ))
                                ) : null}
                              </div>
                            </section>
                          </div>
                          <div className={styles.battlefieldCore} aria-hidden="true" />
                          <div className={styles.playerBand}>
                            <section className={`${styles.battleLane} ${styles.playerBattleLane} ${isLocalSideActive ? styles.battleLaneActive : ''} ${isLocalLaneEmpty ? styles.compactZone : ''}`.trim()} data-testid="local-draft-workspace">
                    {hasLocalBattleRibbonEntries ? (
                      <div className={styles.ribbonSection}>
                        <div className={styles.ribbonGrid}>
                          {visibleLocalBattleRibbonEntries.map((entry) => {
                            if (entry.kind === 'boardItem') {
                              const { item, attachedActions } = entry;
                              const isSelectedBoardCreature =
                                item.subtype === 'creature' &&
                                selection?.kind === 'creature' &&
                                selection.creatureId === item.runtimeId;
                              const isPlaybackBoardItemActive = visibleLocalPlaybackSourceBoardItemId === item.id;
                              const boardItemInspectTarget: SceneInspectTarget = { kind: 'boardItem', id: item.id };
                              const localCardClassName = [
                                styles.ribbonCard,
                                item.subtype === 'effect' ? styles.ribbonCardEffect : styles.ribbonCardLocal,
                                attachedActions.length > 0 ? styles.ribbonCardActive : '',
                                isPlaybackBoardItemActive ? styles.ribbonCardPlaybackActive : '',
                                inspectedBoardItemId === item.id ? styles.ribbonCardInspected : '',
                              ]
                                .filter(Boolean)
                                .join(' ');

                              return item.subtype === 'creature' ? (
                                <div
                                  key={entry.id}
                                  className={localCardClassName}
                                  data-testid={`battle-ribbon-item-${item.id}`}
                                  onMouseEnter={() => setSceneInspectTarget(boardItemInspectTarget)}
                                  onMouseLeave={() => handleSceneInspectLeave(boardItemInspectTarget)}
                                  onFocusCapture={() => setSceneInspectTarget(boardItemInspectTarget)}
                                  onBlurCapture={(event) => handleSceneInspectBlur(event, boardItemInspectTarget)}
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
                                    <div
                                      className={`${styles.ribbonArtwork} ${getRibbonArtworkAccentClassName(item.school, 'creature')}`.trim()}
                                    >
                                      {attachedActions.length > 0 ? (
                                        <span className={styles.ribbonArtworkBadge}>Действий: {attachedActions.length}</span>
                                      ) : null}
                                    </div>
                                    <div className={styles.ribbonCardBody}>
                                      <strong className={styles.ribbonCompactTitle}>{item.title}</strong>
                                      <div className={styles.ribbonStats}>
                                        <span>HP {item.hp ?? 0}/{item.maxHp ?? 0}</span>
                                        <span>ATK {item.attack ?? 0}</span>
                                        <span>SPD {item.speed ?? 0}</span>
                                      </div>
                                    </div>
                                  </button>
                                  {attachedActions.length > 0 ? (
                                    <div className={styles.ribbonActionStack}>
                                      {attachedActions.map((action) => {
                                        const actionInspectTarget: SceneInspectTarget = { kind: 'roundAction', id: action.id };
                                        const compactActionTitle =
                                          action.sourceType === 'boardItem' ? action.modeLabel : action.title;

                                        return (
                                        <div
                                          key={`${item.id}_${action.id}`}
                                          className={`${styles.ribbonInlineAction} ${getRibbonActionToneClassName(action.layer)} ${activeLocalPlaybackIntentId === action.id ? styles.ribbonInlineActionActive : ''}`.trim()}
                                          data-testid={
                                            activeLocalPlaybackIntentId === action.id
                                              ? 'local-playback-inline-action'
                                              : `battle-ribbon-inline-action-${action.id}`
                                          }
                                          onMouseEnter={() => setSceneInspectTarget(actionInspectTarget)}
                                          onMouseLeave={() => handleSceneInspectLeave(actionInspectTarget)}
                                          onFocusCapture={() => setSceneInspectTarget(actionInspectTarget)}
                                          onBlurCapture={(event) => handleSceneInspectBlur(event, actionInspectTarget)}
                                        >
                                          <div className={styles.ribbonInlineActionHeader}>
                                            <strong className={styles.ribbonCompactTitle}>{compactActionTitle}</strong>
                                            <div className={styles.ribbonBadgeRow}>
                                              {action.cardSpeed ? (
                                                <span className={styles.handStatPill}>SPD {action.cardSpeed}</span>
                                              ) : null}
                                            </div>
                                          </div>
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
                                        );
                                      })}
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
                                <div
                                  key={entry.id}
                                  className={localCardClassName}
                                  data-testid={`battle-ribbon-item-${item.id}`}
                                  onMouseEnter={() => setSceneInspectTarget(boardItemInspectTarget)}
                                  onMouseLeave={() => handleSceneInspectLeave(boardItemInspectTarget)}
                                  onFocusCapture={() => setSceneInspectTarget(boardItemInspectTarget)}
                                  onBlurCapture={(event) => handleSceneInspectBlur(event, boardItemInspectTarget)}
                                >
                                  <div
                                    className={`${styles.ribbonArtwork} ${getRibbonArtworkAccentClassName(item.school, 'effect')}`.trim()}
                                  >
                                    {item.duration !== undefined ? (
                                      <span className={styles.ribbonArtworkBadge}>{getDurationLabel(item.duration)}</span>
                                    ) : attachedActions.length > 0 ? (
                                      <span className={styles.ribbonArtworkBadge}>Действий: {attachedActions.length}</span>
                                    ) : null}
                                  </div>
                                  <div className={styles.ribbonCardBody}>
                                    <strong className={styles.ribbonCompactTitle}>{item.title}</strong>
                                    <div className={styles.ribbonBadgeRow}>
                                      <span className={styles.cardBadge}>{item.lifetimeType === 'persistent' ? 'Закреплено' : 'Раунд'}</span>
                                      {attachedActions.length > 0 ? (
                                        <span className={styles.cardBadge}>Действий: {attachedActions.length}</span>
                                      ) : null}
                                    </div>
                                  </div>
                                  {attachedActions.length > 0 ? (
                                    <div className={styles.ribbonActionStack}>
                                      {attachedActions.map((action) => {
                                        const actionInspectTarget: SceneInspectTarget = { kind: 'roundAction', id: action.id };
                                        const compactActionTitle =
                                          action.sourceType === 'boardItem' ? action.modeLabel : action.title;

                                        return (
                                        <div
                                          key={`${item.id}_${action.id}`}
                                          className={`${styles.ribbonInlineAction} ${getRibbonActionToneClassName(action.layer)} ${activeLocalPlaybackIntentId === action.id ? styles.ribbonInlineActionActive : ''}`.trim()}
                                          data-testid={
                                            activeLocalPlaybackIntentId === action.id
                                              ? 'local-playback-inline-action'
                                              : `battle-ribbon-inline-action-${action.id}`
                                          }
                                          onMouseEnter={() => setSceneInspectTarget(actionInspectTarget)}
                                          onMouseLeave={() => handleSceneInspectLeave(actionInspectTarget)}
                                          onFocusCapture={() => setSceneInspectTarget(actionInspectTarget)}
                                          onBlurCapture={(event) => handleSceneInspectBlur(event, actionInspectTarget)}
                                        >
                                          <div className={styles.ribbonInlineActionHeader}>
                                            <strong className={styles.ribbonCompactTitle}>{compactActionTitle}</strong>
                                            <div className={styles.ribbonBadgeRow}>
                                              {action.cardSpeed ? (
                                                <span className={styles.handStatPill}>SPD {action.cardSpeed}</span>
                                              ) : null}
                                            </div>
                                          </div>
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
                                        );
                                      })}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            }

                            const action = entry.action;
                            const ribbonTargetOptions = action.targetType ? getRibbonTargetOptions(action.targetType) : [];
                            const canAdjustActionTarget = action.sourceType === 'card' && ribbonTargetOptions.length > 0;
                            const roundActionInspectTarget: SceneInspectTarget = { kind: 'roundAction', id: action.id };

                            return (
                              <div
                                key={entry.id}
                                className={`${styles.ribbonCard} ${styles.ribbonCardAction} ${getRibbonActionToneClassName(action.layer)} ${activeLocalPlaybackIntentId === action.id ? styles.ribbonCardPlaybackActive : ''} ${inspectedRoundActionId === action.id ? styles.ribbonCardInspected : ''}`.trim()}
                                data-testid={
                                  activeLocalPlaybackIntentId === action.id
                                    ? 'local-playback-action-card'
                                    : `battle-ribbon-action-${action.id}`
                                }
                                onMouseEnter={() => setSceneInspectTarget(roundActionInspectTarget)}
                                onMouseLeave={() => handleSceneInspectLeave(roundActionInspectTarget)}
                                onFocusCapture={() => setSceneInspectTarget(roundActionInspectTarget)}
                                onBlurCapture={(event) => handleSceneInspectBlur(event, roundActionInspectTarget)}
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
                                  <div
                                      className={`${styles.ribbonArtwork} ${getRibbonArtworkAccentClassName(action.school, 'action')}`.trim()}
                                    >
                                      {action.mana !== undefined ? (
                                        <span className={styles.ribbonArtworkMana}>{action.mana}</span>
                                      ) : null}
                                    </div>
                                    <div className={styles.ribbonCardBody}>
                                      <strong className={`${styles.ribbonCompactTitle} ${styles.ribbonActionMain}`.trim()}>
                                        {action.title}
                                      </strong>
                                      <div className={styles.ribbonBadgeRow}>
                                        {action.cardSpeed ? <span className={styles.handStatPill}>SPD {action.cardSpeed}</span> : null}
                                      </div>
                                    </div>
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
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
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
                            <section className={`${styles.handTray} ${styles.localHandTray}`.trim()} data-testid="local-hand-tray">
                      <div className={styles.battleLaneHeader}>
                        <div>
                          <span className={styles.summaryLabel}>Твоя рука</span>
                          <strong>Карты для текущего раунда</strong>
                        </div>
                        <span className={styles.battleCount}>
                          {availableHandCards.length} карт · колода {localBoard?.deckSize ?? 0}
                        </span>
                      </div>
                      {availableHandCards.length > 0 ? (
                        <div className={styles.handFanGrid}>
                          {availableHandCards.map((card) => (
                            <div
                              key={card.instanceId}
                              className={`${styles.handCard} ${card.cardType === 'summon' ? styles.handCardPlayable : ''} ${getCardAccentClassName(card.cardType)} ${inspectedHandCardId === card.instanceId ? styles.handCardInspected : ''} ${selection?.kind === 'hand' && selection.instanceId === card.instanceId ? styles.handCardSelected : ''} ${manaRejectedHandCardId === card.instanceId ? styles.handCardManaRejected : ''}`.trim()}
                              data-mana-rejected={manaRejectedHandCardId === card.instanceId ? 'true' : undefined}
                              onMouseEnter={() => {
                                if (manaRejectedHandCardId !== card.instanceId) {
                                  setSceneInspectTarget({ kind: 'hand', id: card.instanceId });
                                }
                              }}
                              onMouseLeave={() => {
                                handleSceneInspectLeave({ kind: 'hand', id: card.instanceId });
                                setManaRejectedHandCardId((current) => (current === card.instanceId ? null : current));
                              }}
                              onFocusCapture={() => {
                                if (manaRejectedHandCardId !== card.instanceId) {
                                  setSceneInspectTarget({ kind: 'hand', id: card.instanceId });
                                }
                              }}
                              onBlurCapture={(event) =>
                                handleSceneInspectBlur(event, { kind: 'hand', id: card.instanceId })
                              }
                            >
                              <button
                                className={`${styles.selectionSurface} ${selection?.kind === 'hand' && selection.instanceId === card.instanceId ? styles.selectionSurfaceActive : ''}`.trim()}
                                type="button"
                                onClick={(event) => handleHandCardClick(card, event)}
                              >
                                <div
                                  className={`${styles.handCardArtwork} ${getCardSchoolAccentClassName(card.school)}`.trim()}
                                >
                                  <div className={styles.handCardTop}>
                                    <span className={styles.handManaGem}>{card.mana}</span>
                                  </div>
                                </div>
                                <div className={styles.handCardBody}>
                                  <strong className={styles.handCardTitle}>{card.name}</strong>
                                </div>
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        localHandCards.length > 0 ? (
                          <div className={styles.emptyState}>Все карты из руки уже перенесены в боевую ленту.</div>
                        ) : (
                          <div className={styles.emptyStateSpacer} aria-hidden="true" />
                        )
                      )}
                            </section>
                          </div>
                        </div>
                      ) : null}
                    {!isResolvedReplayOpen && sceneInspectSummary ? (
                      <aside className={styles.fieldInspectPanel} data-testid="scene-inspect-panel" aria-live="polite">
                        <div className={styles.sceneInspectPanel}>
                          <div className={styles.sceneInspectHeader}>
                            <div className={styles.sceneInspectHeading}>
                              {sceneInspectSummary.kicker ? (
                                <span className={styles.summaryLabel}>{sceneInspectSummary.kicker}</span>
                              ) : null}
                              <strong className={styles.sceneInspectTitle}>{sceneInspectSummary.title}</strong>
                            </div>
                            <span className={styles.sceneInspectCorner}>{sceneInspectSummary.cornerLabel}</span>
                          </div>
                          <div className={styles.sceneInspectBadgeRow}>
                            {sceneInspectSummary.badges.map((badge) => (
                              <span key={`${sceneInspectSummary.id}_${badge}`} className={styles.cardBadge}>
                                {badge}
                              </span>
                            ))}
                            {sceneInspectSelectionLabel ? (
                              <span className={`${styles.cardBadge} ${styles.cardBadgeTarget}`.trim()}>
                                {sceneInspectSelectionLabel}
                              </span>
                            ) : null}
                          </div>
                          {sceneInspectSummary.stats.length > 0 ? (
                            <div className={styles.sceneInspectStats}>
                              {sceneInspectSummary.stats.map((stat) => (
                                <span key={`${sceneInspectSummary.id}_${stat.label}`} className={styles.handStatPill}>
                                  {stat.label} {stat.value}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          <div className={styles.sceneInspectDetails}>
                            {sceneInspectSummary.details.map((detail, index) => (
                              <p key={`${sceneInspectSummary.id}_${index}`} className={styles.sceneInspectDetail}>
                                {detail}
                              </p>
                            ))}
                          </div>
                        </div>
                      </aside>
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
                    Матч откроется автоматически после подключения к PvP-сессии.
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>

      </div>
    </div>
  );
};
