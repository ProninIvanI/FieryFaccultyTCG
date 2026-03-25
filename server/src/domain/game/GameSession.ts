import {
  Action,
  GameState,
  PlayerRoundDraft,
  RoundActionIntent,
  RoundDraftValidationResult,
  RoundResolutionResult,
} from '../../../../game-core/src/types';
import { GameEngineLike } from '../../types/engine';
import { SessionPlayerLoadout } from '../../types/session';

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

  syncPlayerLoadout(loadout: SessionPlayerLoadout): void {
    this.engine.syncPlayerLoadout(loadout);
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

  getRoundDraft(playerId: string): PlayerRoundDraft | null {
    if (!this.players.has(playerId)) {
      return null;
    }
    return this.engine.getRoundDraft(playerId);
  }

  processAction(action: Action): { ok: boolean; errors?: string[] } {
    if (!this.players.has(action.playerId)) {
      return { ok: false, errors: ['Player is not in session'] };
    }
    return this.engine.processAction(action);
  }

  submitRoundDraft(
    playerId: string,
    roundNumber: number,
    intents: RoundActionIntent[],
  ): RoundDraftValidationResult {
    if (!this.players.has(playerId)) {
      return {
        ok: false,
        errors: [{ code: 'player_not_in_session', message: 'Player is not in session' }],
      };
    }
    return this.engine.submitRoundDraft(playerId, roundNumber, intents);
  }

  lockRoundDraft(playerId: string, roundNumber: number): RoundDraftValidationResult {
    if (!this.players.has(playerId)) {
      return {
        ok: false,
        errors: [{ code: 'player_not_in_session', message: 'Player is not in session' }],
      };
    }
    return this.engine.lockRoundDraft(playerId, roundNumber);
  }

  resolveRoundIfReady(): RoundResolutionResult | null {
    return this.engine.resolveRoundIfReady();
  }
}
