import { ActionCommand } from './ActionCommand';
import { EvadeAction, GameState } from '../types';
import { GameEngineContext } from '../engine/GameEngineContext';
import {
  validateActionBase,
  validateActionLimit,
  validatePhase,
} from '../validation/validators';

export class EvadeActionCommand implements ActionCommand<EvadeAction> {
  readonly type = 'Evade' as const;

  validate(action: EvadeAction, state: GameState, _ctx: GameEngineContext): string[] {
    const errors: string[] = [];
    errors.push(...validatePhase(state, ['ActionPhase']));
    errors.push(...validateActionBase(action, state));
    errors.push(...validateActionLimit(state, action.playerId));
    return errors;
  }

  execute(action: EvadeAction, state: GameState, ctx: GameEngineContext): void {
    const player = state.players[action.playerId];
    player.actionPoints = Math.max(0, player.actionPoints - 1);

    const effectId = ctx.ids.next('effect');
    ctx.effects.enqueue({
      effectId,
      type: 'BuffEffect',
      sourceId: action.actorId,
      targetId: action.actorId,
      createdAtTurn: state.turn.number,
      duration: 1,
      data: {
        value: 2,
      },
    });
  }
}
