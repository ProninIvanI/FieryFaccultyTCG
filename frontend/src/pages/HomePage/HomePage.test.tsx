import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { authService } from '@/services';
import { HomePage } from './HomePage';

describe('HomePage', () => {
  beforeEach(() => {
    localStorage.clear();
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
      JSON.stringify({ userId: 'user_1', token: 'token_1', createdAt: '2026-03-17T10:00:00.000Z' })
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

  it('calls logout service with active session when user clicks logout', async () => {
    const storedSession = {
      userId: 'user_1',
      token: 'token_1',
      createdAt: '2026-03-17T10:00:00.000Z',
    };
    localStorage.setItem('fftcg_session', JSON.stringify(storedSession));
    const logoutSpy = vi.spyOn(authService, 'logout').mockResolvedValue({ ok: true });

    render(
      <BrowserRouter>
        <HomePage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Akela/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }));

    await waitFor(() => {
      expect(logoutSpy).toHaveBeenCalledWith(storedSession);
    });

    logoutSpy.mockRestore();
  });
});
