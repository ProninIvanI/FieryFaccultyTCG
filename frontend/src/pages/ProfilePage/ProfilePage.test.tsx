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
  decksError?: string;
  matchesError?: string;
};

type MatchFixture = NonNullable<MockProfileState['matches']>[number];
type MatchPlayerFixture = MatchFixture['players'][number];

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

const createDeck = (
  id: string,
  name: string,
  updatedAt: string,
  quantities: number[],
  characterId: string | null,
) => ({
  id,
  userId: 'user_1',
  name,
  characterId,
  createdAt: '2026-04-09T10:00:00.000Z',
  updatedAt,
  cards: quantities.map((quantity, index) => ({
    cardId: `${id}_card_${index + 1}`,
    quantity,
  })),
});

const createFinishedMatch = ({
  matchId,
  finishedAt,
  winnerUserId,
  currentUserResult,
  opponentUserId = 'user_2',
  opponentName = 'Bravo',
  currentDeck = 'Aggro Fire',
  opponentDeck = 'Stone Guard',
  endReason = 'victory',
  turnCount = 6,
  actionCount = 18,
}: {
  matchId: string;
  finishedAt: string;
  winnerUserId: string;
  currentUserResult: 'win' | 'loss' | 'draw';
  opponentUserId?: string;
  opponentName?: string;
  currentDeck?: string;
  opponentDeck?: string;
  endReason?: 'victory' | 'surrender' | 'disconnect' | 'abort' | 'error';
  turnCount?: number;
  actionCount?: number;
}): MatchFixture => {
  const opponentResult: MatchPlayerFixture['finishResult'] =
    currentUserResult === 'win' ? 'loss' : currentUserResult === 'loss' ? 'win' : 'draw';

  return {
    matchId,
    status: 'finished',
  createdByUserId: 'user_1',
  winnerUserId,
  seed: `${matchId}_seed`,
  gameCoreVersion: '1',
  rulesVersion: '1',
  endReason,
  turnCount,
  actionCount,
  startedAt: finishedAt,
  finishedAt,
  createdAt: finishedAt,
  updatedAt: finishedAt,
  players: [
    {
      id: `${matchId}_player_1`,
      matchId,
      userId: 'user_1',
      username: 'Akela',
      playerSlot: 1,
      playerIdInMatch: 'player_1',
      deckId: 'deck_1',
      deckNameSnapshot: currentDeck,
      deckSnapshot: null,
      isWinner: currentUserResult === 'win',
      finishResult: currentUserResult,
      connectedAt: null,
      disconnectedAt: null,
      createdAt: finishedAt,
    },
    {
      id: `${matchId}_player_2`,
      matchId,
      userId: opponentUserId,
      username: opponentName,
      playerSlot: 2,
      playerIdInMatch: 'player_2',
      deckId: 'deck_2',
      deckNameSnapshot: opponentDeck,
      deckSnapshot: null,
      isWinner: currentUserResult === 'loss',
      finishResult: opponentResult,
      connectedAt: null,
      disconnectedAt: null,
      createdAt: finishedAt,
    },
  ],
  };
};

