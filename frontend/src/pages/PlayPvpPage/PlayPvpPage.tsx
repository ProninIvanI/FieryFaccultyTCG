import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  buildCatalogCharacterSummaries,
  getCatalogCardTypeLabel,
  getCatalogSchoolLabel,
  inferTargetTypeFromCatalog,
  normalizeCatalog,
  toCatalogSchool,
  toCatalogCardUiType,
  type CatalogCharacterSummary,
} from '@game-core/cards/catalog';
import type { ResolutionLayer, RoundResolutionResult, TargetType } from '@game-core/types';
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
  GameStateSnapshot,
  JoinRejectedServerMessage,
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

interface MatchEventSummary {
  id: string;
  title: string;
  description: string;
}

type BattlefieldSelection =
  | { kind: 'hand'; instanceId: string }
  | { kind: 'creature'; creatureId: string }
  | null;

interface TargetDraft {
  sourceInstanceId: string;
  targetType: ReturnType<typeof inferTargetTypeFromCatalog>;
  targetId: string;
}

interface TargetCandidateSummary {
  id: string;
  label: string;
  kind: 'character' | 'creature';
}

interface RoundSyncSummary {
  roundNumber: number;
  selfLocked: boolean;
  opponentLocked: boolean;
}

type RoundDraftRejectedSummary = Omit<RoundDraftRejectedServerMessage, 'type'>;
type JoinRejectedSummary = Omit<JoinRejectedServerMessage, 'type'>;
type TransportRejectedSummary = Omit<TransportRejectedServerMessage, 'type'>;

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

const getRoundStatusLabel = (status: string): string => {
  switch (status) {
    case 'draft':
      return 'Набор действий';
    case 'locked_waiting':
      return 'Ожидание соперника';
    case 'resolving':
      return 'Резолв';
    case 'resolved':
      return 'Завершён';
    default:
      return status || 'Неизвестно';
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
  return `${schoolLabel} · ${mana}/${maxMana} mana`;
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
    setRoundDraftRejected(null);
    setError('');
    return;
  }

  if (event.type === 'error') {
    setError(event.error);
  }
};

