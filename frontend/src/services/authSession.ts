import { AuthSession } from '@/types';

const SESSION_KEY = 'fftcg_session';

export const isAuthSession = (value: unknown): value is AuthSession => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const session = value as Partial<AuthSession>;
  return (
    typeof session.userId === 'string' &&
    session.userId.length > 0 &&
    typeof session.token === 'string' &&
    session.token.length > 0 &&
    typeof session.createdAt === 'string' &&
    session.createdAt.length > 0 &&
    (session.username === undefined || typeof session.username === 'string')
  );
};

export const readStoredSession = (): AuthSession | null => {
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
};

export const saveStoredSession = (session: AuthSession): void => {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
};

export const clearStoredSession = (): void => {
  localStorage.removeItem(SESSION_KEY);
};
