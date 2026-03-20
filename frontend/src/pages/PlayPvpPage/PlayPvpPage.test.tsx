import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PlayPvpPage } from './PlayPvpPage';
import { gameWsService } from '@/services';

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
  });

  it('creates match, receives state and sends EndTurn from UI', async () => {
    setAuthSession('user_1');

    render(
      <MemoryRouter>
        <PlayPvpPage />
      </MemoryRouter>
    );

    const sessionInput = screen.getByDisplayValue(/session_/i);
    fireEvent.change(sessionInput, { target: { value: 'session_alpha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Создать и подключиться' }));

    const socket = FakeWebSocket.instances[0];
    expect(socket).toBeDefined();
    await act(async () => {
      socket.emitOpen();
    });

    await waitFor(() => {
      expect(socket.sent).toContain(
        JSON.stringify({ type: 'join', sessionId: 'session_alpha', playerId: 'user_1', seed: 1 })
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
          actionLog: [],
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Активная сессия:/)).toHaveTextContent('session_alpha');
      expect(screen.getByRole('button', { name: 'Завершить ход' })).toBeEnabled();
    });

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

    await act(async () => {
      socket.emitMessage({
        type: 'state',
        state: {
          turn: { number: 2, activePlayerId: 'user_2' },
          phase: { current: 'ActionPhase' },
          players: {
            user_1: { mana: 2, maxMana: 2, actionPoints: 1, characterId: 'char_1' },
            user_2: { mana: 2, maxMana: 2, actionPoints: 1, characterId: 'char_2' },
          },
          actionLog: [{ type: 'EndTurn' }],
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Завершить ход' })).toBeDisabled();
      expect(screen.getByText('user_2')).toBeInTheDocument();
      expect(screen.getByText(/"activePlayerId": "user_2"/)).toBeInTheDocument();
    });
  });

  it('joins existing match as second player without sending seed', async () => {
    setAuthSession('user_2');

    render(
      <MemoryRouter>
        <PlayPvpPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Войти в матч' })[0]);

    const sessionInput = screen.getByDisplayValue(/session_/i);
    fireEvent.change(sessionInput, { target: { value: 'session_alpha' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Войти в матч' })[1]);

    const socket = FakeWebSocket.instances[0];
    expect(socket).toBeDefined();
    await act(async () => {
      socket.emitOpen();
    });

    await waitFor(() => {
      expect(socket.sent).toContain(
        JSON.stringify({ type: 'join', sessionId: 'session_alpha', playerId: 'user_2' })
      );
    });

    expect(socket.sent.some((item) => item.includes('"seed"'))).toBe(false);

    await act(async () => {
      socket.emitMessage({
        type: 'state',
        state: {
          turn: { number: 1, activePlayerId: 'user_1' },
          phase: { current: 'ActionPhase' },
          players: {
            user_1: { mana: 1, maxMana: 1, actionPoints: 1, characterId: 'char_1' },
            user_2: { mana: 1, maxMana: 1, actionPoints: 1, characterId: 'char_2' },
          },
          actionLog: [],
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Активная сессия:/)).toHaveTextContent('session_alpha');
      expect(screen.getByText('char_2')).toBeInTheDocument();
    });
  });

  it('shows server join error and clears pending session before first state', async () => {
    setAuthSession('user_3');

    render(
      <MemoryRouter>
        <PlayPvpPage />
      </MemoryRouter>
    );

    const sessionInput = screen.getByDisplayValue(/session_/i);
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
