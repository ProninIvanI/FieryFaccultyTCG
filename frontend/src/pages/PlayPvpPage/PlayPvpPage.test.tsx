import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axiosInstance from '@/services/api/axiosInstance';
import { gameWsService } from '@/services';
import { PlayPvpPage } from './PlayPvpPage';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];

  private listeners: Record<string, Array<(event?: unknown) => void>> = {
    open: [],
    message: [],
    error: [],
    close: [],
  };

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event?: unknown) => void): void {
    this.listeners[type]?.push(listener);
  }

  removeEventListener(type: string, listener: (event?: unknown) => void): void {
    this.listeners[type] = this.listeners[type]?.filter((item) => item !== listener) ?? [];
  }

  send(payload: string): void {
    this.sent.push(payload);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit('close');
  }

  emitOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit('open');
  }

  emitMessage(payload: unknown): void {
    this.emit('message', { data: typeof payload === 'string' ? payload : JSON.stringify(payload) });
  }

  private emit(type: string, event?: unknown): void {
    this.listeners[type]?.forEach((listener) => listener(event));
  }
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

const createDeferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
};

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
};

const setAuthSession = (userId: string): void => {
  localStorage.setItem(
    'fftcg_session',
    JSON.stringify({ userId, token: `token_${userId}`, createdAt: '2026-03-20T12:00:00.000Z' }),
  );
};

const mockDeckList = (characterId: string) => {
  const deferred = createDeferred<Awaited<ReturnType<typeof axiosInstance.get>>>();

  vi.spyOn(axiosInstance, 'get').mockReturnValue(deferred.promise);

  const response = {
    data: {
      success: true,
      data: {
        decks: [
          {
            id: 'deck_1',
            userId: 'user_1',
            name: 'Aggro Fire',
            characterId,
            createdAt: '2026-03-20T12:00:00.000Z',
            updatedAt: '2026-03-20T12:00:00.000Z',
            cards: [{ cardId: '1', quantity: 2 }],
          },
        ],
      },
    },
  } as Awaited<ReturnType<typeof axiosInstance.get>>;

  return async () => {
    deferred.resolve(response);
    await deferred.promise;
    await flushMicrotasks();
  };
};

const renderPage = async (characterId: string, userId: string): Promise<void> => {
  setAuthSession(userId);
  const resolveDeckList = mockDeckList(characterId);

  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <PlayPvpPage />
    </MemoryRouter>,
  );

  await act(async () => {
    await resolveDeckList();
  });
};

const submitJoin = async (sessionId: string, buttonName: RegExp | string): Promise<FakeWebSocket> => {
  const sessionInput = await screen.findByDisplayValue(/session_/i);
  fireEvent.change(sessionInput, { target: { value: sessionId } });
  const matchingButtons = screen.getAllByRole('button', { name: buttonName });
  const submitButton = matchingButtons[matchingButtons.length - 1];

  expect(submitButton).toBeDefined();

  await act(async () => {
    fireEvent.click(submitButton!);
    await flushMicrotasks();
  });

  const socket = FakeWebSocket.instances[0];
  expect(socket).toBeDefined();

  await act(async () => {
    socket.emitOpen();
    await flushMicrotasks();
  });

  return socket;
};

