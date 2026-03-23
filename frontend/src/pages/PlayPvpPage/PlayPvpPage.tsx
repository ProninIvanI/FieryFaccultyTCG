import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getCatalogCardTypeLabel,
  inferTargetTypeFromCatalog,
  normalizeCatalog,
  toCatalogCardUiType,
} from '@game-core/cards/catalog';
import { Card, HomeLinkButton, PageShell } from '@/components';
import { ROUTES } from '@/constants';
import rawCardData from '@/data/cards.json';
import { authService, deckService, gameWsService } from '@/services';
import { GameStateSnapshot, PvpConnectionStatus, PvpServiceEvent, UserDeck } from '@/types';
import styles from './PlayPvpPage.module.css';

interface MatchSummary {
  activePlayerId: string;
  turnNumber: number;
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
  isActive: boolean;
}

interface HandCardSummary {
  instanceId: string;
  cardId: string;
  name: string;
  mana: number;
  cardType: string;
}

interface CreatureSummary {
  creatureId: string;
  ownerId: string;
  hp: number;
  maxHp: number;
  attack: number;
  speed: number;
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

const getTargetTypeLabel = (targetType: ReturnType<typeof inferTargetTypeFromCatalog> | null): string => {
  switch (targetType) {
    case 'enemyCharacter':
      return 'Вражеский маг';
    case 'allyCharacter':
      return 'Союзный маг';
    case 'creature':
      return 'Существо';
    case 'self':
      return 'Себя';
    case 'any':
      return 'Любая цель';
    default:
      return 'Цель не определена';
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const cardCatalogById = new Map(normalizeCatalog(rawCardData).cards.map((card) => [card.id, card] as const));

const getMatchSummary = (state: GameStateSnapshot | null): MatchSummary | null => {
  if (!state || !isRecord(state.turn) || !isRecord(state.phase) || !isRecord(state.players)) {
    return null;
  }

  const activePlayerId = typeof state.turn.activePlayerId === 'string' ? state.turn.activePlayerId : '';
  const turnNumber = typeof state.turn.number === 'number' ? state.turn.number : 0;
  const phase = typeof state.phase.current === 'string' ? state.phase.current : 'Unknown';
  const playerCount = Object.keys(state.players).length;
  const actionLogCount = Array.isArray(state.actionLog) ? state.actionLog.length : 0;

  return {
    activePlayerId,
    turnNumber,
    phase,
    playerCount,
    actionLogCount,
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

const getPlayerBoardSummaries = (state: GameStateSnapshot | null): PlayerBoardSummary[] => {
  if (!state || !isRecord(state.players)) {
    return [];
  }

  const activePlayerId =
    isRecord(state.turn) && typeof state.turn.activePlayerId === 'string' ? state.turn.activePlayerId : '';

  return Object.keys(state.players).flatMap((playerId) => {
    const baseSummary = getLocalPlayerSummary(state, playerId);
    if (!baseSummary) {
      return [];
    }

    return [
      {
        ...baseSummary,
        deckSize: getZoneSize(state.decks, playerId),
        handSize: getZoneSize(state.hands, playerId),
        discardSize: getZoneSize(state.discardPiles, playerId),
        isActive: activePlayerId === playerId,
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
  setError: (value: string) => void
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
  const [selection, setSelection] = useState<BattlefieldSelection>(null);
  const [draftTargetId, setDraftTargetId] = useState('');
  const hasLiveStateRef = useRef(false);
  const pendingSessionIdRef = useRef('');

  useEffect(() => {
    const unsubscribe = gameWsService.subscribe((event) => {
      if (event.type === 'state') {
        hasLiveStateRef.current = true;
        if (pendingSessionIdRef.current) {
          setJoinedSessionId(pendingSessionIdRef.current);
        }
        setMatchState(event.state);
        setError('');
        return;
      }

      if (event.type === 'error' && !hasLiveStateRef.current) {
        pendingSessionIdRef.current = '';
        setJoinedSessionId('');
        setMatchState(null);
      }

      handleServiceEvent(event, setStatus, setMatchState, setError);
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

  const matchSummary = useMemo(() => getMatchSummary(matchState), [matchState]);
  const localPlayer = useMemo(() => getLocalPlayerSummary(matchState, playerId), [matchState, playerId]);
  const playerBoards = useMemo(() => getPlayerBoardSummaries(matchState), [matchState]);
  const localHandCards = useMemo(() => getLocalHandCards(matchState, playerId), [matchState, playerId]);
  const creatures = useMemo(() => getCreatureSummaries(matchState), [matchState]);
  const matchEvents = useMemo(() => getMatchEvents(matchState), [matchState]);
  const alliedCreatures = useMemo(() => creatures.filter((creature) => creature.ownerId === playerId), [creatures, playerId]);
  const enemyCreatures = useMemo(() => creatures.filter((creature) => creature.ownerId !== playerId), [creatures, playerId]);
  const enemyBoards = useMemo(() => playerBoards.filter((playerBoard) => playerBoard.playerId !== playerId), [playerBoards, playerId]);
  const canEndTurn = Boolean(
    matchSummary &&
      localPlayer &&
      localPlayer.characterId &&
      matchSummary.activePlayerId === playerId &&
      status === 'connected'
  );

  const canActFromHand = Boolean(
    localPlayer &&
      localPlayer.characterId &&
      status === 'connected' &&
      matchSummary?.activePlayerId === playerId
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
      localPlayer.mana >= selectedHandCard.mana
  );
  const selectedCardTargetType = useMemo(
    () => (selectedHandCard ? inferTargetTypeFromCatalog(selectedHandCard.cardType) : null),
    [selectedHandCard]
  );
  const isSelectedCardTargetedAction = Boolean(selectedHandCard && selectedHandCard.cardType !== 'summon' && localPlayer);
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
  const targetCandidates = useMemo<TargetCandidateSummary[]>(() => {
    const candidates: TargetCandidateSummary[] = [];

    if (!localPlayer || !selectedCardTargetType) {
      return candidates;
    }

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
  }, [creatures, enemyBoards, localPlayer, playerId, selectedCardTargetType]);
  const canSubmitTargetedAction = Boolean(targetDraft && localPlayer && status === 'connected' && canActFromHand);

  const isSelectableTarget = (candidateId: string): boolean => targetCandidates.some((candidate) => candidate.id === candidateId);
  const isDraftTargetActive = (candidateId: string): boolean => draftTargetId === candidateId;

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
    hasLiveStateRef.current = false;
    pendingSessionIdRef.current = normalizedSessionId;

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
    hasLiveStateRef.current = false;
    pendingSessionIdRef.current = '';
  };

  const handleEndTurn = () => {
    if (!localPlayer) {
      setError('Локальный игрок ещё не синхронизирован с матчем.');
      return;
    }

    try {
      gameWsService.sendAction({
        type: 'EndTurn',
        actorId: localPlayer.characterId,
        playerId: localPlayer.playerId,
      });
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Не удалось отправить действие');
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

    try {
      gameWsService.sendAction({
        type: 'Summon',
        actorId: localPlayer.characterId,
        playerId: localPlayer.playerId,
        cardInstanceId: card.instanceId,
      });
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Не удалось отправить действие');
    }
  };

  const handleTargetedCardAction = () => {
    if (!selectedHandCard || !localPlayer || !targetDraft) {
      setError('Сначала выбери карту, тип цели и саму цель.');
      return;
    }

    const actionType = selectedHandCard.cardType === 'spell' ? 'CastSpell' : 'PlayCard';

    try {
      gameWsService.sendAction({
        type: actionType,
        actorId: localPlayer.characterId,
        playerId: localPlayer.playerId,
        cardInstanceId: selectedHandCard.instanceId,
        targetType: targetDraft.targetType,
        targetId: targetDraft.targetId,
      });
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Не удалось отправить действие');
    }
  };

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
          <Card title="Панель матча">
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

              {error ? <div className={styles.errorBox}>{error}</div> : null}
            </form>
          </Card>
        </div>

        <div className={styles.boardColumn}>
          <Card title="Игровое поле">
            {matchSummary ? (
              <div className={styles.matchOverview}>
                <div className={styles.matchSpotlight}>
                  <div className={styles.matchSpotlightHeader}>
                    <div>
                      <span className={styles.summaryLabel}>Текущий ритм матча</span>
                      <strong className={styles.spotlightValue}>
                        {matchSummary.activePlayerId === playerId ? 'Твой темп' : 'Темп соперника'}
                      </strong>
                    </div>
                    <button
                      className={styles.primaryButton}
                      type="button"
                      onClick={handleEndTurn}
                      disabled={!canEndTurn}
                    >
                      Завершить ход
                    </button>
                  </div>
                  <p className={styles.paragraph}>
                    Ход {matchSummary.turnNumber}, фаза {matchSummary.phase}. Сейчас активен {matchSummary.activePlayerId}.
                  </p>
                  <div className={styles.summaryGrid}>
                    <div className={styles.summaryTile}>
                      <span className={styles.summaryLabel}>Ход</span>
                      <strong>{matchSummary.turnNumber}</strong>
                    </div>
                    <div className={styles.summaryTile}>
                      <span className={styles.summaryLabel}>Фаза</span>
                      <strong>{matchSummary.phase}</strong>
                    </div>
                    <div className={styles.summaryTile}>
                      <span className={styles.summaryLabel}>Игроков</span>
                      <strong>{matchSummary.playerCount}</strong>
                    </div>
                    <div className={styles.summaryTile}>
                      <span className={styles.summaryLabel}>Action log</span>
                      <strong>{matchSummary.actionLogCount}</strong>
                    </div>
                  </div>
                </div>

                <div className={styles.battlefield}>
                  <section className={styles.battleLane}>
                    <div className={styles.battleLaneHeader}>
                      <div>
                        <span className={styles.summaryLabel}>Сторона соперника</span>
                        <strong>{enemyBoards[0]?.playerId ?? 'Ожидание соперника'}</strong>
                      </div>
                      <span className={styles.battleCount}>{enemyCreatures.length} существ</span>
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

                  <section className={styles.duelStrip}>
                    <div className={styles.duelAvatar}>
                      <button
                        className={`${styles.avatarTargetButton} ${localPlayer && isSelectableTarget(localPlayer.characterId) ? styles.selectionSurfaceTargetable : ''} ${localPlayer && isDraftTargetActive(localPlayer.characterId) ? styles.selectionSurfaceTargetActive : ''}`.trim()}
                        type="button"
                        onClick={() => {
                          if (localPlayer && isSelectableTarget(localPlayer.characterId)) {
                            setDraftTargetId(localPlayer.characterId);
                          }
                        }}
                      >
                        <span className={styles.summaryLabel}>Ты</span>
                        <strong>{playerId}</strong>
                        <span>{localPlayer ? `${localPlayer.mana}/${localPlayer.maxMana} mana` : 'Нет state'}</span>
                      </button>
                    </div>
                    <div className={styles.duelCenter}>
                      <div className={styles.duelDivider}>VS</div>
                      <span className={styles.turnIndicator}>
                        {canEndTurn ? 'Окно действия открыто' : 'Ожидание хода'}
                      </span>
                    </div>
                    <div className={styles.duelAvatar}>
                      <button
                        className={`${styles.avatarTargetButton} ${enemyBoards[0]?.characterId && isSelectableTarget(enemyBoards[0].characterId) ? styles.selectionSurfaceTargetable : ''} ${enemyBoards[0]?.characterId && isDraftTargetActive(enemyBoards[0].characterId) ? styles.selectionSurfaceTargetActive : ''}`.trim()}
                        type="button"
                        onClick={() => {
                          const enemyCharacterId = enemyBoards[0]?.characterId;
                          if (enemyCharacterId && isSelectableTarget(enemyCharacterId)) {
                            setDraftTargetId(enemyCharacterId);
                          }
                        }}
                      >
                        <span className={styles.summaryLabel}>Соперник</span>
                        <strong>{enemyBoards[0]?.playerId ?? 'Ожидание'}</strong>
                        <span>
                          {enemyBoards[0]
                            ? `${enemyBoards[0].mana}/${enemyBoards[0].maxMana} mana`
                            : 'Подключится позже'}
                        </span>
                      </button>
                    </div>
                  </section>

                  <section className={styles.battleLane}>
                    <div className={styles.battleLaneHeader}>
                      <div>
                        <span className={styles.summaryLabel}>Твоя сторона</span>
                        <strong>{playerId}</strong>
                      </div>
                      <span className={styles.battleCount}>{alliedCreatures.length} существ</span>
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

                  <section className={styles.handTray}>
                    <div className={styles.battleLaneHeader}>
                      <div>
                        <span className={styles.summaryLabel}>Твоя рука</span>
                        <strong>Карты для текущего хода</strong>
                      </div>
                      <span className={styles.battleCount}>{localHandCards.length} карт</span>
                    </div>
                    {localHandCards.length > 0 ? (
                      <div className={styles.handTrayGrid}>
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
                              <span className={styles.cardBadge}>{getCardTypeLabel(card.cardType)}</span>
                            </div>
                            <div className={styles.handCardBody}>
                              <strong>{card.name}</strong>
                              <span className={styles.handCardSubtitle}>ID: {card.instanceId}</span>
                            </div>
                            <div className={styles.handCardFooter}>
                              <div className={styles.handMetaRow}>
                                <span className={styles.cardBadge}>Розыгрыш</span>
                                <span className={styles.cardBadge}>{card.mana} mana</span>
                              </div>
                            </div>
                            </button>
                            {card.cardType === 'summon' ? (
                              <button
                                className={styles.primaryButton}
                                type="button"
                                onClick={() => handleSummon(card)}
                                disabled={!canActFromHand || !localPlayer || localPlayer.mana < card.mana}
                              >
                                Призвать
                              </button>
                            ) : (
                              <div className={styles.hint}>Для этой карты таргетный UI появится следующим этапом.</div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className={styles.emptyState}>После старта матча здесь появятся реальные карты из руки.</div>
                    )}
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
          <Card title="Фокус">
            {selectedHandCard ? (
              <div className={styles.focusPanel}>
                <div className={styles.focusHeader}>
                  <div>
                    <span className={styles.summaryLabel}>Выбрана карта</span>
                    <strong>{selectedHandCard.name}</strong>
                  </div>
                  <span className={styles.cardBadge}>{getCardTypeLabel(selectedHandCard.cardType)}</span>
                </div>
                <div className={styles.focusStats}>
                  <div className={styles.focusStat}>
                    <span className={styles.summaryLabel}>Стоимость</span>
                    <strong>{selectedHandCard.mana} mana</strong>
                  </div>
                  <div className={styles.focusStat}>
                    <span className={styles.summaryLabel}>ID</span>
                    <strong>{selectedHandCard.instanceId}</strong>
                  </div>
                </div>
                <p className={styles.paragraph}>
                  Здесь позже появится target-flow: выбор цели, подсветка доступных объектов и подтверждение действия.
                </p>
                {selectedHandCard.cardType === 'summon' ? (
                  <button
                    className={styles.primaryButton}
                    type="button"
                    onClick={() => handleSummon(selectedHandCard)}
                    disabled={!canPlaySelectedCard}
                  >
                    {canPlaySelectedCard ? 'Призвать выбранную карту' : 'Недостаточно ресурсов или не твой ход'}
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
                        disabled={!canSubmitTargetedAction}
                      >
                        Отправить действие
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
                      Черновик: {targetDraft ? `${getTargetTypeLabel(targetDraft.targetType)} -> ${targetDraft.targetId}` : 'цель ещё не выбрана'}
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
                <div className={styles.hint}>Подготовлено место под способности, атаки и выбор целей.</div>
              </div>
            ) : (
              <div className={styles.emptyState}>
                Выбери карту в руке или существо на столе. Справа откроется contextual action panel.
              </div>
            )}
          </Card>

          <Card title="Сводка игрока">
            {localPlayer ? (
              <div className={styles.heroPanel}>
                <div className={styles.heroPanelHeader}>
                  <div>
                    <span className={styles.summaryLabel}>Твой маг</span>
                    <strong>{localPlayer.playerId}</strong>
                  </div>
                  <span className={styles.heroChip}>{canEndTurn ? 'Твой ход' : 'Ожидание'}</span>
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
                </div>
              </div>
            ) : (
              <div className={styles.emptyState}>Локальный игрок появится после первого server `state`.</div>
            )}
          </Card>

          <Card title="Зоны игроков">
            {playerBoards.length > 0 ? (
              <div className={styles.playerBoardList}>
                {playerBoards.map((playerBoard) => (
                  <div
                    key={playerBoard.playerId}
                    className={`${styles.playerBoard} ${playerBoard.isActive ? styles.playerBoardActive : ''}`.trim()}
                  >
                    <div className={styles.playerBoardHeader}>
                      <strong>{playerBoard.playerId}</strong>
                      <span>{playerBoard.isActive ? 'Активный ход' : 'Ожидание'}</span>
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

          <Card title="Лента матча">
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

          <Card title="Debug state">
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
