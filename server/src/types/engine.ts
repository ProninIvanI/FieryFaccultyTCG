import { Action, GameState } from '../../../game-core/src/types';

export interface GameEngineLike {
  getState(): GameState;
  processAction(action: Action): { ok: boolean; errors?: string[] };
}