describe('PlayPvpPage', () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    localStorage.clear();
    gameWsService.disconnect();
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  });

  afterEach(async () => {
    await act(async () => {
      gameWsService.disconnect();
      await flushMicrotasks();
    });
    globalThis.WebSocket = originalWebSocket;
    vi.restoreAllMocks();
  });

  it('creates match, receives state and sends EndTurn from UI', async () => {
    await renderPage('char_1', 'user_1');

    const socket = await submitJoin('session_alpha', /Создать и подключиться/i);

    await waitFor(() => {
      expect(socket.sent).toContain(
        JSON.stringify({ type: 'join', sessionId: 'session_alpha', token: 'token_user_1', deckId: 'deck_1', seed: 1 }),
      );
    });

    await act(async () => {
      socket.emitMessage({
        type: 'state',
        state: {
          turn: { number: 1, activePlayerId: 'user_1' },
          phase: { current: 'ActionPhase' },
          players: {
            user_1: { mana: 1, maxMana: 1, actionPoints: 1, characterId: 'char_1' },
          },
          decks: {
            user_1: { ownerId: 'user_1', cards: ['deck_card_1', 'deck_card_2'] },
          },
          hands: {
            user_1: ['hand_card_1'],
          },
          discardPiles: {
            user_1: [],
          },
          cardInstances: {
            hand_card_1: { id: 'hand_card_1', definitionId: '1', ownerId: 'user_1', zone: 'hand' },
          },
          actionLog: [],
        },
      });
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(screen.getByText(/Активная сессия:/i)).toHaveTextContent('session_alpha');
      expect(screen.getByRole('button', { name: /Завершить ход/i })).toBeEnabled();
    });

    expect(screen.getByText('deck: 2')).toBeInTheDocument();
    expect(screen.getByText('hand: 1')).toBeInTheDocument();
    expect(screen.getByText('Огненный шар')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Завершить ход/i }));
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(socket.sent).toContain(
        JSON.stringify({
          type: 'action',
          action: {
            type: 'EndTurn',
            actorId: 'char_1',
            playerId: 'user_1',
          },
        }),
      );
    });
  });

  it('joins existing match as second player without sending seed', async () => {
    await renderPage('char_2', 'user_2');

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /Войти в матч/i })[0]);
      await flushMicrotasks();
    });

    const socket = await submitJoin('session_alpha', /Войти в матч/i);

    await waitFor(() => {
      expect(socket.sent).toContain(
        JSON.stringify({ type: 'join', sessionId: 'session_alpha', token: 'token_user_2', deckId: 'deck_1' }),
      );
    });

    expect(socket.sent.some((item) => item.includes('"seed"'))).toBe(false);
  });

  it('sends Summon action for summon card from hand', async () => {
    await renderPage('char_1', 'user_1');

    const socket = await submitJoin('session_summon', /Создать и подключиться/i);

    await act(async () => {
      socket.emitMessage({
        type: 'state',
        state: {
          turn: { number: 1, activePlayerId: 'user_1' },
          phase: { current: 'ActionPhase' },
          players: {
            user_1: { mana: 4, maxMana: 10, actionPoints: 2, characterId: 'char_1' },
          },
          creatures: {},
          decks: {
            user_1: { ownerId: 'user_1', cards: ['deck_card_1'] },
          },
          hands: {
            user_1: ['summon_card_1'],
          },
          discardPiles: {
            user_1: [],
          },
          cardInstances: {
            summon_card_1: { id: 'summon_card_1', definitionId: '81', ownerId: 'user_1', zone: 'hand' },
          },
          actionLog: [],
        },
      });
      await flushMicrotasks();
    });

    const summonButton = await screen.findByRole('button', { name: /Призвать/i });
    expect(summonButton).toBeEnabled();

    await act(async () => {
      fireEvent.click(summonButton);
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(socket.sent).toContain(
        JSON.stringify({
          type: 'action',
          action: {
            type: 'Summon',
            actorId: 'char_1',
            playerId: 'user_1',
            cardInstanceId: 'summon_card_1',
          },
        }),
      );
    });
  });

  it('builds and sends CastSpell action through target draft UI', async () => {
    await renderPage('char_1', 'user_1');

    const socket = await submitJoin('session_spell', /Создать и подключиться/i);

    await act(async () => {
      socket.emitMessage({
        type: 'state',
        state: {
          turn: { number: 1, activePlayerId: 'user_1' },
          phase: { current: 'ActionPhase' },
          players: {
            user_1: { mana: 5, maxMana: 10, actionPoints: 2, characterId: 'char_1' },
            user_2: { mana: 5, maxMana: 10, actionPoints: 2, characterId: 'char_2' },
          },
          creatures: {},
          decks: {
            user_1: { ownerId: 'user_1', cards: ['deck_card_1'] },
            user_2: { ownerId: 'user_2', cards: ['deck_card_2'] },
          },
          hands: {
            user_1: ['spell_card_1'],
            user_2: [],
          },
          discardPiles: {
            user_1: [],
            user_2: [],
          },
          cardInstances: {
            spell_card_1: { id: 'spell_card_1', definitionId: '1', ownerId: 'user_1', zone: 'hand' },
          },
          actionLog: [],
        },
      });
      await flushMicrotasks();
    });

    const spellCardId = await screen.findByText('ID: spell_card_1');
    const spellCardButton = spellCardId.closest('button');
    expect(spellCardButton).toBeTruthy();

    await act(async () => {
      fireEvent.click(spellCardButton!);
      await flushMicrotasks();
    });

    const targetButton = await screen.findByRole('button', { name: /Маг user_2/i });
    await act(async () => {
      fireEvent.click(targetButton);
      await flushMicrotasks();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Отправить действие/i }));
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(socket.sent).toContain(
        JSON.stringify({
          type: 'action',
          action: {
            type: 'CastSpell',
            actorId: 'char_1',
            playerId: 'user_1',
            cardInstanceId: 'spell_card_1',
            targetType: 'enemyCharacter',
            targetId: 'char_2',
          },
        }),
      );
    });
  });

  it('shows server join error and clears pending session before first state', async () => {
    await renderPage('char_3', 'user_3');

    const socket = await submitJoin('session_full', /Создать и подключиться/i);

    await act(async () => {
      socket.emitMessage({ type: 'error', error: 'Session is full' });
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(screen.getByText('Session is full')).toBeInTheDocument();
      expect(screen.getByText(/Активная сессия:/i)).toHaveTextContent('ещё не подключено');
      expect(screen.getByText('Ожидание данных матча...')).toBeInTheDocument();
    });
  });
});
