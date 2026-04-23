import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axiosInstance from '@/services/api/axiosInstance';
import { ProfilePage } from './ProfilePage';

type MockProfileState = {
  user?: {
    id: string;
    email: string;
    username: string;
    createdAt: string;
  };
  decks?: Array<{
    id: string;
    userId: string;
    name: string;
    characterId: string | null;
    createdAt: string;
    updatedAt: string;
    cards: Array<{ cardId: string; quantity: number }>;
  }>;
    matches?: Array<{
    matchId: string;
    status: 'pending' | 'active' | 'finished' | 'aborted';
    createdByUserId: string | null;
    winnerUserId: string | null;
    seed: string;
    gameCoreVersion: string;
    rulesVersion: string;
    endReason: 'victory' | 'surrender' | 'disconnect' | 'abort' | 'error' | null;
    turnCount: number;
    actionCount: number;
    startedAt: string | null;
    finishedAt: string | null;
    createdAt: string;
    updatedAt: string;
      players: Array<{
        id: string;
        matchId: string;
        userId: string;
        username?: string;
        playerSlot: number;
        playerIdInMatch: string;
      deckId: string | null;
      deckNameSnapshot: string | null;
      deckSnapshot: unknown | null;
      isWinner: boolean;
      finishResult: 'pending' | 'win' | 'loss' | 'draw' | 'abandoned';
      connectedAt: string | null;
      disconnectedAt: string | null;
      createdAt: string;
    }>;
  }>;
  matchesError?: string;
};

const setAuthenticatedSession = () => {
  localStorage.setItem(
    'fftcg_session',
    JSON.stringify({
      userId: 'user_1',
      username: 'Akela',
      token: 'token_1',
      createdAt: '2026-03-17T10:00:00.000Z',
    }),
  );
};

const mockProfileApi = (state: MockProfileState = {}) =>
  vi.spyOn(axiosInstance, 'get').mockImplementation(async (url: string) => {
    if (url === '/api/auth/me') {
      return {
        data: {
          success: true,
          data: {
            user: state.user ?? {
              id: 'user_1',
              email: 'akela@example.com',
              username: 'Akela',
              createdAt: '2026-03-17T10:00:00.000Z',
            },
          },
        },
      } as Awaited<ReturnType<typeof axiosInstance.get>>;
    }

    if (url === '/api/decks') {
      return {
        data: {
          success: true,
          data: {
            decks: state.decks ?? [],
          },
        },
      } as Awaited<ReturnType<typeof axiosInstance.get>>;
    }

    if (url === '/api/matches') {
      if (state.matchesError) {
        return {
          data: {
            success: false,
            error: state.matchesError,
          },
        } as Awaited<ReturnType<typeof axiosInstance.get>>;
      }

      return {
        data: {
          success: true,
          data: {
            matches: state.matches ?? [],
          },
        },
      } as Awaited<ReturnType<typeof axiosInstance.get>>;
    }

    return {
      data: {
        success: true,
      },
    } as Awaited<ReturnType<typeof axiosInstance.get>>;
  });

