// Общие типы для приложения

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface HealthCheckResponse {
  status: string;
  message: string;
  database?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  createdAt: string;
}

export interface AuthSessionResponse {
  userId: string;
  token: string;
  createdAt: string;
}

export interface AuthResponse {
  user: AuthUser;
  session: AuthSessionResponse;
}

export interface AuthenticatedUserResponse {
  user: AuthUser;
}

export interface DeckCardItem {
  cardId: string;
  quantity: number;
}

export interface UserDeck {
  id: string;
  userId: string;
  name: string;
  characterId: string | null;
  createdAt: string;
  updatedAt: string;
  cards: DeckCardItem[];
}

export interface DeckResponse {
  deck: UserDeck;
}

export interface DeckListResponse {
  decks: UserDeck[];
}

export interface DeleteDeckResponse {
  message: string;
}

export interface SaveDeckRequest {
  name: string;
  characterId: string | null;
  cards: DeckCardItem[];
}






