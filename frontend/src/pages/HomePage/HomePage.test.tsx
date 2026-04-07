import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import axiosInstance from '@/services/api/axiosInstance';
import { HomePage } from './HomePage';

describe('HomePage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders public home with auth actions', () => {
    render(
      <BrowserRouter>
        <HomePage />
      </BrowserRouter>
    );
    expect(document.querySelector('a[href="/login"]')).toBeInTheDocument();
    expect(document.querySelector('a[href="/register"]')).toBeInTheDocument();
    expect(document.querySelector('a[href="/play/pvp"]')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('renders authenticated home with full navigation', () => {
    localStorage.setItem(
      'fftcg_session',
      JSON.stringify({ userId: 'user_1', username: 'Akela', token: 'token_1', createdAt: '2026-03-17T10:00:00.000Z' })
    );
    render(
      <BrowserRouter>
        <HomePage />
      </BrowserRouter>
    );
    expect(document.querySelector('a[href="/play/pvp"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Поиск' })).toBeInTheDocument();
    expect(document.querySelector('a[href="/login"]')).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/register"]')).not.toBeInTheDocument();
  });

  it('sends logout request with active token when user clicks logout', async () => {
    const storedSession = {
      userId: 'user_1',
      username: 'Akela',
      token: 'token_1',
      createdAt: '2026-03-17T10:00:00.000Z',
    };
    localStorage.setItem('fftcg_session', JSON.stringify(storedSession));
    const postSpy = vi.spyOn(axiosInstance, 'post').mockResolvedValue({
      data: { success: true },
    } as Awaited<ReturnType<typeof axiosInstance.post>>);

    render(
      <BrowserRouter>
        <HomePage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Akela/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/api/auth/logout', {}, {
        headers: {
          Authorization: `Bearer ${storedSession.token}`,
        },
      });
    });
  });
});
