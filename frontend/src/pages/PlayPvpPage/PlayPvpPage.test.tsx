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

const setAuthSession = (userId: string): void => {
  localStorage.setItem(
    'fftcg_session',
    JSON.stringify({ userId, token: `token_${userId}`, createdAt: '2026-03-20T12:00:00.000Z' })
  );
};

const mockDeckList = (characterId: string) => {
  vi.spyOn(axiosInstance, 'get').mockResolvedValue({
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
  } as Awaited<ReturnType<typeof axiosInstance.get>>);
};

describe('PlayPvpPage', () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    localStorage.clear();
    gameWsService.disconnect();
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    gameWsService.disconnect();
    globalThis.WebSocket = originalWebSocket;
    vi.restoreAllMocks();
  });

  it('creates match, receives state and sends EndTurn from UI', async () => {
    setAuthSession('user_1');
    mockDeckList('char_1');

    render(
      <MemoryRouter>
        <PlayPvpPage />
      </MemoryRouter>
    );

    const sessionInput = await screen.findByDisplayValue(/session_/i);
    fireEvent.change(sessionInput, { target: { value: 'session_alpha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Создать и подключиться' }));

    const socket = FakeWebSocket.instances[0];
    expect(socket).toBeDefined();
    await act(async () => {
      socket.emitOpen();
    });

    await waitFor(() => {
      expect(socket.sent).toContain(
        JSON.stringify({ type: 'join', sessionId: 'session_alpha', token: 'token_user_1', deckId: 'deck_1', seed: 1 })
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
            user_1: ['deck_card_1', 'deck_card_2'],
          },
          hands: {
            user_1: ['hand_card_1'],
          },
          discardPiles: {
            user_1: [],
          },
          cardInstances: {
            hand_card_1: { id: 'hand_card_1', cardId: '1', ownerId: 'user_1', zone: 'hand' },
          },
          actionLog: [],
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Активная сессия:/)).toHaveTextContent('session_alpha');
      expect(screen.getByRole('button', { name: 'Завершить ход' })).toBeEnabled();
    });

    expect(screen.getByText('deck: 2')).toBeInTheDocument();
    expect(screen.getByText('hand: 1')).toBeInTheDocument();
    expect(screen.getByText('Огненный шар')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Завершить ход' }));

    await waitFor(() => {
      expect(socket.sent).toContain(
        JSON.stringify({
          type: 'action',
          action: {
            type: 'EndTurn',
            actorId: 'char_1',
            playerId: 'user_1',
          },
        })
      );
    });
  });

  it('joins existing match as second player without sending seed', async () => {
    setAuthSession('user_2');
    mockDeckList('char_2');

    render(
      <MemoryRouter>
        <PlayPvpPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Войти в матч' })[0]);

    const sessionInput = await screen.findByDisplayValue(/session_/i);
    fireEvent.change(sessionInput, { target: { value: 'session_alpha' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Войти в матч' })[1]);

    const socket = FakeWebSocket.instances[0];
    expect(socket).toBeDefined();
    await act(async () => {
      socket.emitOpen();
    });

    await waitFor(() => {
      expect(socket.sent).toContain(
        JSON.stringify({ type: 'join', sessionId: 'session_alpha', token: 'token_user_2', deckId: 'deck_1' })
      );
    });

    expect(socket.sent.some((item) => item.includes('"seed"'))).toBe(false);
  });

  it('shows server join error and clears pending session before first state', async () => {
    setAuthSession('user_3');
    mockDeckList('char_3');

    render(
      <MemoryRouter>
        <PlayPvpPage />
      </MemoryRouter>
    );

    const sessionInput = await screen.findByDisplayValue(/session_/i);
    fireEvent.change(sessionInput, { target: { value: 'session_full' } });
    fireEvent.click(screen.getByRole('button', { name: 'Создать и подключиться' }));

    const socket = FakeWebSocket.instances[0];
    expect(socket).toBeDefined();
    await act(async () => {
      socket.emitOpen();
      socket.emitMessage({ type: 'error', error: 'Session is full' });
    });

    await waitFor(() => {
      expect(screen.getByText('Session is full')).toBeInTheDocument();
      expect(screen.getByText(/Активная сессия:/)).toHaveTextContent('ещё не подключено');
      expect(screen.getByText('Ожидание данных матча...')).toBeInTheDocument();
    });
  });
});
