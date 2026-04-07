export interface UserAccount {
  id: string;
  email: string;
  username: string;
  createdAt: string;
}

export interface AuthSession {
  userId: string;
  username?: string;
  token: string;
  createdAt: string;
}
