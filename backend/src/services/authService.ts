import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import { PublicUser, toPublicUser, userModel } from '../models/userModel';

type AuthSessionPayload = {
  userId: string;
  token: string;
  createdAt: string;
};

type AuthSuccess = {
  user: PublicUser;
  session: AuthSessionPayload;
};

type RegisterResult =
  | { ok: true; data: AuthSuccess }
  | { ok: false; error: string };

type LoginResult =
  | { ok: true; data: AuthSuccess }
  | { ok: false; error: string };

type LogoutResult =
  | { ok: true }
  | { ok: false; error: string };

const hashPassword = (password: string, salt?: string): string => {
  const resolvedSalt = salt ?? randomBytes(16).toString('hex');
  const derived = scryptSync(password, resolvedSalt, 64).toString('hex');
  return `${resolvedSalt}:${derived}`;
};

const verifyPassword = (password: string, storedHash: string): boolean => {
  const [salt, expected] = storedHash.split(':');
  if (!salt || !expected) {
    return false;
  }
  const candidate = hashPassword(password, salt).split(':')[1];
  return timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(expected, 'hex'));
};

const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

const buildAuthSuccess = async (user: PublicUser): Promise<AuthSuccess> => {
  const token = randomBytes(32).toString('hex');
  const session = await userModel.createSession({
    id: randomUUID(),
    userId: user.id,
    tokenHash: hashToken(token),
  });

  return {
    user,
    session: {
      userId: session.userId,
      token,
      createdAt: session.createdAt,
    },
  };
};

export class AuthService {
  async register(params: {
    email: string;
    username: string;
    password: string;
  }): Promise<RegisterResult> {
    const email = params.email.trim().toLowerCase();
    const username = params.username.trim();

    const existingByEmail = await userModel.findByEmail(email);
    if (existingByEmail) {
      return { ok: false, error: 'Email уже зарегистрирован' };
    }

    const existingByUsername = await userModel.findByUsername(username);
    if (existingByUsername) {
      return { ok: false, error: 'Имя пользователя занято' };
    }

    const created = await userModel.create({
      id: `user_${randomUUID()}`,
      email,
      username,
      passwordHash: hashPassword(params.password),
    });

    return {
      ok: true,
      data: await buildAuthSuccess(toPublicUser(created)),
    };
  }

  async login(params: {
    email: string;
    password: string;
  }): Promise<LoginResult> {
    const email = params.email.trim().toLowerCase();
    const user = await userModel.findByEmail(email);

    if (!user || !verifyPassword(params.password, user.passwordHash)) {
      return { ok: false, error: 'Неверный email или пароль' };
    }

    return {
      ok: true,
      data: await buildAuthSuccess(toPublicUser(user)),
    };
  }

  async getUserByToken(token: string): Promise<PublicUser | null> {
    if (!token) {
      return null;
    }

    const user = await userModel.findBySessionTokenHash(hashToken(token));
    return user ? toPublicUser(user) : null;
  }

  async logout(token: string): Promise<LogoutResult> {
    if (!token) {
      return { ok: false, error: 'Не авторизован' };
    }

    const deleted = await userModel.deleteSessionByTokenHash(hashToken(token));
    if (!deleted) {
      return { ok: false, error: 'Не авторизован' };
    }

    return { ok: true };
  }
}
