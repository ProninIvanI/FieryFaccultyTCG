import { ActionCommand } from './ActionCommand';
import { PlayCardAction, GameState } from '../types';
import { GameEngineContext } from '../engine/GameEngineContext';
import {
  validateActionBase,
  validateCardLocation,
  validateCardOwnership,
  validatePhase,
  validateTargetType,
} from '../validation/validators';

export class PlayCardActionCommand implements ActionCommand<PlayCardAction> {
  readonly type = 'PlayCard' as const;

  validate(action: PlayCardAction, state: GameState, _ctx: GameEngineContext): string[] {
    const errors: string[] = [];
    errors.push(...validatePhase(state, ['ActionPhase']));
    errors.push(...validateActionBase(action, state));
    errors.push(...validateCardOwnership(state, action.playerId, action.cardInstanceId));
    errors.push(...validateCardLocation(state, action.cardInstanceId, ['hand']));
    errors.push(...validateTargetType(state, action.actorId, action.targetId, action.targetType));
    return errors;
  }

  execute(_action: PlayCardAction, _state: GameState, _ctx: GameEngineContext): void {}
}
