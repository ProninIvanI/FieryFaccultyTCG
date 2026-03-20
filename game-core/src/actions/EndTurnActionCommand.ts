import { ActionCommand } from './ActionCommand';
import { EndTurnAction, GameState } from '../types';
import { GameEngineContext } from '../engine/GameEngineContext';
import { validatePhase } from '../validation/validators';

export class EndTurnActionCommand implements ActionCommand<EndTurnAction> {
  readonly type = 'EndTurn' as const;

  validate(action: EndTurnAction, state: GameState, _ctx: GameEngineContext): string[] {
    const errors: string[] = [];
    errors.push(...validatePhase(state, ['ActionPhase', 'EndPhase']));
    if (!state.players[action.playerId]) {
      errors.push('Player not found');
    }
    if (state.turn.activePlayerId !== action.playerId) {
      errors.push('Only active player can end turn');
    }
    return errors;
  }

  execute(_action: EndTurnAction, state: GameState, _ctx: GameEngineContext): void {
    state.phase.current = 'EndPhase';
  }
}