describe('ProfilePage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders real profile sections from account, decks and matches data', async () => {
    setAuthenticatedSession();
    const getSpy = mockProfileApi({
      decks: [
        {
          id: 'deck_1',
          userId: 'user_1',
          name: 'Aggro Fire',
          characterId: '1',
          createdAt: '2026-04-10T10:00:00.000Z',
          updatedAt: '2026-04-22T12:00:00.000Z',
          cards: [
            { cardId: '1', quantity: 2 },
            { cardId: '2', quantity: 2 },
          ],
        },
        {
          id: 'deck_2',
          userId: 'user_1',
          name: 'Control Tide',
          characterId: '2',
          createdAt: '2026-04-09T10:00:00.000Z',
          updatedAt: '2026-04-20T12:00:00.000Z',
          cards: [
            { cardId: '3', quantity: 2 },
            { cardId: '4', quantity: 2 },
            { cardId: '5', quantity: 2 },
          ],
        },
      ],
      matches: [
        {
          matchId: 'match_100001',
          status: 'finished',
          createdByUserId: 'user_1',
          winnerUserId: 'user_1',
          seed: 'seed_1',
          gameCoreVersion: '1',
          rulesVersion: '1',
          endReason: 'victory',
          turnCount: 6,
          actionCount: 18,
          startedAt: '2026-04-22T10:00:00.000Z',
          finishedAt: '2026-04-22T10:15:00.000Z',
          createdAt: '2026-04-22T09:58:00.000Z',
          updatedAt: '2026-04-22T10:15:00.000Z',
          players: [
            {
              id: 'player_1',
              matchId: 'match_100001',
              userId: 'user_1',
              username: 'Akela',
              playerSlot: 1,
              playerIdInMatch: 'player_1',
              deckId: 'deck_1',
              deckNameSnapshot: 'Aggro Fire',
              deckSnapshot: null,
              isWinner: true,
              finishResult: 'win',
              connectedAt: null,
              disconnectedAt: null,
              createdAt: '2026-04-22T09:58:00.000Z',
            },
            {
              id: 'player_1_opponent',
              matchId: 'match_100001',
              userId: 'user_2',
              username: 'Bravo',
              playerSlot: 2,
              playerIdInMatch: 'player_2',
              deckId: 'deck_3',
              deckNameSnapshot: 'Stone Guard',
              deckSnapshot: null,
              isWinner: false,
              finishResult: 'loss',
              connectedAt: null,
              disconnectedAt: null,
              createdAt: '2026-04-22T09:58:00.000Z',
            },
          ],
        },
        {
          matchId: 'match_100002',
          status: 'finished',
          createdByUserId: 'user_2',
          winnerUserId: 'user_2',
          seed: 'seed_2',
          gameCoreVersion: '1',
          rulesVersion: '1',
          endReason: 'surrender',
          turnCount: 4,
          actionCount: 11,
          startedAt: '2026-04-21T14:00:00.000Z',
          finishedAt: '2026-04-21T14:10:00.000Z',
          createdAt: '2026-04-21T13:58:00.000Z',
          updatedAt: '2026-04-21T14:10:00.000Z',
          players: [
            {
              id: 'player_2',
              matchId: 'match_100002',
              userId: 'user_1',
              username: 'Akela',
              playerSlot: 1,
              playerIdInMatch: 'player_2',
              deckId: 'deck_2',
              deckNameSnapshot: 'Control Tide',
              deckSnapshot: null,
              isWinner: false,
              finishResult: 'loss',
              connectedAt: null,
              disconnectedAt: null,
              createdAt: '2026-04-21T13:58:00.000Z',
            },
            {
              id: 'player_2_opponent',
              matchId: 'match_100002',
              userId: 'user_2',
              username: 'Bravo',
              playerSlot: 2,
              playerIdInMatch: 'player_3',
              deckId: 'deck_4',
              deckNameSnapshot: 'Night Archive',
              deckSnapshot: null,
              isWinner: true,
              finishResult: 'win',
              connectedAt: null,
              disconnectedAt: null,
              createdAt: '2026-04-21T13:58:00.000Z',
            },
          ],
        },
      ],
    });

    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(getSpy).toHaveBeenCalledTimes(3);
    });

    expect(screen.getAllByText('Akela').length).toBeGreaterThan(0);
    expect(screen.getAllByText('akela@example.com').length).toBeGreaterThan(0);
    expect(screen.getByText('Всего колод: 2')).toBeInTheDocument();
    expect(screen.getAllByText('Aggro Fire').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Control Tide').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Против Bravo').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Матч 100001/i).length).toBeGreaterThan(0);
    expect(screen.getByText('22.04.2026, 17:15')).toBeInTheDocument();
    expect(screen.getByText('vs Stone Guard')).toBeInTheDocument();
    expect(screen.getByText('vs Night Archive')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('Победа')).toBeInTheDocument();
    expect(screen.getByText('Поражение')).toBeInTheDocument();

    expect(screen.queryByText('Уровень: 12')).not.toBeInTheDocument();
    expect(screen.queryByText('Колода 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Раздел истории матчей будет наполнен следующим шагом.')).not.toBeInTheDocument();
  });

  it('shows honest empty states when there are no decks or matches yet', async () => {
    setAuthenticatedSession();
    mockProfileApi();

    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Всего колод: 0')).toBeInTheDocument();
    expect(screen.getByText('Колод пока нет. Первая колода появится в мастерской.')).toBeInTheDocument();
    expect(screen.getByText('Матчей пока нет. Сыграйте первую дуэль, и история появится здесь.')).toBeInTheDocument();
    expect(screen.getByText('Последнее обновление: —')).toBeInTheDocument();
  });

  it('filters recent matches by result', async () => {
    setAuthenticatedSession();
    mockProfileApi({
      matches: [
        {
          matchId: 'match_100001',
          status: 'finished',
          createdByUserId: 'user_1',
          winnerUserId: 'user_1',
          seed: 'seed_1',
          gameCoreVersion: '1',
          rulesVersion: '1',
          endReason: 'victory',
          turnCount: 6,
          actionCount: 18,
          startedAt: '2026-04-22T10:00:00.000Z',
          finishedAt: '2026-04-22T10:15:00.000Z',
          createdAt: '2026-04-22T09:58:00.000Z',
          updatedAt: '2026-04-22T10:15:00.000Z',
          players: [
            {
              id: 'player_1',
              matchId: 'match_100001',
              userId: 'user_1',
              username: 'Akela',
              playerSlot: 1,
              playerIdInMatch: 'player_1',
              deckId: 'deck_1',
              deckNameSnapshot: 'Aggro Fire',
              deckSnapshot: null,
              isWinner: true,
              finishResult: 'win',
              connectedAt: null,
              disconnectedAt: null,
              createdAt: '2026-04-22T09:58:00.000Z',
            },
            {
              id: 'player_1_opponent',
              matchId: 'match_100001',
              userId: 'user_2',
              username: 'Bravo',
              playerSlot: 2,
              playerIdInMatch: 'player_2',
              deckId: 'deck_3',
              deckNameSnapshot: 'Stone Guard',
              deckSnapshot: null,
              isWinner: false,
              finishResult: 'loss',
              connectedAt: null,
              disconnectedAt: null,
              createdAt: '2026-04-22T09:58:00.000Z',
            },
          ],
        },
        {
          matchId: 'match_100002',
          status: 'finished',
          createdByUserId: 'user_2',
          winnerUserId: 'user_2',
          seed: 'seed_2',
          gameCoreVersion: '1',
          rulesVersion: '1',
          endReason: 'surrender',
          turnCount: 4,
          actionCount: 11,
          startedAt: '2026-04-21T14:00:00.000Z',
          finishedAt: '2026-04-21T14:10:00.000Z',
          createdAt: '2026-04-21T13:58:00.000Z',
          updatedAt: '2026-04-21T14:10:00.000Z',
          players: [
            {
              id: 'player_2',
              matchId: 'match_100002',
              userId: 'user_1',
              username: 'Akela',
              playerSlot: 1,
              playerIdInMatch: 'player_2',
              deckId: 'deck_2',
              deckNameSnapshot: 'Control Tide',
              deckSnapshot: null,
              isWinner: false,
              finishResult: 'loss',
              connectedAt: null,
              disconnectedAt: null,
              createdAt: '2026-04-21T13:58:00.000Z',
            },
            {
              id: 'player_2_opponent',
              matchId: 'match_100002',
              userId: 'user_2',
              username: 'Bravo',
              playerSlot: 2,
              playerIdInMatch: 'player_3',
              deckId: 'deck_4',
              deckNameSnapshot: 'Night Archive',
              deckSnapshot: null,
              isWinner: true,
              finishResult: 'win',
              connectedAt: null,
              disconnectedAt: null,
              createdAt: '2026-04-21T13:58:00.000Z',
            },
          ],
        },
      ],
    });

    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('button', { name: 'Победы' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Победы' }));
    expect(screen.getByText('Матч 100001')).toBeInTheDocument();
    expect(screen.queryByText('Матч 100002')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Поражения' }));
    expect(screen.getByText('Матч 100002')).toBeInTheDocument();
    expect(screen.queryByText('Матч 100001')).not.toBeInTheDocument();
  });

  it('keeps profile sections visible when matches cannot be loaded', async () => {
    setAuthenticatedSession();
    mockProfileApi({
      matchesError: 'Не удалось загрузить матчи',
    });

    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Не удалось загрузить профиль')).toBeInTheDocument();
    expect(screen.getByText('Не удалось загрузить матчи')).toBeInTheDocument();
    expect(screen.getAllByText('Akela').length).toBeGreaterThan(0);
  });
});
