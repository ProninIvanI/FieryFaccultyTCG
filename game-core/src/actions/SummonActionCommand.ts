import { ActionCommand } from './ActionCommand';
import { SummonAction, GameState } from '../types';
import { GameEngineContext } from '../engine/GameEngineContext';
import {
  validateActionBase,
  validateActionLimit,
  validateCardLocation,
  validateCardOwnership,
  validateCreatureBoardLimit,
  validateMana,
  validatePhase,
} from '../validation/validators';

export class SummonActionCommand implements ActionCommand<SummonAction> {
  readonly type = 'Summon' as const;

  validate(action: SummonAction, state: GameState, ctx: GameEngineContext): string[] {
    const errors: string[] = [];
    errors.push(...validatePhase(state, ['ActionPhase']));
    errors.push(...validateActionBase(action, state));
    errors.push(...validateActionLimit(state, action.playerId));
    const instance = state.cardInstances[action.cardInstanceId];
    if (!instance) {
      errors.push('Card instance not found');
      return errors;
    }
    const def = ctx.cards.get(instance.definitionId);
    if (!def) {
      errors.push('Card definition not found');
      return errors;
    }
    errors.push(...validateCardOwnership(state, action.playerId, action.cardInstanceId));
    errors.push(...validateCardLocation(state, action.cardInstanceId, ['hand']));
    errors.push(...validateMana(state, action.playerId, def.manaCost));
    errors.push(...validateCreatureBoardLimit(state, action.playerId));
    return errors;
  }

  execute(action: SummonAction, state: GameState, ctx: GameEngineContext): void {
    const instance = state.cardInstances[action.cardInstanceId];
    if (!instance) {
      return;
    }
    const def = ctx.cards.get(instance.definitionId);
    if (!def) {
      return;
    }
    const player = state.players[action.playerId];
    player.mana = Math.max(0, player.mana - def.manaCost);
    player.actionPoints = Math.max(0, player.actionPoints - 1);

    instance.location = 'board';

    const effectId = ctx.ids.next('effect');
    ctx.effects.enqueue({
      effectId,
      type: 'SummonEffect',
      sourceId: action.actorId,
      ownerId: action.playerId,
      sourceCardInstanceId: action.cardInstanceId,
      definitionId: def.id,
      createdAtTurn: state.turn.number,
      data: {
        hp: def.manaCost + 2,
        attack: Math.max(1, def.manaCost - 1),
        speed: def.speed,
        creatureDefinitionId: def.id,
      },
    });
  }
}
