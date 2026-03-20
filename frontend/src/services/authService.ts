import { AuthSession, UserAccount } from '@/types';

const USERS_KEY = 'fftcg_users';
const SESSION_KEY = 'fftcg_session';

const isUserAccount = (value: unknown): value is UserAccount => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const user = value as UserAccount;
  return Boolean(user.id && user.email && user.username && user.passwordHash && user.createdAt);
};

const isAuthSession = (value: unknown): value is AuthSession => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const session = value as AuthSession;
  return Boolean(session.userId && session.token && session.createdAt);
};

const loadUsers = (): UserAccount[] => {
  const raw = localStorage.getItem(USERS_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isUserAccount);
  } catch {
    return [];
  }
};

const saveUsers = (users: UserAccount[]): void => {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
};

const saveSession = (session: AuthSession): void => {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
};

const hashPassword = async (value: string): Promise<string> => {
  if (crypto?.subtle) {
    const data = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return btoa(value);
};

export const authService = {
  async register(params: {
    email: string;
    username: string;
    password: string;
  }): Promise<{ ok: boolean; error?: string }> {
    const users = loadUsers();
    if (users.some((u) => u.email.toLowerCase() === params.email.toLowerCase())) {
      return { ok: false, error: 'Email уже зарегистрирован' };
    }
    if (users.some((u) => u.username.toLowerCase() === params.username.toLowerCase())) {
      return { ok: false, error: 'Имя пользователя занято' };
    }
    const passwordHash = await hashPassword(params.password);
    const user: UserAccount = {
      id: `user_${Date.now()}`,
      email: params.email,
      username: params.username,
      passwordHash,
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    saveUsers(users);
    return { ok: true };
  },

  async login(params: {
    email: string;
    password: string;
  }): Promise<{ ok: boolean; error?: string; session?: AuthSession }> {
    const users = loadUsers();
    const user = users.find((u) => u.email.toLowerCase() === params.email.toLowerCase());
    if (!user) {
      return { ok: false, error: 'Неверный email или пароль' };
    }
    const passwordHash = await hashPassword(params.password);
    if (passwordHash !== user.passwordHash) {
      return { ok: false, error: 'Неверный email или пароль' };
    }
    const session: AuthSession = {
      userId: user.id,
      token: `token_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    saveSession(session);
    return { ok: true, session };
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

  logout(): void {
    localStorage.removeItem(SESSION_KEY);
  },
};
