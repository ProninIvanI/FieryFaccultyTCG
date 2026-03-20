import { Action, GameState } from '../types';
import { GameEngineContext } from '../engine/GameEngineContext';

export interface ActionCommand<T extends Action = Action> {
  type: T['type'];
  validate(action: T, state: GameState, ctx: GameEngineContext): string[];
  execute(action: T, state: GameState, ctx: GameEngineContext): void;
}
