export interface UserAccount {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  createdAt: string;
}

export interface AuthSession {
  userId: string;
  token: string;
  createdAt: string;
}