const mockProfileApi = (state: MockProfileState = {}) =>
  vi.spyOn(axiosInstance, 'get').mockImplementation(async (url: string) => {
    if (url === '/api/auth/me') {
      return {
        data: {
          success: true,
          data: {
            user:
              state.user ?? {
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
      if (state.decksError) {
        return {
          data: {
            success: false,
            error: state.decksError,
          },
        } as Awaited<ReturnType<typeof axiosInstance.get>>;
      }

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

  it('renders profile sections without personal account details', async () => {
    setAuthenticatedSession();
    const getSpy = mockProfileApi({
      decks: [
        createDeck('deck_1', 'Aggro Fire', '2026-04-22T12:00:00.000Z', [2, 2], '1'),
        createDeck('deck_2', 'Control Tide', '2026-04-20T12:00:00.000Z', [2, 2, 2], '2'),
      ],
      matches: [
        createFinishedMatch({
          matchId: 'match_100001',
          finishedAt: '2026-04-22T10:15:00.000Z',
          winnerUserId: 'user_1',
          currentUserResult: 'win',
          currentDeck: 'Aggro Fire',
          opponentDeck: 'Stone Guard',
        }),
        createFinishedMatch({
          matchId: 'match_100002',
          finishedAt: '2026-04-21T14:10:00.000Z',
          winnerUserId: 'user_2',
          currentUserResult: 'loss',
          currentDeck: 'Control Tide',
          opponentDeck: 'Night Archive',
          endReason: 'surrender',
          turnCount: 4,
          actionCount: 11,
        }),
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
    expect(screen.queryByText('akela@example.com')).not.toBeInTheDocument();
    expect(screen.getByText('Всего колод: 2')).toBeInTheDocument();
    expect(screen.getAllByText('Aggro Fire').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Control Tide').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Против Bravo').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Матч 100001/i).length).toBeGreaterThan(0);
    expect(screen.getByText('22.04.2026, 17:15')).toBeInTheDocument();
    expect(screen.getByText('vs Stone Guard')).toBeInTheDocument();
    expect(screen.getByText('vs Night Archive')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.queryByText('Аккаунт')).not.toBeInTheDocument();
    expect(screen.queryByText('ID игрока')).not.toBeInTheDocument();
    expect(screen.queryByText('Почта')).not.toBeInTheDocument();
    expect(screen.queryByTestId('profile-notice')).not.toBeInTheDocument();
    expect(screen.getByText('Победа')).toBeInTheDocument();
    expect(screen.getByText('Поражение')).toBeInTheDocument();
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
    expect(
      screen.getByText('Колод пока нет. Первая колода появится в мастерской.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Матчей пока нет. Сыграйте первую дуэль, и история появится здесь.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Последнее обновление: —')).toBeInTheDocument();
  });

  it('filters recent matches by result', async () => {
    setAuthenticatedSession();
    mockProfileApi({
      matches: [
        createFinishedMatch({
          matchId: 'match_100001',
          finishedAt: '2026-04-22T10:15:00.000Z',
          winnerUserId: 'user_1',
          currentUserResult: 'win',
        }),
        createFinishedMatch({
          matchId: 'match_100002',
          finishedAt: '2026-04-21T14:10:00.000Z',
          winnerUserId: 'user_2',
          currentUserResult: 'loss',
          endReason: 'surrender',
          turnCount: 4,
          actionCount: 11,
        }),
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

  it('shows a compact notice with an explicit missing section when matches cannot be loaded', async () => {
    setAuthenticatedSession();
    mockProfileApi({
      matchesError: 'Не удалось загрузить матчи',
    });

    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('profile-notice')).toBeInTheDocument();
    expect(screen.getByText('Часть данных недоступна')).toBeInTheDocument();
    expect(
      screen.getByText('Не загрузились история матчей и статистика: Не удалось загрузить матчи.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Не удалось загрузить профиль')).not.toBeInTheDocument();
    expect(screen.getAllByText('Akela').length).toBeGreaterThan(0);
  });

  it('does not expose raw backend internals in partial profile warnings', async () => {
    setAuthenticatedSession();
    mockProfileApi({
      matchesError: 'Internal server error',
    });

    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('profile-notice')).toBeInTheDocument();
    expect(screen.queryByText(/Internal server error/i)).not.toBeInTheDocument();
    expect(screen.getByText(/сервер временно не отдал данные/i)).toBeInTheDocument();
  });

  it('spells out every missing section when decks and matches both fail', async () => {
    setAuthenticatedSession();
    mockProfileApi({
      decksError: 'Network error. Please check your internet connection.',
      matchesError: 'Request timed out',
    });

    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('profile-notice')).toBeInTheDocument();
    expect(
      screen.getByText(
        'раздел «Колоды»: Network error. Please check your internet connection. история матчей и статистика: Request timed out.',
      ),
    ).toBeInTheDocument();
  });
});
