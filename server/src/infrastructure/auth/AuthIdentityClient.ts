type AuthUserResponse = {
  success: boolean;
  data?: {
    user?: {
      id?: string;
    };
  };
};

export type AuthIdentity = {
  userId: string;
};

const DEFAULT_AUTH_ME_URL = process.env.BACKEND_AUTH_ME_URL ?? 'http://backend:3001/api/auth/me';

export const resolveAuthIdentity = async (token: string): Promise<AuthIdentity | null> => {
  const response = await fetch(DEFAULT_AUTH_ME_URL, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as AuthUserResponse;
  const userId = payload.data?.user?.id;
  if (!userId || typeof userId !== 'string') {
    return null;
  }

  return { userId };
};
