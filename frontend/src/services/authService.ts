import axiosInstance from '@/services/api/axiosInstance';
import { AuthSession } from '@/types';

const SESSION_KEY = 'fftcg_session';

type AuthResponse = {
  user: {
    id: string;
    email: string;
    username: string;
    createdAt: string;
  };
  session: AuthSession;
};

const isAuthSession = (value: unknown): value is AuthSession => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const session = value as AuthSession;
  return Boolean(session.userId && session.token && session.createdAt);
};

const saveSession = (session: AuthSession): void => {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
};

const clearSession = (): void => {
  localStorage.removeItem(SESSION_KEY);
};

export const authService = {
  async register(params: {
    email: string;
    username: string;
    password: string;
  }): Promise<{ ok: boolean; error?: string }> {
    try {
      await axiosInstance.post<{ success: boolean; data?: AuthResponse }>(
        '/api/auth/register',
        params,
      );
      return { ok: true };
    } catch (error) {
      const message = typeof error === 'object' && error && 'error' in error
        ? String((error as { error?: unknown }).error)
        : 'Ошибка регистрации';
      return { ok: false, error: message };
    }
  },

  async login(params: {
    email: string;
    password: string;
  }): Promise<{ ok: boolean; error?: string; session?: AuthSession }> {
    try {
      const response = await axiosInstance.post<{ success: boolean; data?: AuthResponse }>(
        '/api/auth/login',
        params,
      );
      const session = response.data.data?.session;
      if (!session) {
        return { ok: false, error: 'Сервер не вернул сессию' };
      }
      saveSession(session);
      return { ok: true, session };
    } catch (error) {
      const message = typeof error === 'object' && error && 'error' in error
        ? String((error as { error?: unknown }).error)
        : 'Ошибка входа';
      return { ok: false, error: message };
    }
  },

  getSession(): AuthSession | null {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      return isAuthSession(parsed) ? parsed : null;
    } catch {
      return null;
    }
  },

  async logout(): Promise<{ ok: boolean; error?: string }> {
    const session = authService.getSession();
    if (!session?.token) {
      clearSession();
      return { ok: true };
    }

    try {
      await axiosInstance.post<{ success: boolean; data?: { message: string } }>(
        '/api/auth/logout',
        {},
      );
      clearSession();
      return { ok: true };
    } catch (error) {
      const status = typeof error === 'object' && error && 'status' in error
        ? Number((error as { status?: unknown }).status)
        : null;

      if (status === 401) {
        clearSession();
        return { ok: true };
      }

      const message = typeof error === 'object' && error && 'error' in error
        ? String((error as { error?: unknown }).error)
        : 'Ошибка выхода';
      return { ok: false, error: message };
    }
  },
};
