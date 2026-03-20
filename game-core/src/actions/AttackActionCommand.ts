import { ActionCommand } from './ActionCommand';
import { AttackAction, GameState } from '../types';
import { GameEngineContext } from '../engine/GameEngineContext';
import { validateActionBase, validatePhase, validateTarget } from '../validation/validators';

export class AttackActionCommand implements ActionCommand<AttackAction> {
  readonly type = 'Attack' as const;

  validate(action: AttackAction, state: GameState, _ctx: GameEngineContext): string[] {
    const errors: string[] = [];
    errors.push(...validatePhase(state, ['ActionPhase']));
    errors.push(...validateActionBase(action, state));
    errors.push(...validateTarget(state, action.targetId));
    return errors;
  }

  execute(action: AttackAction, state: GameState, ctx: GameEngineContext): void {
    const targetId = action.targetId;
    const character = state.characters[targetId];
    const creature = state.creatures[targetId];
    if (!character && !creature) {
      return;
    }

    const targetDex = character ? character.dexterity : creature!.speed;
    if (targetDex >= action.speed) {
      return;
    }

    const effectId = ctx.ids.next('effect');
    ctx.effects.enqueue({
      effectId,
      type: 'DamageEffect',
      sourceId: action.actorId,
      targetId,
      createdAtTurn: state.turn.number,
      data: {
        value: action.power,
        attackType: action.attackType,
      },
    });
  }
}
