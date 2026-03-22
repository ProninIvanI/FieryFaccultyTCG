import { randomUUID } from 'crypto';
import { Action, GameState } from '../../../../game-core/src/types';

export type PersistentMatchPlayer = {
  id: string;
  userId: string;
  playerSlot: number;
  playerIdInMatch: string;
  deckId: string;
  connectedAt: string;
};

export type PersistentMatchCreatePayload = {
  id: string;
  matchId: string;
  status: 'active';
  createdByUserId: string;
  seed: string;
  gameCoreVersion: string;
  rulesVersion: string;
  startState: GameState;
  startedAt: string;
  lastAppliedActionAt: string | null;
  players: PersistentMatchPlayer[];
};

export type PersistentMatchReplayPayload = {
  id: string;
  matchId: string;
  formatVersion: string;
  initialContext: unknown;
  commandLog: Action[];
  checkpoints?: unknown | null;
  finalHash?: string | null;
};

export interface MatchPersistenceClientLike {
  createMatch(payload: PersistentMatchCreatePayload): Promise<void>;
  saveReplay(matchId: string, payload: PersistentMatchReplayPayload): Promise<void>;
}

const DEFAULT_BACKEND_URL = process.env.BACKEND_API_URL ?? 'http://backend:3001';
const DEFAULT_INTERNAL_TOKEN = process.env.INTERNAL_API_TOKEN ?? 'dev-internal-token';

const buildHeaders = (): HeadersInit => ({
  'Content-Type': 'application/json',
  'x-internal-token': DEFAULT_INTERNAL_TOKEN,
});

const postJson = async (url: string, body: unknown): Promise<void> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Persistence request failed: ${response.status} ${text}`);
  }
};

export class HttpMatchPersistenceClient implements MatchPersistenceClientLike {
  async createMatch(payload: PersistentMatchCreatePayload): Promise<void> {
    await postJson(`${DEFAULT_BACKEND_URL}/api/internal/matches`, payload);
  }

  async saveReplay(matchId: string, payload: PersistentMatchReplayPayload): Promise<void> {
    await postJson(`${DEFAULT_BACKEND_URL}/api/internal/matches/${encodeURIComponent(matchId)}/replay`, payload);
  }
}

export class NoopMatchPersistenceClient implements MatchPersistenceClientLike {
  async createMatch(_payload: PersistentMatchCreatePayload): Promise<void> {}

  async saveReplay(_matchId: string, _payload: PersistentMatchReplayPayload): Promise<void> {}
}

export const createPersistentMatchId = (sessionId: string): string => `match_${sessionId}`;
export const createPersistentReplayId = (): string => `replay_${randomUUID()}`;
