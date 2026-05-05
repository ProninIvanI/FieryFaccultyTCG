import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCallback } from 'react';
import {
  buildCatalogCharacterSummaries,
  normalizeCatalog,
  toCardDefinitionFromCatalog,
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
  getRoundDraftValidationCodeLabel,
  getTargetTypeLabel,
} from '@game-core/rounds/presentation';
import { Card } from '@/components';
import { ROUTES } from '@/constants';
import rawCardData from '@/data/cardCatalog';
import { authService, deckService, gameWsService } from '@/services';
import {
  AuthSession,
  GameStateSnapshot,
  JoinRejectedServerMessage,
  PlayerLabelMap,
  PvpConnectionStatus,
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
import {
  getActiveHeroPlaybackEffect,
  getActivePlayerResourcePlaybackEffect,
  getPlaybackNumberOverride,
  getPlaybackValueOverride,
  type BoardItemPlaybackEffect,
  type HeroPlaybackEffect,
  type PlayerResourcePlaybackEffect,
} from './playback';
import {
  getActionTargetPreview,
  getActionToneBadgeClassName,
  getCharacterAccentClassName,
  getCharacterInitials,
  getDurationLabel,
  getInviteJoinRejectHint,
  getPreferredDefaultTargetId,
  getRibbonActionToneClassName,
  getRibbonArtworkAccentClassName,
  getRibbonTargetCompactLabel,
  getRibbonTargetTabAriaLabel,
  getRoundActionFocusLabel,
  getRoundActionModeLabel,
  getRoundActionStatusDisplay,
  getRoundActionTargetSubtitle,
  getRoundQueueToneClassName,
  getTargetButtonAriaLabel,
  toInviteMode,
} from './presentation';
import { AuthRequiredPanel } from './AuthRequiredPanel';
import { ExitConfirmDialog } from './ExitConfirmDialog';
import { LocalBattleRibbon } from './LocalBattleRibbon';
import { LocalHandTray } from './LocalHandTray';
import { MatchFeedDrawer } from './MatchFeedDrawer';
import { MatchWaitingPanel } from './MatchWaitingPanel';
import { OpponentBoardRibbon } from './OpponentBoardRibbon';
import { OpponentPreparationZone } from './OpponentPreparationZone';
import { PlayerSideCard } from './PlayerSideCard';
import { ResolutionReplayStrip } from './ResolutionReplayStrip';
import { RoundDraftRejectedPanel } from './RoundDraftRejectedPanel';
import { SceneAlerts } from './SceneAlerts';
import { SceneInspectPanel } from './SceneInspectPanel';
import { SceneTopBar } from './SceneTopBar';
import {
  getCreatureSummaries,
  getLocalHandCards,
  getLocalPlayerSummary,
  getMatchSummary,
  getPlayerBoardItemSummaries,
  getPlayerBoardSummaries,
  getRoundSyncFromState,
} from './selectors';
import { handleServiceEvent } from './serviceEvents';
import { TurnActionRail } from './TurnActionRail';
import { useMatchFeedDrawer } from './useMatchFeedDrawer';
import { useResolvedReplay } from './useResolvedReplay';
import { useSceneInspect } from './useSceneInspect';
import styles from './PlayPvpPage.module.css';

export interface MatchSummary {
  roundNumber: number;
  roundStatus: string;
  initiativePlayerId: string;
  phase: string;
  playerCount: number;
  actionLogCount: number;
}

export interface LocalPlayerSummary {
  playerId: string;
  mana: number;
  maxMana: number;
  actionPoints: number;
  characterId: string;
}

export interface PlayerBoardSummary extends LocalPlayerSummary {
  deckSize: number;
  handSize: number;
  discardSize: number;
  locked: boolean;
}

const getHeroPlaybackEffectClassName = (effect: HeroPlaybackEffect | null): string => {
  if (!effect) {
    return '';
  }

  switch (effect.tone) {
    case 'damage':
      return styles.avatarTargetPlaybackDamage;
    case 'heal':
      return styles.avatarTargetPlaybackHeal;
    case 'shield':
      return styles.avatarTargetPlaybackShield;
    case 'shieldBreak':
      return styles.avatarTargetPlaybackShieldBreak;
  }
};

const getBoardItemPlaybackEffectClassName = (effect: BoardItemPlaybackEffect | null): string => {
  if (!effect) {
    return '';
  }

  switch (effect.tone) {
    case 'summon':
      return styles.ribbonCardPlaybackSummon;
    case 'destroy':
      return styles.ribbonCardPlaybackDestroy;
    case 'damage':
      return styles.ribbonCardPlaybackDamage;
    case 'heal':
      return styles.ribbonCardPlaybackHeal;
  }
};

const getPlayerResourcePlaybackEffectClassName = (effect: PlayerResourcePlaybackEffect | null): string => {
  if (!effect) {
    return '';
  }

  return effect.tone === 'gain' ? styles.playerResourceGain : styles.playerResourceSpend;
};

export interface HandCardSummary {
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

export interface SceneInspectSummary {
  id: string;
  title: string;
  kicker?: string;
  cornerLabel: string;
  badges: string[];
  stats: Array<{ label: string; value: number | string }>;
  details: string[];
}

export type SceneInspectTarget =
  | { kind: 'hand'; id: string }
  | { kind: 'boardItem'; id: string }
  | { kind: 'roundAction'; id: string };

export interface CreatureSummary {
  creatureId: string;
  ownerId: string;
  hp: number;
  maxHp: number;
  attack: number;
  speed: number;
  summonedAtRound?: number;
}

export interface BoardItemSummary {
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

export interface RoundRibbonActionSummary {
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

export type LocalBattleRibbonEntrySummary =
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

export type BattlefieldSelection =
  | { kind: 'hand'; instanceId: string }
  | { kind: 'creature'; creatureId: string }
  | null;

interface TargetDraft {
  sourceInstanceId: string;
  targetType: TargetType;
  targetId: string;
}

export interface TargetCandidateSummary {
  id: string;
  label: string;
  kind: 'character' | 'creature';
}

export interface RibbonTargetOptionSummary extends TargetCandidateSummary {
  compactLabel: string;
}

export interface RoundSyncSummary {
  roundNumber: number;
  selfLocked: boolean;
  opponentLocked: boolean;
  selfDraftCount: number;
  opponentDraftCount: number;
}

export type RoundDraftRejectedSummary = Omit<RoundDraftRejectedServerMessage, 'type'>;

export type JoinRejectedSummary = Omit<JoinRejectedServerMessage, 'type'>;
export type TransportRejectedSummary = Omit<TransportRejectedServerMessage, 'type'>;

const isPendingTargetSelectionError = (entry: RoundDraftValidationError): boolean =>
  entry.code === 'target_type' && /Target is required/i.test(entry.message);

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

const getRuntimeIdFromBoardItemId = (boardItemId: string): string | null => {
  const separatorIndex = boardItemId.indexOf(':');
  if (separatorIndex < 0 || separatorIndex === boardItemId.length - 1) {
    return null;
  }

  return boardItemId.slice(separatorIndex + 1);
};

const normalizedCardCatalog = normalizeCatalog(rawCardData);
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

const buildSessionId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `session_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `session_${Date.now()}`;
};

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
  const [manaRejectedHandCardId, setManaRejectedHandCardId] = useState<string | null>(null);
  const [draftTarget, setDraftTarget] = useState<TargetDraft | null>(null);
  const [roundDraft, setRoundDraft] = useState<RoundActionIntentDraft[]>([]);
  const [roundSync, setRoundSync] = useState<RoundSyncSummary | null>(null);
  const [roundDraftRejected, setRoundDraftRejected] = useState<RoundDraftRejectedSummary | null>(null);
  const [lastResolvedRound, setLastResolvedRound] = useState<RoundResolutionResult | null>(null);
  const [resolvedRoundHistory, setResolvedRoundHistory] = useState<RoundResolutionResult[]>([]);
  const [selfBoardModel, setSelfBoardModel] = useState<PlayerBoardModel | null>(null);
  const [isExitConfirmOpen, setIsExitConfirmOpen] = useState(false);
  const {
    expandedRoundNumber: expandedFeedRoundNumber,
    setExpandedRoundNumber: setExpandedFeedRoundNumber,
    isOpen: isMatchFeedOpen,
    setIsOpen: setIsMatchFeedOpen,
    panelRef: matchFeedPanelRef,
    toggleRef: matchFeedToggleRef,
  } = useMatchFeedDrawer();
  const [, setRoundAuditEvents] = useState<RoundAuditEvent[]>([]);
  const hasLiveStateRef = useRef(false);
  const autoJoinAttemptedRef = useRef(false);
  const pendingSessionIdRef = useRef('');
  const intentSequenceRef = useRef(0);
  const currentRoundRef = useRef<number | null>(null);
  const roundDraftRef = useRef<RoundActionIntentDraft[]>([]);

  useEffect(() => {
    roundDraftRef.current = roundDraft;
  }, [roundDraft]);

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
        if (event.resolvedRoundHistory) {
          const sortedHistory = [...event.resolvedRoundHistory].sort((left, right) => left.roundNumber - right.roundNumber);
          setResolvedRoundHistory((currentHistory) => {
            const byRound = new Map(currentHistory.map((entry) => [entry.roundNumber, entry] as const));
            sortedHistory.forEach((entry) => byRound.set(entry.roundNumber, entry));
            return [...byRound.values()].sort((left, right) => left.roundNumber - right.roundNumber);
          });
          setLastResolvedRound(sortedHistory[sortedHistory.length - 1] ?? null);
        }
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
  }, [authToken, deckId, mode, playerId, seed, sessionId, setExpandedFeedRoundNumber]);

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
  const enemyBoardItems = useMemo(
    () =>
      primaryEnemyBoard
        ? getPlayerBoardItemSummaries(matchState, primaryEnemyBoard.playerId)
        : [],
    [matchState, primaryEnemyBoard],
  );
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

    if (targetType === 'enemyCharacter' || targetType === 'enemyAny' || targetType === 'any') {
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

    if (targetType === 'enemyAny') {
      enemyCreatures.forEach((creature) => {
        candidates.push({
          id: creature.creatureId,
          label: getResolvedBoardItemLabel(null, creature.creatureId) ?? `РЎСѓС‰РµСЃС‚РІРѕ ${creature.creatureId}`,
          kind: 'creature',
        });
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
  }, [creatures, enemyBoards, enemyCreatures, getPlayerDisplayName, getResolvedBoardItemLabel, localPlayer, playerId]);
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
  }, [matchFeedRounds, setExpandedFeedRoundNumber]);

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
  const {
    handleBlur: handleSceneInspectBlur,
    handleLeave: handleSceneInspectLeave,
    inspectedBoardItemId,
    inspectedHandCardId,
    inspectedRoundActionId,
    selectionLabel: sceneInspectSelectionLabel,
    setTarget: setSceneInspectTarget,
    summary: sceneInspectSummary,
  } = useSceneInspect({
    availableHandCardIds,
    availableHandCards,
    localBoardItemAttachedActionCountById,
    localBoardItemIdByRuntimeId,
    localBoardItemsById,
    localRoundRibbonItemsById,
    selection,
  });
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
  const {
    activeEntry: activeResolvedTimelineEntry,
    activeFrame: activeResolvePlaybackFrame,
    fieldValues: playbackFieldValues,
    hasActiveStep: hasResolvedPlaybackActiveStep,
    hasReplayAvailable,
    isOpen: isResolvedReplayOpen,
    itemRefs: resolvedReplayItemRefs,
    playbackComplete: resolvedPlaybackComplete,
    playbackIndex: resolvedPlaybackIndex,
    toggle: handleToggleResolvedReplay,
    trackRef: resolvedReplayTrackRef,
  } = useResolvedReplay({
    lastResolvedRound,
    resolvedTimelineEntries,
    currentRoundNumber,
    localBoardItems,
  });

  const visibleLocalBattleRibbonEntries = useMemo<LocalBattleRibbonEntrySummary[]>(
    () => (isResolvedReplayOpen ? [] : localBattleRibbonEntries),
    [isResolvedReplayOpen, localBattleRibbonEntries],
  );
  const hasLocalBattleRibbonEntries = visibleLocalBattleRibbonEntries.length > 0;
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
  const localShieldOverride = getPlaybackValueOverride(
    playbackFieldValues,
    'character',
    localPlayer?.characterId,
    'shield',
  );
  const enemyShieldOverride = getPlaybackValueOverride(
    playbackFieldValues,
    'character',
    primaryEnemyBoard?.characterId,
    'shield',
  );
  const localDisplayShield =
    typeof localShieldOverride === 'number'
      ? localShieldOverride
      : localShieldOverride === null
        ? null
        : localCharacterState?.shield?.energy ?? null;
  const enemyDisplayShield =
    typeof enemyShieldOverride === 'number'
      ? enemyShieldOverride
      : enemyShieldOverride === null
        ? null
        : enemyCharacterState?.shield?.energy ?? null;
  const localHeroPlaybackEffect = getActiveHeroPlaybackEffect(
    activeResolvePlaybackFrame,
    localPlayer?.characterId,
  );
  const enemyHeroPlaybackEffect = getActiveHeroPlaybackEffect(
    activeResolvePlaybackFrame,
    primaryEnemyBoard?.characterId,
  );
  const localResourcePlaybackEffect = getActivePlayerResourcePlaybackEffect(
    activeResolvePlaybackFrame,
    localPlayer?.playerId,
  );
  const enemyResourcePlaybackEffect = getActivePlayerResourcePlaybackEffect(
    activeResolvePlaybackFrame,
    primaryEnemyBoard?.playerId,
  );
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
  }, [roundSync?.selfLocked, setSceneInspectTarget]);

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
    return <AuthRequiredPanel />;
  }

  return (
    <div className={styles.scenePage}>
      <SceneTopBar hasMatch={Boolean(matchSummary)} onExitClick={() => setIsExitConfirmOpen(true)} />

      <SceneAlerts
        transportRejected={transportRejected}
        joinRejected={joinRejected}
        inviteJoinRejectHint={inviteJoinRejectHint}
      />

      {isExitConfirmOpen ? (
        <ExitConfirmDialog
          onConfirm={handleConfirmExit}
          onCancel={() => setIsExitConfirmOpen(false)}
        />
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
            <MatchFeedDrawer
              isOpen={isMatchFeedOpen}
              rounds={matchFeedRounds}
              expandedRoundNumber={expandedFeedRoundNumber}
              toggleRef={matchFeedToggleRef}
              panelRef={matchFeedPanelRef}
              onToggleOpen={() => setIsMatchFeedOpen((current) => !current)}
              onToggleRound={(roundNumber) =>
                setExpandedFeedRoundNumber((current) => (current === roundNumber ? null : roundNumber))
              }
            />
            {matchSummary ? (
              <div className={styles.matchOverview}>
                <div className={styles.battlefield}>
                  <section className={styles.boardShell}>
                    <aside className={styles.boardSideColumn}>
                      <PlayerSideCard
                        label="Соперник"
                        isActive={isEnemySideActive}
                        isTargetable={Boolean(primaryEnemyBoard?.characterId && isSelectableTarget(primaryEnemyBoard.characterId))}
                        isTargetActive={Boolean(primaryEnemyBoard?.characterId && isDraftTargetActive(primaryEnemyBoard.characterId))}
                        heroEffectClassName={getHeroPlaybackEffectClassName(enemyHeroPlaybackEffect)}
                        ariaLabel={getTargetButtonAriaLabel(
                          `Маг ${primaryEnemyDisplayName || 'соперника'}`,
                          Boolean(primaryEnemyBoard?.characterId && isSelectableTarget(primaryEnemyBoard.characterId)),
                        )}
                        portraitAccentClassName={getCharacterAccentClassName(enemyCharacter?.faculty)}
                        initials={getCharacterInitials(enemyCharacter?.name ?? 'P1')}
                        shield={enemyDisplayShield}
                        heroFloatingText={enemyHeroPlaybackEffect?.floatingText}
                        title={enemyCharacter?.name ?? 'Ожидание соперника'}
                        subtitle={primaryEnemyDisplayName || 'Подключится позже'}
                        stats={
                          primaryEnemyBoard && enemyCharacterState
                            ? {
                                hp: enemyDisplayHp ?? null,
                                fallbackHp: enemyCharacterState.hp,
                                maxHp: enemyCharacterState.maxHp,
                                mana: enemyDisplayMana ?? null,
                                fallbackMana: primaryEnemyBoard.mana,
                                maxMana: primaryEnemyBoard.maxMana,
                                dexterity: enemyCharacterState.dexterity,
                                concentration: enemyCharacterState.concentration,
                              }
                            : null
                        }
                        resourceEffectClassName={getPlayerResourcePlaybackEffectClassName(enemyResourcePlaybackEffect)}
                        resourceFloatingText={enemyResourcePlaybackEffect?.floatingText}
                        onTargetClick={() => {
                          const enemyCharacterId = primaryEnemyBoard?.characterId;
                          if (enemyCharacterId && isSelectableTarget(enemyCharacterId)) {
                            applyDraftTargetForSelection(enemyCharacterId);
                          }
                        }}
                      />
                      <TurnActionRail
                        canLockRound={canLockRound}
                        isSelfLocked={Boolean(roundSync?.selfLocked)}
                        isOpponentLocked={Boolean(roundSync?.opponentLocked)}
                        hasReplayAvailable={hasReplayAvailable}
                        isResolvedReplayOpen={isResolvedReplayOpen}
                        onLockRound={handleLockRound}
                        onToggleResolvedReplay={handleToggleResolvedReplay}
                      />

                      <PlayerSideCard
                        label="Ты"
                        isActive={isLocalSideActive}
                        isLocal
                        isTargetable={Boolean(localPlayer && isSelectableTarget(localPlayer.characterId))}
                        isTargetActive={Boolean(localPlayer && isDraftTargetActive(localPlayer.characterId))}
                        heroEffectClassName={getHeroPlaybackEffectClassName(localHeroPlaybackEffect)}
                        ariaLabel={getTargetButtonAriaLabel(
                          'Твой маг',
                          Boolean(localPlayer && isSelectableTarget(localPlayer.characterId)),
                        )}
                        portraitAccentClassName={getCharacterAccentClassName(localCharacter?.faculty, true)}
                        initials={getCharacterInitials(localCharacter?.name ?? 'P2')}
                        shield={localDisplayShield}
                        heroFloatingText={localHeroPlaybackEffect?.floatingText}
                        title={localCharacter?.name ?? 'Твой персонаж'}
                        subtitle={localDisplayName}
                        stats={
                          localPlayer && localCharacterState
                            ? {
                                hp: localDisplayHp ?? null,
                                fallbackHp: localCharacterState.hp,
                                maxHp: localCharacterState.maxHp,
                                mana: localDisplayMana ?? null,
                                fallbackMana: localPlayer.mana,
                                maxMana: localPlayer.maxMana,
                                dexterity: localCharacterState.dexterity,
                                concentration: localCharacterState.concentration,
                              }
                            : null
                        }
                        resourceEffectClassName={getPlayerResourcePlaybackEffectClassName(localResourcePlaybackEffect)}
                        resourceFloatingText={localResourcePlaybackEffect?.floatingText}
                        onTargetClick={() => {
                          if (localPlayer && isSelectableTarget(localPlayer.characterId)) {
                            applyDraftTargetForSelection(localPlayer.characterId);
                          }
                        }}
                      />
                    </aside>

                    <section
                      className={`${styles.fieldFrame} ${isResolvedReplayOpen ? styles.fieldFrameReplay : styles.fieldFrameLive}`.trim()}
                    >
                      {isResolvedReplayOpen ? (
                        <ResolutionReplayStrip
                          entries={resolvedTimelineEntries}
                          playerId={playerId}
                          hasActiveStep={hasResolvedPlaybackActiveStep}
                          activeEntry={activeResolvedTimelineEntry}
                          playbackIndex={resolvedPlaybackIndex}
                          playbackComplete={resolvedPlaybackComplete}
                          trackRef={resolvedReplayTrackRef}
                          itemRefs={resolvedReplayItemRefs}
                          getQueueToneClassName={getRoundQueueToneClassName}
                          getToneBadgeClassName={getActionToneBadgeClassName}
                          getModeLabel={getRoundActionModeLabel}
                          getOutcomeLabel={getResolvedActionOutcomeLabel}
                        />
                      ) : null}

                      <div
                        className={`${styles.sceneStage} ${isResolvedReplayOpen ? styles.sceneStageReplay : ''}`.trim()}
                        data-testid="pvp-scene-stage"
                      >
                          <div className={styles.enemyBand}>
                            <OpponentPreparationZone
                              isReplayOpen={isResolvedReplayOpen}
                              isHandEmpty={isEnemyHandEmpty}
                              visibleHandCount={visibleEnemyHandCount}
                              preparationCount={enemyPreparationCount}
                              preparationToneClassName={enemyPreparationToneClassName}
                            />
                            <OpponentBoardRibbon
                              items={enemyBoardItems}
                              getArtworkAccentClassName={getRibbonArtworkAccentClassName}
                              isTargetable={isSelectableTarget}
                              isTargetActive={isDraftTargetActive}
                              onTargetClick={applyDraftTargetForSelection}
                            />
                          </div>
                          <div className={styles.battlefieldCore} aria-hidden="true" />
                          <div className={styles.playerBand}>
                            <section
                              className={`${styles.battleLane} ${styles.playerBattleLane} ${isLocalSideActive ? styles.battleLaneActive : ''} ${isLocalLaneEmpty ? styles.compactZone : ''}`.trim()}
                              data-testid={isResolvedReplayOpen ? 'local-playback-board' : 'local-draft-workspace'}
                            >
                    {hasLocalBattleRibbonEntries ? (
                      <LocalBattleRibbon
                        entries={visibleLocalBattleRibbonEntries}
                        playerId={playerId}
                        selection={selection}
                        activeResolvePlaybackFrame={activeResolvePlaybackFrame}
                        playbackFieldValues={playbackFieldValues}
                        activeResolvedAction={activeResolvedTimelineEntry?.action ?? null}
                        visibleLocalPlaybackSourceBoardItemId={visibleLocalPlaybackSourceBoardItemId}
                        activeLocalPlaybackIntentId={activeLocalPlaybackIntentId}
                        inspectedBoardItemId={inspectedBoardItemId}
                        inspectedRoundActionId={inspectedRoundActionId}
                        isSelfLocked={Boolean(roundSync?.selfLocked)}
                        selectedCreatureActionStatusLabel={selectedCreatureActionStatusLabel}
                        selectedAttackTargetLabel={selectedAttackTargetLabel}
                        canQueueEvade={canQueueEvade}
                        canQueueAttack={canQueueAttack}
                        activeDraftTargetId={activeDraftTargetId}
                        getBoardItemPlaybackEffectClassName={getBoardItemPlaybackEffectClassName}
                        getRibbonActionToneClassName={getRibbonActionToneClassName}
                        getRibbonArtworkAccentClassName={getRibbonArtworkAccentClassName}
                        getDurationLabel={getDurationLabel}
                        getTargetButtonAriaLabel={getTargetButtonAriaLabel}
                        getRibbonTargetTabAriaLabel={getRibbonTargetTabAriaLabel}
                        getRibbonTargetOptions={getRibbonTargetOptions}
                        isSelectableTarget={isSelectableTarget}
                        isDraftTargetActive={isDraftTargetActive}
                        onInspectTarget={setSceneInspectTarget}
                        onInspectLeave={handleSceneInspectLeave}
                        onInspectBlur={handleSceneInspectBlur}
                        onSelectCreature={(creatureId) => setSelection({ kind: 'creature', creatureId })}
                        onApplyDraftTarget={applyDraftTargetForSelection}
                        onQueueEvade={handleQueueEvade}
                        onQueueAttack={handleQueueAttack}
                        onResetDraftTarget={() => setDraftTarget(null)}
                        onRemoveRoundIntent={handleRemoveRoundIntent}
                        onRoundIntentTargetSelect={handleRoundIntentTargetSelect}
                        renderIntentValidationErrors={renderIntentValidationErrors}
                      />
                    ) : null}
                            </section>

                            {visibleRoundDraftRejected ? (
                              <RoundDraftRejectedPanel
                                rejected={visibleRoundDraftRejected}
                                commonErrors={draftRejectionCommonErrors}
                              />
                            ) : null}
                            {!isResolvedReplayOpen ? (
                              <LocalHandTray
                                availableHandCards={availableHandCards}
                                localHandCardCount={localHandCards.length}
                                deckSize={localBoard?.deckSize ?? 0}
                                inspectedHandCardId={inspectedHandCardId}
                                selection={selection}
                                manaRejectedHandCardId={manaRejectedHandCardId}
                                onInspectTarget={setSceneInspectTarget}
                                onInspectLeave={handleSceneInspectLeave}
                                onInspectBlur={handleSceneInspectBlur}
                                onClearManaRejectedCard={(cardId) =>
                                  setManaRejectedHandCardId((current) => (current === cardId ? null : current))
                                }
                                onCardClick={handleHandCardClick}
                              />
                            ) : null}
                          </div>
                        </div>
                    {!isResolvedReplayOpen && sceneInspectSummary ? (
                      <SceneInspectPanel
                        summary={sceneInspectSummary}
                        selectionLabel={sceneInspectSelectionLabel}
                      />
                    ) : null}
                    </section>
                  </section>
                </div>
              </div>
            ) : (
              <MatchWaitingPanel />
            )}
          </Card>
        </div>

      </div>
    </div>
  );
};
