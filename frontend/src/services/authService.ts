import axiosInstance from '@/services/api/axiosInstance';
import { AuthSession } from '@/types';
import { clearStoredSession, readStoredSession, saveStoredSession } from './authSession';

type AuthResponse = {
  user: {
    id: string;
    email: string;
    username: string;
    createdAt: string;
  };
  session: AuthSession;
};

const REGISTRATION_ERROR = '\u041e\u0448\u0438\u0431\u043a\u0430 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u0438';
const LOGIN_ERROR = '\u041e\u0448\u0438\u0431\u043a\u0430 \u0432\u0445\u043e\u0434\u0430';
const LOGOUT_ERROR = '\u041e\u0448\u0438\u0431\u043a\u0430 \u0432\u044b\u0445\u043e\u0434\u0430';
const SESSION_MISSING_ERROR = '\u0421\u0435\u0440\u0432\u0435\u0440 \u043d\u0435 \u0432\u0435\u0440\u043d\u0443\u043b \u0441\u0435\u0441\u0441\u0438\u044e';

const saveSession = (session: AuthSession): void => {
  saveStoredSession(session);
};

const clearSession = (): void => {
  clearStoredSession();
};

const toSessionWithUsername = (payload?: AuthResponse): AuthSession | null => {
  if (!payload?.session?.userId || !payload.session.token || !payload.session.createdAt) {
    return null;
  }

  return {
    ...payload.session,
    username: payload.user?.username || payload.session.username,
  };
};

export const authService = {
  async register(params: {
    email: string;
    username: string;
    password: string;
  }): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await axiosInstance.post<{ success: boolean; data?: AuthResponse }>(
        '/api/auth/register',
        params,
      );
      const session = toSessionWithUsername(response.data.data);
      if (session) {
        saveSession(session);
      }
      return { ok: true };
    } catch (error) {
      const message = typeof error === 'object' && error && 'error' in error
        ? String((error as { error?: unknown }).error)
        : REGISTRATION_ERROR;
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
      const session = toSessionWithUsername(response.data.data);
      if (!session) {
        return { ok: false, error: SESSION_MISSING_ERROR };
      }
      saveSession(session);
      return { ok: true, session };
    } catch (error) {
      const message = typeof error === 'object' && error && 'error' in error
        ? String((error as { error?: unknown }).error)
        : LOGIN_ERROR;
      return { ok: false, error: message };
    }
  },

  getSession(): AuthSession | null {
    return readStoredSession();
  },

  async ensureSessionProfile(sessionOverride?: AuthSession | null): Promise<AuthSession | null> {
    const session = sessionOverride ?? authService.getSession();
    if (!session?.token) {
      clearSession();
      return null;
    }

    if (session.username) {
      return session;
    }

    try {
      const response = await axiosInstance.get<{
        success: boolean;
        data?: {
          user?: {
            id?: string;
            username?: string;
          };
        };
      }>('/api/auth/me');

      const user = response.data.data?.user;
      if (user?.id !== session.userId || !user.username) {
        return session;
      }

      const nextSession: AuthSession = {
        ...session,
        username: user.username,
      };
      saveSession(nextSession);
      return nextSession;
    } catch {
      return session;
    }
  },

  async logout(sessionOverride?: AuthSession | null): Promise<{ ok: boolean; error?: string }> {
    const session = sessionOverride ?? authService.getSession();
    if (!session?.token) {
      clearSession();
      return { ok: true };
    }

    try {
      await axiosInstance.post('/api/auth/logout', {}, {
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      });

      clearSession();
      return { ok: true };
    } catch (error) {
      const status = typeof error === 'object' && error && 'status' in error
        ? (error as { status?: unknown }).status
        : undefined;
      if (status === 401) {
        clearSession();
        return { ok: true };
      }

      return { ok: false, error: LOGOUT_ERROR };
    }
  },
};
