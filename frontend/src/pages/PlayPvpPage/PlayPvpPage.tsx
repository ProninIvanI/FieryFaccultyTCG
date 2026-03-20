import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, HomeLinkButton, PageShell } from '@/components';
import { ROUTES } from '@/constants';
import { authService, gameWsService } from '@/services';
import { GameStateSnapshot, PvpConnectionStatus, PvpServiceEvent } from '@/types';
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

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
  const [status, setStatus] = useState<PvpConnectionStatus>(gameWsService.getStatus());
  const [matchState, setMatchState] = useState<GameStateSnapshot | null>(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [joinedSessionId, setJoinedSessionId] = useState('');
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

  const matchSummary = useMemo(() => getMatchSummary(matchState), [matchState]);
  const localPlayer = useMemo(() => getLocalPlayerSummary(matchState, playerId), [matchState, playerId]);
  const canEndTurn = Boolean(
    matchSummary &&
      localPlayer &&
      localPlayer.characterId &&
      matchSummary.activePlayerId === playerId &&
      status === 'connected'
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
            seed: Number.isFinite(parsedSeed) ? parsedSeed : 1,
          }
        : {
            type: 'join' as const,
            sessionId: normalizedSessionId,
            token: authToken,
          };

    setIsSubmitting(true);
    setError('');
    setMatchState(null);
    setJoinedSessionId('');
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
      <div className={styles.pageGrid}>
        <div className={styles.mainColumn}>
          <Card title="Подключение к матчу">
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
                {mode === 'join' ? (
                  <div className={styles.hint}>В режиме входа seed не отправляется — используется seed создателя матча.</div>
                ) : null}
              </div>

              {error ? <div className={styles.errorBox}>{error}</div> : null}
            </form>
          </Card>

          <Card title="Состояние матча">
            {matchSummary ? (
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
                  <span className={styles.summaryLabel}>Активный игрок</span>
                  <strong>{matchSummary.activePlayerId}</strong>
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
            ) : (
              <div className={styles.emptyState}>После `join` здесь появится реальный state матча.</div>
            )}
          </Card>

          <Card title="Действия">
            <div className={styles.inlineActions}>
              <button className={styles.primaryButton} type="button" onClick={handleEndTurn} disabled={!canEndTurn}>
                Завершить ход
              </button>
            </div>
            <p className={styles.paragraph}>
              Кнопка активна только у текущего активного игрока после получения состояния матча.
            </p>
          </Card>
        </div>

        <div className={styles.sideColumn}>
          <Card title="Локальный игрок">
            {localPlayer ? (
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
            ) : (
              <div className={styles.emptyState}>Локальный игрок появится после первого server `state`.</div>
            )}
          </Card>

          <Card title="Raw state">
            <pre className={styles.rawState}>
              {matchState ? JSON.stringify(matchState, null, 2) : 'Ожидание данных матча...'}
            </pre>
          </Card>
        </div>
      </div>
    </PageShell>
  );
};
