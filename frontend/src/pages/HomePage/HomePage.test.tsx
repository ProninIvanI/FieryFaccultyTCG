import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import axiosInstance from '@/services/api/axiosInstance';
import { socialWsService } from '@/services';
import { HomePage } from './HomePage';

const takePathSegmentFromEnd = (value: string, offset = 1): string | undefined => {
  const parts = value.split('/');
  return parts[parts.length - offset];
};

type SocialState = {
  friends: Array<{
    userId: string;
    username: string;
    createdAt: string;
  }>;
  incoming: Array<{
    id: string;
    senderUserId: string;
    senderUsername: string;
    receiverUserId: string;
    receiverUsername: string;
    status: 'pending' | 'accepted' | 'declined' | 'cancelled';
    createdAt: string;
    updatedAt: string;
  }>;
  outgoing: Array<{
    id: string;
    senderUserId: string;
    senderUsername: string;
    receiverUserId: string;
    receiverUsername: string;
    status: 'pending' | 'accepted' | 'declined' | 'cancelled';
    createdAt: string;
    updatedAt: string;
  }>;
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

const mockSocialApi = (state?: Partial<SocialState>) => {
  const socialState: SocialState = {
    friends: state?.friends ?? [],
    incoming: state?.incoming ?? [],
    outgoing: state?.outgoing ?? [],
  };

  const getSpy = vi.spyOn(axiosInstance, 'get').mockImplementation(async (url: string) => {
    if (url.startsWith('/api/friends/requests/incoming')) {
      return {
        data: {
          success: true,
          data: { requests: { items: socialState.incoming, nextCursor: null } },
        },
      } as Awaited<ReturnType<typeof axiosInstance.get>>;
    }

    if (url.startsWith('/api/friends/requests/outgoing')) {
      return {
        data: {
          success: true,
          data: { requests: { items: socialState.outgoing, nextCursor: null } },
        },
      } as Awaited<ReturnType<typeof axiosInstance.get>>;
    }

    if (url.startsWith('/api/friends')) {
      return {
        data: {
          success: true,
          data: { friends: { items: socialState.friends, nextCursor: null } },
        },
      } as Awaited<ReturnType<typeof axiosInstance.get>>;
    }

    return {
      data: {
        success: true,
      },
    } as Awaited<ReturnType<typeof axiosInstance.get>>;
  });

  const postSpy = vi.spyOn(axiosInstance, 'post').mockImplementation(async (url: string, body?: unknown) => {
    if (url === '/api/auth/logout') {
      return {
        data: { success: true },
      } as Awaited<ReturnType<typeof axiosInstance.post>>;
    }

    if (url === '/api/friends/requests') {
      const username = (body as { username?: string } | undefined)?.username ?? 'Unknown';
      const request = {
        id: 'friend_request_new',
        senderUserId: 'user_1',
        senderUsername: 'Akela',
        receiverUserId: 'user_target',
        receiverUsername: username,
        status: 'pending' as const,
        createdAt: '2026-04-22T12:00:00.000Z',
        updatedAt: '2026-04-22T12:00:00.000Z',
      };
      socialState.outgoing = [request, ...socialState.outgoing];

      return {
        data: {
          success: true,
          data: { request },
        },
      } as Awaited<ReturnType<typeof axiosInstance.post>>;
    }

    if (url.endsWith('/accept')) {
      const requestId = takePathSegmentFromEnd(url, 2);
      const accepted = socialState.incoming.find((request) => request.id === requestId);
      if (accepted) {
        socialState.incoming = socialState.incoming.filter((request) => request.id !== requestId);
        socialState.friends = [
          {
            userId: accepted.senderUserId,
            username: accepted.senderUsername,
            createdAt: accepted.updatedAt,
          },
          ...socialState.friends,
        ];
      }

      return {
        data: {
          success: true,
          data: {
            request: accepted
              ? { ...accepted, status: 'accepted' as const }
              : null,
          },
        },
      } as Awaited<ReturnType<typeof axiosInstance.post>>;
    }

    if (url.endsWith('/decline')) {
      const requestId = takePathSegmentFromEnd(url, 2);
      const declined = socialState.incoming.find((request) => request.id === requestId);
      socialState.incoming = socialState.incoming.filter((request) => request.id !== requestId);

      return {
        data: {
          success: true,
          data: {
            request: declined ? { ...declined, status: 'declined' as const } : null,
          },
        },
      } as Awaited<ReturnType<typeof axiosInstance.post>>;
    }

    if (url.endsWith('/cancel')) {
      const requestId = takePathSegmentFromEnd(url, 2);
      const cancelled = socialState.outgoing.find((request) => request.id === requestId);
      socialState.outgoing = socialState.outgoing.filter((request) => request.id !== requestId);

      return {
        data: {
          success: true,
          data: {
            request: cancelled ? { ...cancelled, status: 'cancelled' as const } : null,
          },
        },
      } as Awaited<ReturnType<typeof axiosInstance.post>>;
    }

    return {
      data: {
        success: true,
      },
    } as Awaited<ReturnType<typeof axiosInstance.post>>;
  });

  const deleteSpy = vi.spyOn(axiosInstance, 'delete').mockImplementation(async (url: string) => {
    if (url.startsWith('/api/friends/')) {
      const friendUserId = takePathSegmentFromEnd(url);
      socialState.friends = socialState.friends.filter((friend) => friend.userId !== friendUserId);
    }

    return {
      data: {
        success: true,
      },
    } as Awaited<ReturnType<typeof axiosInstance.delete>>;
  });

  return { getSpy, postSpy, deleteSpy, socialState };
};

describe('HomePage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders public home with auth actions', () => {
    render(
      <BrowserRouter>
        <HomePage />
      </BrowserRouter>,
    );
    expect(document.querySelector('a[href="/login"]')).toBeInTheDocument();
    expect(document.querySelector('a[href="/register"]')).toBeInTheDocument();
    expect(document.querySelector('a[href="/play/pvp"]')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('renders authenticated home with full navigation', () => {
    setAuthenticatedSession();
    mockSocialApi();

    render(
      <BrowserRouter>
        <HomePage />
      </BrowserRouter>,
    );

    expect(document.querySelector('a[href="/play/pvp"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Поиск' })).toBeInTheDocument();
    expect(document.querySelector('a[href="/login"]')).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/register"]')).not.toBeInTheDocument();
  });

  it('sends logout request with active token when user clicks logout', async () => {
    setAuthenticatedSession();
    const { postSpy } = mockSocialApi();

    render(
      <BrowserRouter>
        <HomePage />
      </BrowserRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Akela/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/api/auth/logout', {}, {
        headers: {
          Authorization: 'Bearer token_1',
        },
      });
    });
  });

  it('sends friend request and shows new outgoing request', async () => {
    setAuthenticatedSession();
    const { postSpy } = mockSocialApi();

    render(
      <BrowserRouter>
        <HomePage />
      </BrowserRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Добавить друга' }));
    fireEvent.change(screen.getByLabelText('Никнейм друга'), {
      target: { value: 'Bravo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить запрос' }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/api/friends/requests', {
        username: 'Bravo',
      }, undefined);
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Исходящие заявки' }));

    expect(await screen.findByText('Bravo')).toBeInTheDocument();
    expect(screen.getByText('Ожидает ответа')).toBeInTheDocument();
  });

  it('accepts incoming request and moves user into friends list', async () => {
    setAuthenticatedSession();
    const { postSpy } = mockSocialApi({
      incoming: [
        {
          id: 'friend_request_1',
          senderUserId: 'user_bravo',
          senderUsername: 'Bravo',
          receiverUserId: 'user_1',
          receiverUsername: 'Akela',
          status: 'pending',
          createdAt: '2026-04-22T12:00:00.000Z',
          updatedAt: '2026-04-22T12:00:00.000Z',
        },
      ],
    });

    render(
      <BrowserRouter>
        <HomePage />
      </BrowserRouter>,
    );

    fireEvent.click(await screen.findByRole('tab', { name: 'Входящие заявки' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Принять' }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/api/friends/requests/friend_request_1/accept',
        undefined,
        undefined,
      );
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Друзья' }));

    expect(await screen.findByText('Не в сети')).toBeInTheDocument();
    expect(screen.getByText('Bravo')).toBeInTheDocument();
  });

  it('deletes friend from friends list', async () => {
    setAuthenticatedSession();
    const { deleteSpy } = mockSocialApi({
      friends: [
        {
          userId: 'user_bravo',
          username: 'Bravo',
          createdAt: '2026-04-22T12:00:00.000Z',
        },
      ],
    });

    render(
      <BrowserRouter>
        <HomePage />
      </BrowserRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Удалить' }));

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('/api/friends/user_bravo', undefined);
    });

    expect(await screen.findByText('Друзья пока не добавлены.')).toBeInTheDocument();
  });

  it('shows confirmation panel when live invite is accepted', async () => {
    setAuthenticatedSession();
    let socialListener: ((event: { type: string; invite?: unknown }) => void) | undefined;

    mockSocialApi({
      friends: [
        {
          userId: 'user_bravo',
          username: 'Bravo',
          createdAt: '2026-04-22T12:00:00.000Z',
        },
      ],
    });

    vi.spyOn(socialWsService, 'subscribe').mockImplementation((listener) => {
      socialListener = listener as typeof socialListener;
      return () => undefined;
    });
    vi.spyOn(socialWsService, 'connect').mockResolvedValue(undefined);
    vi.spyOn(socialWsService, 'disconnect').mockImplementation(() => undefined);
    vi.spyOn(socialWsService, 'queryPresence').mockResolvedValue(undefined);

    render(
      <BrowserRouter>
        <HomePage />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Bravo')).toBeInTheDocument();
    });

    await act(async () => {
      socialListener?.({
        type: 'inviteUpdated',
        invite: {
          id: 'invite_1',
          inviterUserId: 'user_bravo',
          inviterUsername: 'Bravo',
          targetUserId: 'user_1',
          status: 'accepted',
          sessionId: 'invite_match_invite_1',
          seed: 77,
          createdAt: '2026-04-22T12:00:00.000Z',
          updatedAt: '2026-04-22T12:01:00.000Z',
          expiresAt: '2026-04-22T12:02:00.000Z',
        },
      });
    });

    expect(await screen.findByTestId('match-confirm-panel')).toBeInTheDocument();
    expect(screen.getByText(/Сессия с Bravo уже подготовлена\./i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Перейти к матчу' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Позже' })).toBeInTheDocument();
  });

  it('restores pending match confirmation from sessionStorage', async () => {
    setAuthenticatedSession();
    mockSocialApi();
    sessionStorage.setItem(
      'fftcg_match_confirm:user_1',
      JSON.stringify({
        id: 'invite_1',
        inviterUserId: 'user_bravo',
        inviterUsername: 'Bravo',
        targetUserId: 'user_1',
        status: 'accepted',
        sessionId: 'invite_match_invite_1',
        seed: 77,
        createdAt: '2026-04-22T12:00:00.000Z',
        updatedAt: '2026-04-22T12:01:00.000Z',
        expiresAt: '2026-04-22T12:02:00.000Z',
      }),
    );
    vi.spyOn(socialWsService, 'subscribe').mockImplementation(() => () => undefined);
    vi.spyOn(socialWsService, 'connect').mockResolvedValue(undefined);
    vi.spyOn(socialWsService, 'disconnect').mockImplementation(() => undefined);
    vi.spyOn(socialWsService, 'queryPresence').mockResolvedValue(undefined);

    render(
      <BrowserRouter>
        <HomePage />
      </BrowserRouter>,
    );

    expect(await screen.findByTestId('match-confirm-panel')).toBeInTheDocument();
    expect(screen.getByText(/Сессия с Bravo уже подготовлена\./i)).toBeInTheDocument();
  });

  it('clears stale match confirmation when invite snapshot no longer contains accepted invite', async () => {
    setAuthenticatedSession();
    let socialListener: ((event: { type: string; [key: string]: unknown }) => void) | undefined;

    mockSocialApi();
    sessionStorage.setItem(
      'fftcg_match_confirm:user_1',
      JSON.stringify({
        id: 'invite_1',
        inviterUserId: 'user_bravo',
        inviterUsername: 'Bravo',
        targetUserId: 'user_1',
        status: 'accepted',
        sessionId: 'invite_match_invite_1',
        seed: 77,
        createdAt: '2026-04-22T12:00:00.000Z',
        updatedAt: '2026-04-22T12:01:00.000Z',
        expiresAt: '2026-04-22T12:02:00.000Z',
      }),
    );
    vi.spyOn(socialWsService, 'subscribe').mockImplementation((listener) => {
      socialListener = listener as typeof socialListener;
      return () => undefined;
    });
    vi.spyOn(socialWsService, 'connect').mockResolvedValue(undefined);
    vi.spyOn(socialWsService, 'disconnect').mockImplementation(() => undefined);
    vi.spyOn(socialWsService, 'queryPresence').mockResolvedValue(undefined);

    render(
      <BrowserRouter>
        <HomePage />
      </BrowserRouter>,
    );

    expect(await screen.findByTestId('match-confirm-panel')).toBeInTheDocument();

    await act(async () => {
      socialListener?.({
        type: 'inviteSnapshot',
        invites: [],
      });
    });

    await waitFor(() => {
      expect(screen.queryByTestId('match-confirm-panel')).not.toBeInTheDocument();
    });
    expect(sessionStorage.getItem('fftcg_match_confirm:user_1')).toBeNull();
    expect(
      screen.getByText('Подготовленная сессия больше недоступна. Отправьте приглашение ещё раз.'),
    ).toBeInTheDocument();
  });

  it('shows readable message when prepared invite becomes consumed', async () => {
    setAuthenticatedSession();
    let socialListener: ((event: { type: string; [key: string]: unknown }) => void) | undefined;

    mockSocialApi({
      friends: [
        {
          userId: 'user_bravo',
          username: 'Bravo',
          createdAt: '2026-04-22T12:00:00.000Z',
        },
      ],
    });

    vi.spyOn(socialWsService, 'subscribe').mockImplementation((listener) => {
      socialListener = listener as typeof socialListener;
      return () => undefined;
    });
    vi.spyOn(socialWsService, 'connect').mockResolvedValue(undefined);
    vi.spyOn(socialWsService, 'disconnect').mockImplementation(() => undefined);
    vi.spyOn(socialWsService, 'queryPresence').mockResolvedValue(undefined);

    render(
      <BrowserRouter>
        <HomePage />
      </BrowserRouter>,
    );

    await act(async () => {
      socialListener?.({
        type: 'inviteUpdated',
        invite: {
          id: 'invite_1',
          inviterUserId: 'user_bravo',
          inviterUsername: 'Bravo',
          targetUserId: 'user_1',
          status: 'accepted',
          sessionId: 'invite_match_invite_1',
          seed: 77,
          createdAt: '2026-04-22T12:00:00.000Z',
          updatedAt: '2026-04-22T12:01:00.000Z',
          expiresAt: '2026-04-22T12:02:00.000Z',
        },
      });
    });

    expect(await screen.findByTestId('match-confirm-panel')).toBeInTheDocument();

    await act(async () => {
      socialListener?.({
        type: 'inviteUpdated',
        invite: {
          id: 'invite_1',
          inviterUserId: 'user_bravo',
          inviterUsername: 'Bravo',
          targetUserId: 'user_1',
          status: 'consumed',
          sessionId: 'invite_match_invite_1',
          seed: 77,
          createdAt: '2026-04-22T12:00:00.000Z',
          updatedAt: '2026-04-22T12:03:00.000Z',
          expiresAt: '2026-04-22T12:12:00.000Z',
        },
      });
    });

    await waitFor(() => {
      expect(screen.queryByTestId('match-confirm-panel')).not.toBeInTheDocument();
    });
    expect(
      screen.getByText('Матч уже запущен. Если экран боя не открылся, попробуйте зайти в PvP заново.'),
    ).toBeInTheDocument();
  });

  it('disables invite button when friend is already in match and shows readable invite errors', async () => {
    setAuthenticatedSession();
    let socialListener: ((event: { type: string; [key: string]: unknown }) => void) | undefined;

    mockSocialApi({
      friends: [
        {
          userId: 'user_bravo',
          username: 'Bravo',
          createdAt: '2026-04-22T12:00:00.000Z',
        },
      ],
    });

    vi.spyOn(socialWsService, 'subscribe').mockImplementation((listener) => {
      socialListener = listener as typeof socialListener;
      return () => undefined;
    });
    vi.spyOn(socialWsService, 'connect').mockResolvedValue(undefined);
    vi.spyOn(socialWsService, 'disconnect').mockImplementation(() => undefined);
    vi.spyOn(socialWsService, 'queryPresence').mockResolvedValue(undefined);

    render(
      <BrowserRouter>
        <HomePage />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Bravo')).toBeInTheDocument();
    });

    await act(async () => {
      socialListener?.({
        type: 'presence',
        presences: [{ userId: 'user_bravo', status: 'in_match' }],
      });
    });

    expect(await screen.findByRole('button', { name: 'В матче' })).toBeDisabled();

    await act(async () => {
      socialListener?.({
        type: 'inviteRejected',
        code: 'target_in_match',
        error: 'Target user is already in a match',
      });
    });

    expect(
      await screen.findByText('Этот друг уже находится в активном матче.'),
    ).toBeInTheDocument();
  });
});
