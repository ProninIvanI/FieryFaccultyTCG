export type MatchStatus = 'pending' | 'active' | 'finished' | 'aborted';

export type MatchEndReason = 'victory' | 'surrender' | 'disconnect' | 'abort' | 'error';

export type MatchPlayerFinishResult = 'pending' | 'win' | 'loss' | 'draw' | 'abandoned';

export interface MatchPlayerRecord {
  id: string;
  matchId: string;
  userId: string;
  username?: string;
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

export interface MatchListResponse {
  matches: MatchSummary[];
}
