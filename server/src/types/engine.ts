import { Action, GameState } from '../../../game-core/src/types';
import { SessionPlayerLoadout } from './session';

export interface GameEngineLike {
  getState(): GameState;
  processAction(action: Action): { ok: boolean; errors?: string[] };
  syncPlayerLoadout(loadout: SessionPlayerLoadout): void;
}
