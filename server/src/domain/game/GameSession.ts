import { Action, GameState } from '../../../../game-core/src/types';
import { GameEngineLike } from '../../types/engine';

export class GameSession {
  private readonly players = new Set<string>();
  private readonly seed: number;

  constructor(
    readonly id: string,
    seed: number,
    private readonly engine: GameEngineLike
  ) {
    this.seed = seed;
  }

  getSeed(): number {
    return this.seed;
  }

  addPlayer(playerId: string): void {
    this.players.add(playerId);
  }

  hasPlayer(playerId: string): boolean {
    return this.players.has(playerId);
  }

  getPlayerCount(): number {
    return this.players.size;
  }

  getState(): GameState {
    return this.engine.getState();
  }

  processAction(action: Action): { ok: boolean; errors?: string[] } {
    if (!this.players.has(action.playerId)) {
      return { ok: false, errors: ['Player is not in session'] };
    }
    return this.engine.processAction(action);
  }
}