export const PlayPvpPage = () => {
  const session = authService.getSession();
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
  const [lastResolvedDraft, setLastResolvedDraft] = useState<RoundActionIntentDraft[]>([]);
  const hasLiveStateRef = useRef(false);
  const pendingSessionIdRef = useRef('');
  const intentSequenceRef = useRef(0);
  const currentRoundRef = useRef<number | null>(null);
  const currentRoundDraftRef = useRef<RoundActionIntentDraft[]>([]);

  useEffect(() => {
    currentRoundDraftRef.current = roundDraft;
  }, [roundDraft]);

  useEffect(() => {
    const unsubscribe = gameWsService.subscribe((event) => {
      if (event.type === 'state') {
        hasLiveStateRef.current = true;
        if (pendingSessionIdRef.current) {
          setJoinedSessionId(pendingSessionIdRef.current);
        }
        setMatchState(event.state);
        setTransportRejected(null);
        setJoinRejected(null);
        setError('');
        return;
      }

      if ((event.type === 'error' || event.type === 'joinRejected' || event.type === 'transportRejected') && !hasLiveStateRef.current) {
        pendingSessionIdRef.current = '';
        setJoinedSessionId('');
        setMatchState(null);
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
  const canSummonMoreCreatures = alliedCreatures.length < 2;
  const enemyBoards = useMemo(() => playerBoards.filter((playerBoard) => playerBoard.playerId !== playerId), [playerBoards, playerId]);
  const localBoard = useMemo(
    () => playerBoards.find((playerBoard) => playerBoard.playerId === playerId) ?? null,
    [playerBoards, playerId]
  );
  const primaryEnemyBoard = enemyBoards[0] ?? null;
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
  const canLockRound = Boolean(
    currentRoundNumber > 0 &&
      localPlayer &&
      localPlayer.characterId &&
      status === 'connected' &&
      !roundSync?.selfLocked
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
  const selectedCreature = useMemo(
    () => (selection?.kind === 'creature' ? creatures.find((creature) => creature.creatureId === selection.creatureId) ?? null : null),
    [creatures, selection]
  );
  const canPlaySelectedCard = Boolean(
    selectedHandCard &&
      selectedHandCard.cardType === 'summon' &&
      canActFromHand &&
      localPlayer &&
      localPlayer.mana >= selectedHandCard.mana &&
      canSummonMoreCreatures
  );
  const selectedCardTargetType = useMemo(
    () => (selectedHandCard ? inferTargetTypeFromCatalog(selectedHandCard.cardType) : null),
    [selectedHandCard]
  );
  const isSelectedCardTargetedAction = Boolean(selectedHandCard && selectedHandCard.cardType !== 'summon' && localPlayer);
  const isSelectedCreatureOwnedByLocalPlayer = Boolean(selectedCreature && selectedCreature.ownerId === playerId);
  const selectedCreatureHasSummoningSickness = Boolean(
    selectedCreature && currentRoundNumber > 0 && selectedCreature.summonedAtRound === currentRoundNumber
  );
  const targetDraft = useMemo<TargetDraft | null>(() => {
    if (!selectedHandCard || !isSelectedCardTargetedAction || !selectedCardTargetType || !draftTargetId) {
      return null;
    }

    return {
      sourceInstanceId: selectedHandCard.instanceId,
      targetType: selectedCardTargetType,
      targetId: draftTargetId,
    };
  }, [draftTargetId, isSelectedCardTargetedAction, selectedCardTargetType, selectedHandCard]);
  const attackTargetDraft = useMemo<TargetDraft | null>(() => {
    if (!selectedCreature || !isSelectedCreatureOwnedByLocalPlayer || !draftTargetId) {
      return null;
    }

    return {
      sourceInstanceId: selectedCreature.creatureId,
      targetType: enemyCreatures.some((creature) => creature.creatureId === draftTargetId) ? 'creature' : 'enemyCharacter',
      targetId: draftTargetId,
    };
  }, [draftTargetId, enemyCreatures, isSelectedCreatureOwnedByLocalPlayer, selectedCreature]);
  const targetCandidates = useMemo<TargetCandidateSummary[]>(() => {
    const candidates: TargetCandidateSummary[] = [];

    if (!localPlayer) {
      return candidates;
    }

    if (selectedCardTargetType) {
      if (selectedCardTargetType === 'allyCharacter' || selectedCardTargetType === 'self' || selectedCardTargetType === 'any') {
        candidates.push({
          id: localPlayer.characterId,
          label: 'Твой маг',
          kind: 'character',
        });
      }

      if (selectedCardTargetType === 'enemyCharacter' || selectedCardTargetType === 'any') {
        enemyBoards.forEach((board) => {
          if (board.characterId) {
            candidates.push({
              id: board.characterId,
              label: `Маг ${board.playerId}`,
              kind: 'character',
            });
          }
        });
      }

      if (selectedCardTargetType === 'creature' || selectedCardTargetType === 'any') {
        creatures.forEach((creature) => {
          candidates.push({
            id: creature.creatureId,
            label: creature.ownerId === playerId ? `Твое существо ${creature.creatureId}` : `Существо ${creature.creatureId}`,
            kind: 'creature',
          });
        });
      }

      return candidates;
    }

    if (isSelectedCreatureOwnedByLocalPlayer) {
      enemyBoards.forEach((board) => {
        if (board.characterId) {
          candidates.push({
            id: board.characterId,
            label: `Маг ${board.playerId}`,
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
  }, [creatures, enemyBoards, enemyCreatures, isSelectedCreatureOwnedByLocalPlayer, localPlayer, playerId, selectedCardTargetType]);
  const knownTargetLabelsById = useMemo(() => {
    const labelMap = new Map<string, string>();

    if (localPlayer?.characterId) {
      labelMap.set(localPlayer.characterId, 'Твой маг');
    }

    enemyBoards.forEach((board) => {
      if (board.characterId) {
        labelMap.set(board.characterId, `Маг ${board.playerId}`);
      }
    });

    creatures.forEach((creature) => {
      labelMap.set(
        creature.creatureId,
        creature.ownerId === playerId ? `Твое существо ${creature.creatureId}` : `Существо ${creature.creatureId}`,
      );
    });

    return labelMap;
  }, [creatures, enemyBoards, localPlayer, playerId]);
  const canSubmitTargetedAction = Boolean(targetDraft && localPlayer && status === 'connected' && canActFromHand);
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
  const previewLayerByIntentId = useMemo(() => {
    const layerMap = new Map<string, ResolutionLayer>();

    roundDraft.forEach((intent) => {
      const selectedTargetType =
        intent.kind === 'CastSpell' || intent.kind === 'PlayCard' || intent.kind === 'Attack'
          ? intent.target.targetType
          : undefined;
      layerMap.set(intent.intentId, getIntentPreviewLayer(intent, selectedTargetType));
    });

    return layerMap;
  }, [roundDraft]);

  const syncRoundDraft = (nextDraft: RoundActionIntentDraft[]): void => {
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
      setError(sendError instanceof Error ? sendError.message : 'Не удалось обновить очередь раунда');
    }
  };

  const buildIntentId = (kind: RoundActionIntentDraft['kind']): string => {
    intentSequenceRef.current += 1;
    return `${playerId || 'player'}_round_${currentRoundNumber}_${kind}_${intentSequenceRef.current}`;
  };

  const appendRoundIntent = (intent: RoundActionIntentDraft): void => {
    if (!currentRoundNumber) {
      setError('Раунд ещё не создан сервером.');
      return;
    }

    syncRoundDraft([...roundDraft, intent]);
  };

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

    appendRoundIntent({
      intentId: buildIntentId('Summon'),
      roundNumber: currentRoundNumber,
      queueIndex: roundDraft.length,
      kind: 'Summon',
      actorId: localPlayer.characterId,
      playerId: localPlayer.playerId,
      cardInstanceId: card.instanceId,
    });
  };

  const handleTargetedCardAction = () => {
    if (!selectedHandCard || !localPlayer || !targetDraft) {
      setError('Сначала выбери карту, тип цели и саму цель.');
      return;
    }

    appendRoundIntent(
      selectedHandCard.cardType === 'spell'
        ? {
            intentId: buildIntentId('CastSpell'),
            roundNumber: currentRoundNumber,
            queueIndex: roundDraft.length,
            kind: 'CastSpell',
            actorId: localPlayer.characterId,
            playerId: localPlayer.playerId,
            cardInstanceId: selectedHandCard.instanceId,
            target: {
              targetType: targetDraft.targetType,
              targetId: targetDraft.targetId,
            },
          }
        : {
            intentId: buildIntentId('PlayCard'),
            roundNumber: currentRoundNumber,
            queueIndex: roundDraft.length,
            kind: 'PlayCard',
            actorId: localPlayer.characterId,
            playerId: localPlayer.playerId,
            cardInstanceId: selectedHandCard.instanceId,
            target: {
              targetType: targetDraft.targetType,
              targetId: targetDraft.targetId,
            },
          }
    );
    setDraftTargetId('');
  };

  const handleQueueAttack = () => {
    if (!selectedCreature || !attackTargetDraft) {
      setError('Сначала выбери своё существо и цель атаки.');
      return;
    }

    appendRoundIntent({
      intentId: buildIntentId('Attack'),
      roundNumber: currentRoundNumber,
      queueIndex: roundDraft.length,
      kind: 'Attack',
      actorId: selectedCreature.creatureId,
      playerId,
      sourceCreatureId: selectedCreature.creatureId,
      target: {
        targetType: attackTargetDraft.targetType,
        targetId: attackTargetDraft.targetId,
      },
    });
    setDraftTargetId('');
  };

  const handleQueueEvade = () => {
    if (!selectedCreature) {
      setError('Сначала выбери своё существо.');
      return;
    }

    appendRoundIntent({
      intentId: buildIntentId('Evade'),
      roundNumber: currentRoundNumber,
      queueIndex: roundDraft.length,
      kind: 'Evade',
      actorId: selectedCreature.creatureId,
      playerId,
    });
    setDraftTargetId('');
  };

  const handleRemoveRoundIntent = (intentId: string) => {
    syncRoundDraft(roundDraft.filter((intent) => intent.intentId !== intentId));
  };

  const handleMoveRoundIntent = (intentId: string, direction: -1 | 1) => {
    const currentIndex = roundDraft.findIndex((intent) => intent.intentId === intentId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= roundDraft.length) {
      return;
    }

    const nextDraft = [...roundDraft];
    const [movedIntent] = nextDraft.splice(currentIndex, 1);
    nextDraft.splice(nextIndex, 0, movedIntent);
    syncRoundDraft(nextDraft);
  };

  const getIntentCardSummary = (instanceId: string): HandCardSummary | null =>
    localHandCards.find((card) => card.instanceId === instanceId) ?? null;

  const getIntentLabel = (intent: RoundActionIntentDraft): string => {
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
  };

  const getIntentTargetLabel = (intent: RoundActionIntentDraft): string => {
    if (intent.kind === 'Summon' || intent.kind === 'Evade') {
      return 'Без цели';
    }

    const { targetId, targetType } = intent.target;
    if (!targetId) {
      return 'Цель уточняется';
    }

    const targetLabel = knownTargetLabelsById.get(targetId);
    return `${getTargetTypeLabel(targetType ?? null)} -> ${targetLabel ?? targetId}`;
  };
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
          ownerLabel: isLocalAction ? 'Ты' : `Соперник · ${action.playerId}`,
          title: draft
            ? getIntentLabel(draft)
            : isLocalAction
              ? `Твой intent ${action.intentId}`
              : 'Скрытое действие соперника',
          subtitle: draft
            ? getIntentTargetLabel(draft)
            : isLocalAction
              ? 'Детали intent не восстановлены локально'
              : `Игрок ${action.playerId}`,
        };
      });

  const draftRejectionErrorsByIntentId = useMemo(() => {
    const errorMap = new Map<string, RoundDraftRejectedSummary['errors']>();
    if (!roundDraftRejected) {
      return errorMap;
    }

    roundDraftRejected.errors.forEach((entry) => {
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
    () => roundDraftRejected?.errors.filter((entry) => !entry.intentId) ?? [],
    [roundDraftRejected],
  );

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
    if (!draftTargetId) {
      return;
    }

    if (!targetCandidates.some((candidate) => candidate.id === draftTargetId)) {
      setDraftTargetId('');
    }
  }, [draftTargetId, targetCandidates]);

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
              Сначала войди в аккаунт, чтобы использовать `userId` как `playerId` для игрового сервера.
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
                <span className={styles.label}>playerId</span>
                <input className={styles.input} type="text" value={playerId} readOnly />
              </label>

              <label className={styles.formRow}>
                <span className={styles.label}>sessionId</span>
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
                <span className={styles.label}>seed</span>
                <input
                  className={styles.input}
                  type="number"
                  value={seed}
                  onChange={(event) => setSeed(event.target.value)}
                  disabled={mode === 'join'}
                />
              </label>

              <label className={styles.formRow}>
                <span className={styles.label}>deck</span>
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
              </div>

              <div className={styles.hintBlock}>
                <div className={styles.hint}>Статус соединения: {status}</div>
                <div className={styles.hint}>
                  Активная сессия: {joinedSessionId || 'ещё не подключено'}
                </div>
                <div className={styles.hint}>
                  Выбранная колода: {savedDecks.find((deck) => deck.id === deckId)?.name ?? 'не выбрана'}
                </div>
                {mode === 'join' ? (
                  <div className={styles.hint}>В режиме входа seed не отправляется — используется seed создателя матча.</div>
                ) : null}
                {isDecksLoading ? (
                  <div className={styles.hint}>Загружаем доступные колоды...</div>
                ) : null}
              </div>

              {transportRejected ? (
                <div className={styles.roundRejectBox}>
                  <strong>
                    Server reject: transport {transportRejected.requestType ? `для ${transportRejected.requestType}` : 'без типа сообщения'}
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
                    Server reject: join {joinRejected.sessionId ? `сессии ${joinRejected.sessionId}` : 'подключения к матчу'}
                  </strong>
                  <div className={styles.roundQueueError}>
                    <span className={styles.cardBadge}>{joinRejected.code}</span>
                    <span>{getJoinRejectCodeLabel(joinRejected.code)}</span>
                  </div>
                  <span>{joinRejected.error}</span>
                </div>
              ) : null}
              {error ? <div className={styles.errorBox}>{error}</div> : null}
            </form>
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
                <div className={styles.matchSpotlight}>
                  <div className={styles.matchSpotlightHeader}>
                    <div>
                      <span className={styles.summaryLabel}>Скрытый раунд</span>
                      <strong className={styles.spotlightValue}>
                        {roundSync?.selfLocked ? 'Твой выбор зафиксирован' : 'Собери очередь действий'}
                      </strong>
                    </div>
                    <button
                      className={styles.primaryButton}
                      type="button"
                      onClick={handleLockRound}
                      disabled={!canLockRound}
                    >
                      {roundSync?.selfLocked ? 'Ожидание lock-in соперника' : 'Lock-in раунда'}
                    </button>
                  </div>
                  <p className={styles.paragraph}>
                    Раунд {matchSummary.roundNumber}, статус {getRoundStatusLabel(matchSummary.roundStatus)}. Инициатива у{' '}
                    {matchSummary.initiativePlayerId || 'не определена'}.
                  </p>
                  <div className={styles.summaryGrid}>
                    <div className={styles.summaryTile}>
                      <span className={styles.summaryLabel}>Раунд</span>
                      <strong>{matchSummary.roundNumber}</strong>
                    </div>
                    <div className={styles.summaryTile}>
                      <span className={styles.summaryLabel}>Статус</span>
                      <strong>{getRoundStatusLabel(matchSummary.roundStatus)}</strong>
                    </div>
                    <div className={styles.summaryTile}>
                      <span className={styles.summaryLabel}>Ты</span>
                      <strong>{roundSync?.selfLocked ? 'Locked' : 'Drafting'}</strong>
                    </div>
                    <div className={styles.summaryTile}>
                      <span className={styles.summaryLabel}>Соперник</span>
                      <strong>{roundSync?.opponentLocked ? 'Locked' : 'Drafting'}</strong>
                    </div>
                  </div>
                </div>

                <div className={styles.battlefield}>
                  <section className={styles.boardShell}>
                    <aside className={styles.boardSideColumn}>
                      <div className={`${styles.playerSideCard} ${isEnemySideActive ? styles.playerSideCardActive : ''}`.trim()}>
                        <span className={styles.playerSideLabel}>Игрок 1</span>
                        <button
                          className={`${styles.avatarTargetButton} ${primaryEnemyBoard?.characterId && isSelectableTarget(primaryEnemyBoard.characterId) ? styles.selectionSurfaceTargetable : ''} ${primaryEnemyBoard?.characterId && isDraftTargetActive(primaryEnemyBoard.characterId) ? styles.selectionSurfaceTargetActive : ''}`.trim()}
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
                            <span>{primaryEnemyBoard?.playerId ?? 'Подключится позже'}</span>
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
                          <span className={styles.summaryLabel}>колода игрока 1</span>
                          <span className={styles.deckRailMeta}>
                            deck: {primaryEnemyBoard?.deckSize ?? 0} · hand: {primaryEnemyBoard?.handSize ?? 0}
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
                      <div className={`${styles.deckRail} ${styles.deckRailVertical} ${isLocalSideActive ? styles.deckRailActive : ''}`.trim()}>
                        <div className={styles.deckRailHeader}>
                          <span className={styles.summaryLabel}>колода игрока 2</span>
                          <span className={styles.deckRailMeta}>
                            deck: {localBoard?.deckSize ?? 0} · hand: {localBoard?.handSize ?? 0}
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
                        <span className={styles.playerSideLabel}>Игрок 2</span>
                        <button
                          className={`${styles.avatarTargetButton} ${localPlayer && isSelectableTarget(localPlayer.characterId) ? styles.selectionSurfaceTargetable : ''} ${localPlayer && isDraftTargetActive(localPlayer.characterId) ? styles.selectionSurfaceTargetActive : ''}`.trim()}
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
                            <span>{playerId}</span>
                            <span>
                              {localPlayer
                                ? getCharacterStatusLabel(localCharacter, localPlayer.mana, localPlayer.maxMana)
                                : 'Нет state'}
                            </span>
                          </div>
                        </button>
                      </div>
                    </aside>

                    <section className={styles.fieldFrame}>
                    <div className={styles.arenaHeader}>
                      <span className={styles.summaryLabel}>Поле</span>
                      <strong>Центральная арена</strong>
                    </div>

                  <section className={`${styles.handTray} ${styles.opponentHandTray}`.trim()}>
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

                  <section className={`${styles.battleLane} ${isEnemySideActive ? styles.battleLaneActive : ''}`.trim()}>
                    <div className={styles.battleLaneHeader}>
                      <div>
                        <strong>{enemyBoards[0]?.playerId ?? 'Ожидание соперника'}</strong>
                      </div>
                    </div>
                    {enemyCreatures.length > 0 ? (
                      <div className={styles.creatureGrid}>
                        {enemyCreatures.map((creature) => (
                          <div key={creature.creatureId} className={styles.creatureCard}>
                            <button
                              className={`${styles.selectionSurface} ${selection?.kind === 'creature' && selection.creatureId === creature.creatureId ? styles.selectionSurfaceActive : ''} ${isSelectableTarget(creature.creatureId) ? styles.selectionSurfaceTargetable : ''} ${isDraftTargetActive(creature.creatureId) ? styles.selectionSurfaceTargetActive : ''}`.trim()}
                              type="button"
                              onClick={() =>
                                isSelectableTarget(creature.creatureId)
                                  ? setDraftTargetId(creature.creatureId)
                                  : setSelection({ kind: 'creature', creatureId: creature.creatureId })
                              }
                            >
                            <div className={styles.creatureBanner}>
                              <div>
                                <span className={styles.summaryLabel}>Существо соперника</span>
                                <strong>{creature.creatureId}</strong>
                              </div>
                              <span className={styles.creatureOwnerTag}>Игрок {creature.ownerId}</span>
                            </div>
                            <div className={styles.creatureStage}>
                              <div className={styles.creaturePortrait}>EN</div>
                              <div className={styles.creatureStats}>
                                <div className={styles.creatureStat}>
                                  <span className={styles.creatureStatLabel}>HP</span>
                                  <strong>
                                    {creature.hp}/{creature.maxHp}
                                  </strong>
                                </div>
                                <div className={styles.creatureStat}>
                                  <span className={styles.creatureStatLabel}>ATK</span>
                                  <strong>{creature.attack}</strong>
                                </div>
                                <div className={styles.creatureStat}>
                                  <span className={styles.creatureStatLabel}>SPD</span>
                                  <strong>{creature.speed}</strong>
                                </div>
                              </div>
                            </div>
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className={styles.emptyState}>Пока пусто. Здесь будут существа соперника.</div>
                    )}
                  </section>

                  <section className={`${styles.battleLane} ${isLocalSideActive ? styles.battleLaneActive : ''}`.trim()}>
                    <div className={styles.battleLaneHeader}>
                      <div>
                        <strong>{playerId}</strong>
                      </div>
                    </div>
                    {alliedCreatures.length > 0 ? (
                      <div className={styles.creatureGrid}>
                        {alliedCreatures.map((creature) => (
                          <div key={creature.creatureId} className={`${styles.creatureCard} ${styles.creatureCardLocal}`.trim()}>
                            <button
                              className={`${styles.selectionSurface} ${selection?.kind === 'creature' && selection.creatureId === creature.creatureId ? styles.selectionSurfaceActive : ''} ${isSelectableTarget(creature.creatureId) ? styles.selectionSurfaceTargetable : ''} ${isDraftTargetActive(creature.creatureId) ? styles.selectionSurfaceTargetActive : ''}`.trim()}
                              type="button"
                              onClick={() =>
                                isSelectableTarget(creature.creatureId)
                                  ? setDraftTargetId(creature.creatureId)
                                  : setSelection({ kind: 'creature', creatureId: creature.creatureId })
                              }
                            >
                            <div className={styles.creatureBanner}>
                              <div>
                                <span className={styles.summaryLabel}>Твое существо</span>
                                <strong>{creature.creatureId}</strong>
                              </div>
                              <span className={styles.creatureOwnerTag}>Под контролем</span>
                            </div>
                            <div className={styles.creatureStage}>
                              <div className={`${styles.creaturePortrait} ${styles.creaturePortraitLocal}`.trim()}>AL</div>
                              <div className={styles.creatureStats}>
                                <div className={styles.creatureStat}>
                                  <span className={styles.creatureStatLabel}>HP</span>
                                  <strong>
                                    {creature.hp}/{creature.maxHp}
                                  </strong>
                                </div>
                                <div className={styles.creatureStat}>
                                  <span className={styles.creatureStatLabel}>ATK</span>
                                  <strong>{creature.attack}</strong>
                                </div>
                                <div className={styles.creatureStat}>
                                  <span className={styles.creatureStatLabel}>SPD</span>
                                  <strong>{creature.speed}</strong>
                                </div>
                              </div>
                            </div>
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className={styles.emptyState}>Пока пусто. Призови первое существо из руки.</div>
                    )}
                  </section>

                  <section className={styles.roundQueuePanel}>
                    <div className={styles.battleLaneHeader}>
                      <div>
                        <span className={styles.summaryLabel}>Action queue</span>
                        <strong>Твой черновик раунда</strong>
                      </div>
                      <span className={styles.battleCount}>{roundDraft.length} действий</span>
                    </div>
                    {roundDraft.length > 0 ? (
                      <div className={styles.roundQueueList}>
                        {roundDraft.map((intent, index) => (
                          <div key={intent.intentId} className={styles.roundQueueItem}>
                            <div className={styles.roundQueueMain}>
                              <span className={styles.roundQueueIndex}>{index + 1}</span>
                              <div className={styles.roundQueueText}>
                                <strong>{getIntentLabel(intent)}</strong>
                                <span>{getIntentTargetLabel(intent)}</span>
                              </div>
                            </div>
                            <div className={styles.roundQueueMeta}>
                              <span className={styles.cardBadge}>
                                {getResolutionLayerLabel(previewLayerByIntentId.get(intent.intentId) ?? 'other_modifiers')}
                              </span>
                              {draftRejectionErrorsByIntentId.get(intent.intentId)?.map((entry) => (
                                <div key={`${intent.intentId}_${entry.code}_${entry.message}`} className={styles.roundQueueError}>
                                  <span className={styles.cardBadge}>{entry.code}</span>
                                  <span>{getRoundDraftValidationCodeLabel(entry.code)}</span>
                                </div>
                              ))}
                              <div className={styles.roundQueueActions}>
                                <button
                                  className={styles.secondaryButton}
                                  type="button"
                                  onClick={() => handleMoveRoundIntent(intent.intentId, -1)}
                                  disabled={Boolean(roundSync?.selfLocked) || index === 0}
                                >
                                  Влево
                                </button>
                                <button
                                  className={styles.secondaryButton}
                                  type="button"
                                  onClick={() => handleMoveRoundIntent(intent.intentId, 1)}
                                  disabled={Boolean(roundSync?.selfLocked) || index === roundDraft.length - 1}
                                >
                                  Вправо
                                </button>
                                <button
                                  className={styles.secondaryButton}
                                  type="button"
                                  onClick={() => handleRemoveRoundIntent(intent.intentId)}
                                  disabled={Boolean(roundSync?.selfLocked)}
                                >
                                  Убрать
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className={styles.emptyState}>Очередь пуста. Выбери карты или существо и собери свой раунд слева направо.</div>
                    )}
                    {roundDraftRejected ? (
                      <div className={styles.roundRejectBox}>
                        <strong>
                          Server reject: {roundDraftRejected.operation === 'lock' ? 'lock-in' : 'replace'}{' '}
                          {roundDraftRejected.roundNumber > 0
                            ? `раунда ${roundDraftRejected.roundNumber}`
                            : 'текущего черновика'}
                        </strong>
                        <div className={styles.roundQueueError}>
                          <span className={styles.cardBadge}>{roundDraftRejected.code}</span>
                          <span>{getRoundDraftRejectCodeLabel(roundDraftRejected.code)}</span>
                        </div>
                        <span>{roundDraftRejected.error}</span>
                        {draftRejectionCommonErrors.map((entry) => (
                          <div key={`${entry.code}_${entry.message}`} className={styles.roundQueueError}>
                            <span className={styles.cardBadge}>{entry.code}</span>
                            <span>{getRoundDraftValidationCodeLabel(entry.code)}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className={styles.hint}>
                      Порядок на экране показывает намерение выбора. Фактический резолв идёт по слоям, а не по FIFO.
                    </div>
                  </section>

                  <section className={styles.handTray}>
                      <div className={styles.battleLaneHeader}>
                        <div>
                          <span className={styles.summaryLabel}>Твоя рука</span>
                          <strong>Карты для текущего раунда</strong>
                        </div>
                        <span className={styles.battleCount}>{localHandCards.length} карт</span>
                      </div>
                      {localHandCards.length > 0 ? (
                        <div className={styles.handFanGrid}>
                          {localHandCards.map((card) => (
                            <div
                              key={card.instanceId}
                              className={`${styles.handCard} ${card.cardType === 'summon' ? styles.handCardPlayable : ''} ${getCardAccentClassName(card.cardType)}`.trim()}
                            >
                              <button
                                className={`${styles.selectionSurface} ${selection?.kind === 'hand' && selection.instanceId === card.instanceId ? styles.selectionSurfaceActive : ''}`.trim()}
                                type="button"
                                onClick={() => {
                                  setSelection({ kind: 'hand', instanceId: card.instanceId });
                                  setDraftTargetId('');
                                }}
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
                              <div className={styles.handCardBody}>
                                <strong>{card.name}</strong>
                                <div className={styles.handCardMeta}>
                                  <span>{getCardTypeLabel(card.cardType)}</span>
                                  {card.speed ? <span>speed {card.speed}</span> : null}
                                </div>
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
                                  <span className={styles.handCardSubtitle}>ID: {card.instanceId}</span>
                                )}
                              </div>
                              <div className={styles.handCardFooter}>
                                <div className={styles.handMetaRow}>
                                  <span className={styles.cardBadge}>{card.mana} mana</span>
                                  <span className={styles.cardBadge}>
                                    {card.cardType === 'summon' ? 'Призыв' : 'Розыгрыш'}
                                  </span>
                                </div>
                              </div>
                              </button>
                              {card.cardType === 'summon' ? (
                                <button
                                  className={styles.primaryButton}
                                  type="button"
                                  onClick={() => handleSummon(card)}
                                  disabled={
                                    !canActFromHand ||
                                    !localPlayer ||
                                    localPlayer.mana < card.mana ||
                                    !canSummonMoreCreatures ||
                                    Boolean(roundSync?.selfLocked)
                                  }
                                >
                                  Добавить призыв
                                </button>
                              ) : (
                                <div className={styles.hint}>Выбери карту, затем цель справа и добавь её в очередь раунда.</div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className={styles.emptyState}>После старта матча здесь появятся реальные карты из руки.</div>
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
          <Card
            title="Модификаторы"
            className={styles.themedCard}
            contentClassName={styles.modifiersCardContent}
          >
            {selectedHandCard ? (
              <div className={styles.focusPanel}>
                <div className={styles.focusHeader}>
                  <div>
                    <span className={styles.summaryLabel}>Выбрана карта</span>
                    <strong>{selectedHandCard.name}</strong>
                  </div>
                  <div className={styles.handCardBadgeStack}>
                    <span className={styles.cardBadge}>{getCardTypeLabel(selectedHandCard.cardType)}</span>
                    {selectedHandCard.school ? (
                      <span className={styles.cardBadge}>{getCatalogSchoolLabel(selectedHandCard.school)}</span>
                    ) : null}
                  </div>
                </div>
                <div className={styles.focusStats}>
                  <div className={styles.focusStat}>
                    <span className={styles.summaryLabel}>Стоимость</span>
                    <strong>{selectedHandCard.mana} mana</strong>
                  </div>
                  {selectedHandCard.speed ? (
                    <div className={styles.focusStat}>
                      <span className={styles.summaryLabel}>Скорость</span>
                      <strong>{selectedHandCard.speed}</strong>
                    </div>
                  ) : null}
                  {selectedHandCard.hp || selectedHandCard.attack ? (
                    <div className={styles.focusStat}>
                      <span className={styles.summaryLabel}>Характеристики</span>
                      <strong>
                        {selectedHandCard.hp ? `HP ${selectedHandCard.hp}` : ''}
                        {selectedHandCard.hp && selectedHandCard.attack ? ' · ' : ''}
                        {selectedHandCard.attack ? `ATK ${selectedHandCard.attack}` : ''}
                      </strong>
                    </div>
                  ) : null}
                  <div className={styles.focusStat}>
                    <span className={styles.summaryLabel}>ID</span>
                    <strong>{selectedHandCard.instanceId}</strong>
                  </div>
                </div>
                {selectedHandCard.effect ? (
                  <div className={styles.handCardEffectPanel}>
                    <span className={styles.summaryLabel}>Эффект</span>
                    <p className={styles.paragraph}>{selectedHandCard.effect}</p>
                  </div>
                ) : null}
                <p className={styles.paragraph}>
                  Карта добавляется в локальную очередь как намерение. Порядок слева направо задаёшь ты, но сервер потом разложит резолв по слоям.
                </p>
                {selectedHandCard.cardType === 'summon' ? (
                  <button
                    className={styles.primaryButton}
                    type="button"
                    onClick={() => handleSummon(selectedHandCard)}
                    disabled={!canPlaySelectedCard || Boolean(roundSync?.selfLocked)}
                  >
                    {canPlaySelectedCard ? 'Добавить призыв в очередь' : 'Недостаточно ресурсов или раунд уже locked'}
                  </button>
                ) : (
                  <div className={styles.focusControls}>
                    <div className={styles.focusStat}>
                      <span className={styles.summaryLabel}>Авто-тип цели</span>
                      <strong>{getTargetTypeLabel(selectedCardTargetType)}</strong>
                    </div>
                    <div className={styles.hint}>
                      Тип цели теперь определяется автоматически из карточного контракта сервера. Выбери одну из подсвеченных целей на поле или в списке ниже.
                    </div>
                    <div className={styles.targetDraftList}>
                      {targetCandidates.map((candidate) => (
                        <button
                          key={candidate.id}
                          className={`${styles.targetDraftItem} ${draftTargetId === candidate.id ? styles.targetDraftItemActive : ''}`.trim()}
                          type="button"
                          onClick={() => setDraftTargetId(candidate.id)}
                        >
                          <strong>{candidate.label}</strong>
                          <span>{candidate.kind === 'character' ? 'Маг' : 'Существо'}</span>
                        </button>
                      ))}
                    </div>
                    <div className={styles.inlineActions}>
                      <button
                        className={styles.primaryButton}
                        type="button"
                        onClick={handleTargetedCardAction}
                        disabled={!canSubmitTargetedAction || Boolean(roundSync?.selfLocked)}
                      >
                        Добавить в очередь
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
                      Черновик:{' '}
                      {targetDraft
                        ? `${getTargetTypeLabel(targetDraft.targetType)} -> ${knownTargetLabelsById.get(targetDraft.targetId) ?? targetDraft.targetId}`
                        : 'цель ещё не выбрана'}
                    </div>
                  </div>
                )}
              </div>
            ) : selectedCreature ? (
              <div className={styles.focusPanel}>
                <div className={styles.focusHeader}>
                  <div>
                    <span className={styles.summaryLabel}>Выбрано существо</span>
                    <strong>{selectedCreature.creatureId}</strong>
                  </div>
                  <span className={styles.cardBadge}>
                    {selectedCreature.ownerId === playerId ? 'Твоё' : 'Соперник'}
                  </span>
                </div>
                <div className={styles.focusStats}>
                  <div className={styles.focusStat}>
                    <span className={styles.summaryLabel}>HP</span>
                    <strong>
                      {selectedCreature.hp}/{selectedCreature.maxHp}
                    </strong>
                  </div>
                  <div className={styles.focusStat}>
                    <span className={styles.summaryLabel}>ATK</span>
                    <strong>{selectedCreature.attack}</strong>
                  </div>
                  <div className={styles.focusStat}>
                    <span className={styles.summaryLabel}>SPD</span>
                    <strong>{selectedCreature.speed}</strong>
                  </div>
                </div>
                {selectedCreature.ownerId === playerId ? (
                  <div className={styles.focusControls}>
                    <div className={styles.focusStat}>
                      <span className={styles.summaryLabel}>Статус действия</span>
                      <strong>
                        {selectedCreatureHasSummoningSickness
                          ? 'Атака закрыта, уклонение доступно'
                          : roundSync?.selfLocked
                            ? 'Раунд locked'
                            : 'Можно добавить атаку или уклонение'}
                      </strong>
                    </div>
                    <div className={styles.hint}>
                      Уклонение не требует цели. Для атаки выбери цель на поле или в списке ниже. Призванное в этом раунде существо не может атаковать до следующего раунда.
                    </div>
                    <div className={styles.targetDraftList}>
                      {targetCandidates.map((candidate) => (
                        <button
                          key={candidate.id}
                          className={`${styles.targetDraftItem} ${draftTargetId === candidate.id ? styles.targetDraftItemActive : ''}`.trim()}
                          type="button"
                          onClick={() => setDraftTargetId(candidate.id)}
                        >
                          <strong>{candidate.label}</strong>
                          <span>{candidate.kind === 'character' ? 'Маг' : 'Существо'}</span>
                        </button>
                      ))}
                    </div>
                    <div className={styles.inlineActions}>
                      <button
                        className={styles.secondaryButton}
                        type="button"
                        onClick={handleQueueEvade}
                        disabled={!canQueueEvade || Boolean(roundSync?.selfLocked)}
                      >
                        Добавить уклонение
                      </button>
                      <button
                        className={styles.primaryButton}
                        type="button"
                        onClick={handleQueueAttack}
                        disabled={!canQueueAttack || Boolean(roundSync?.selfLocked)}
                      >
                        Добавить атаку
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
                      Черновик атаки:{' '}
                      {attackTargetDraft
                        ? `${getTargetTypeLabel(attackTargetDraft.targetType)} -> ${knownTargetLabelsById.get(attackTargetDraft.targetId) ?? attackTargetDraft.targetId}`
                        : 'цель ещё не выбрана'}
                    </div>
                  </div>
                ) : (
                  <div className={styles.hint}>Существо соперника можно выбрать как цель, но не редактировать с него действия.</div>
                )}
              </div>
            ) : (
              <div className={styles.emptyState}>
                Выбери карту в руке или своё существо на столе. Справа откроется панель сборки действий на раунд.
              </div>
            )}
          </Card>

          <Card title="Статус мага" className={styles.themedCard}>
            {localPlayer ? (
              <div className={styles.heroPanel}>
                <div className={styles.heroPanelHeader}>
                  <div>
                    <span className={styles.summaryLabel}>Твой маг</span>
                    <strong>{localPlayer.playerId}</strong>
                  </div>
                  <span className={styles.heroChip}>{roundSync?.selfLocked ? 'Locked' : 'Drafting'}</span>
                </div>
                <div className={styles.detailsList}>
                  <div className={styles.detailRow}>
                    <span>playerId</span>
                    <strong>{localPlayer.playerId}</strong>
                  </div>
                  <div className={styles.detailRow}>
                    <span>characterId</span>
                    <strong>{localPlayer.characterId}</strong>
                  </div>
                  <div className={styles.detailRow}>
                    <span>mana</span>
                    <strong>
                      {localPlayer.mana} / {localPlayer.maxMana}
                    </strong>
                  </div>
                  <div className={styles.detailRow}>
                    <span>actionPoints</span>
                    <strong>{localPlayer.actionPoints}</strong>
                  </div>
                  <div className={styles.detailRow}>
                    <span>creatures</span>
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

          <Card title="Зоны игроков" className={styles.themedCard}>
            {playerBoards.length > 0 ? (
              <div className={styles.playerBoardList}>
                {playerBoards.map((playerBoard) => (
                  <div
                    key={playerBoard.playerId}
                    className={`${styles.playerBoard} ${playerBoard.locked ? styles.playerBoardActive : ''}`.trim()}
                  >
                    <div className={styles.playerBoardHeader}>
                      <strong>{playerBoard.playerId}</strong>
                      <span>{playerBoard.locked ? 'Locked' : 'Drafting'}</span>
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

          <Card title="Последний резолв" className={styles.themedCard}>
            {lastResolvedRound ? (
              <div className={styles.focusPanel}>
                {resolvedTimelineEntries.length > 0 ? (
                  <div className={styles.roundQueueList}>
                    {resolvedTimelineEntries.map(({ order, action, title, subtitle, ownerLabel }) => (
                      <div key={action.intentId} className={styles.roundQueueItem}>
                        <div className={styles.roundQueueMain}>
                          <span className={styles.roundQueueIndex}>{order}</span>
                          <div className={styles.roundQueueText}>
                            <strong>{title}</strong>
                            <span>{subtitle}</span>
                          </div>
                        </div>
                        <div className={styles.roundQueueMeta}>
                          <span className={styles.cardBadge}>{ownerLabel}</span>
                          <span className={styles.cardBadge}>{getResolutionLayerLabel(action.layer)}</span>
                          <span className={styles.cardBadge}>{action.status}</span>
                          <span className={styles.cardBadge}>{action.reasonCode}</span>
                          <span>{getRoundActionReasonLabel(action.reasonCode)}</span>
                          <span>{action.summary}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyState}>Раунд {lastResolvedRound.roundNumber} завершился без результативных действий.</div>
                )}
                {resolvedTimelineEntries.length > 0 ? (
                  <div className={styles.hint}>
                    Шаги показаны в фактическом порядке server-side резолва. Для твоих intent дополнительно восстановлены локальные label/target по `intentId`.
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

          <Card title="Debug state" className={styles.themedCard}>
            <details className={styles.debugPanel}>
              <summary className={styles.debugSummary}>Открыть raw snapshot</summary>
              <pre className={styles.rawState}>
                {matchState ? JSON.stringify(matchState, null, 2) : 'Ожидание данных матча...'}
              </pre>
            </details>
          </Card>
        </div>
      </div>
    </PageShell>
  );
};
