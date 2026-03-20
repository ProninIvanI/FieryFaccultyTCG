import { GameSession } from './GameSession';
import { GameEngineLike } from '../../types/engine';

export type EngineFactory = (seed: number) => GameEngineLike;

export class SessionRegistry {
  private readonly sessions = new Map<string, GameSession>();

  constructor(private readonly engineFactory: EngineFactory) {}

  getOrCreate(sessionId: string, seed: number): GameSession {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return existing;
    }
    const engine = this.engineFactory(seed);
    const session = new GameSession(sessionId, seed, engine);
    this.sessions.set(sessionId, session);
    return session;
  }

  get(sessionId: string): GameSession | undefined {
    return this.sessions.get(sessionId);
  }
}
