import { GameSession } from './GameSession';
import { GameEngineLike } from '../../types/engine';
import { SessionPlayerLoadout } from '../../types/session';

export type EngineFactory = (seed: number, players: SessionPlayerLoadout[]) => GameEngineLike;

export class SessionRegistry {
  private readonly sessions = new Map<string, GameSession>();

  constructor(private readonly engineFactory: EngineFactory) {}

  create(sessionId: string, seed: number, players: SessionPlayerLoadout[]): GameSession {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return existing;
    }
    const engine = this.engineFactory(seed, players);
    const session = new GameSession(sessionId, seed, engine);
    this.sessions.set(sessionId, session);
    return session;
  }

  get(sessionId: string): GameSession | undefined {
    return this.sessions.get(sessionId);
  }
}
