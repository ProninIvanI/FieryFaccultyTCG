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
  characterId: string;
  cards: DeckCardItem[];
}

export type MatchStatus = 'pending' | 'active' | 'finished' | 'aborted';

export type MatchEndReason = 'victory' | 'surrender' | 'disconnect' | 'abort' | 'error';

export type MatchPlayerFinishResult = 'pending' | 'win' | 'loss' | 'draw' | 'abandoned';

export interface MatchPlayerRecord {
  id: string;
  matchId: string;
  userId: string;
  playerSlot: number;
  playerIdInMatch: string;
  deckId: string | null;
  deckNameSnapshot: string | null;
  deckSnapshot: unknown | null;
  isWinner: boolean;
  finishResult: MatchPlayerFinishResult;
  connectedAt: string | null;
  disconnectedAt: string | null;
  createdAt: string;
}

export interface MatchReplayRecord {
  id: string;
  matchId: string;
  formatVersion: string;
  initialContext: unknown;
  commandLog: unknown;
  checkpoints: unknown | null;
  finalHash: string | null;
  createdAt: string;
}

export interface MatchRecord {
  id: string;
  matchId: string;
  status: MatchStatus;
  createdByUserId: string | null;
  winnerUserId: string | null;
  seed: string;
  gameCoreVersion: string;
  rulesVersion: string;
  endReason: MatchEndReason | null;
  startState: unknown;
  finalState: unknown | null;
  turnCount: number;
  actionCount: number;
  lastAppliedActionAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  players: MatchPlayerRecord[];
}

export interface MatchSummary {
  matchId: string;
  status: MatchStatus;
  createdByUserId: string | null;
  winnerUserId: string | null;
  seed: string;
  gameCoreVersion: string;
  rulesVersion: string;
  endReason: MatchEndReason | null;
  turnCount: number;
  actionCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  players: MatchPlayerRecord[];
}

export interface CreateMatchPlayerInput {
  id: string;
  userId: string;
  playerSlot: number;
  playerIdInMatch: string;
  deckId: string | null;
  deckNameSnapshot?: string | null;
  deckSnapshot?: unknown | null;
  connectedAt?: string | null;
}

export interface CreateMatchRecordInput {
  id: string;
  matchId: string;
  status: MatchStatus;
  createdByUserId: string | null;
  seed: string;
  gameCoreVersion: string;
  rulesVersion: string;
  startState: unknown;
  startedAt?: string | null;
  lastAppliedActionAt?: string | null;
  players: CreateMatchPlayerInput[];
}

export interface CompleteMatchPlayerInput {
  userId: string;
  isWinner: boolean;
  finishResult: MatchPlayerFinishResult;
  disconnectedAt?: string | null;
}

export interface CompleteMatchInput {
  status: Extract<MatchStatus, 'finished' | 'aborted'>;
  winnerUserId: string | null;
  endReason: MatchEndReason;
  finalState: unknown;
  turnCount: number;
  actionCount: number;
  finishedAt?: string | null;
  lastAppliedActionAt?: string | null;
  players: CompleteMatchPlayerInput[];
}

export interface SaveMatchReplayInput {
  id: string;
  matchId: string;
  formatVersion: string;
  initialContext: unknown;
  commandLog: unknown;
  checkpoints?: unknown | null;
  finalHash?: string | null;
}

export interface MatchResponse {
  match: MatchRecord;
}

export interface MatchListResponse {
  matches: MatchSummary[];
}

export interface MatchReplayResponse {
  replay: MatchReplayRecord;
}






