import { ActionCommand } from './ActionCommand';
import { PlayCardAction, GameState } from '../types';
import { GameEngineContext } from '../engine/GameEngineContext';
import {
  validateActionBase,
  validateActionLimit,
  validateCardLocation,
  validateCardOwnership,
  validateMana,
  validatePhase,
  validateTargetType,
} from '../validation/validators';
import { moveCardInstance } from '../utils/cardZones';
import { buildEffectTargetIds } from './effectTargets';
import { shouldEnqueueEffectForTarget } from './effectResolution';

function buildEffectData(effectDef: NonNullable<GameEngineContext['cards'] extends { get(id: string): infer T } ? T : never>['effects'][number]): Record<string, unknown> {
  return {
    value: effectDef.value,
    attackType: effectDef.attackType,
    creatureDefinitionId: effectDef.creatureDefinitionId,
    stat: effectDef.stat,
    targetCount: effectDef.targetCount,
    ignoreShield: effectDef.ignoreShield,
    ignoreEvade: effectDef.ignoreEvade,
    repeatNextTurn: effectDef.repeatNextTurn,
    appliesToAllEnemies: effectDef.appliesToAllEnemies,
    appliesToAllCreatures: effectDef.appliesToAllCreatures,
  };
}

export class PlayCardActionCommand implements ActionCommand<PlayCardAction> {
  readonly type = 'PlayCard' as const;

  validate(action: PlayCardAction, state: GameState, ctx: GameEngineContext): string[] {
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
    errors.push(...validateTargetType(state, action.actorId, action.targetId, action.targetType));
    return errors;
  }

  execute(action: PlayCardAction, state: GameState, ctx: GameEngineContext): void {
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

    moveCardInstance(state, instance.instanceId, 'discard');

    def.effects.forEach((effectDef) => {
      buildEffectTargetIds(state, action.actorId, action.targetId, effectDef).forEach((targetId) => {
        if (!shouldEnqueueEffectForTarget(state, targetId, effectDef, def.speed)) {
          return;
        }
        const effectId = ctx.ids.next('effect');
        ctx.effects.enqueue({
          effectId,
          type: effectDef.type,
          sourceId: action.actorId,
          ownerId: action.playerId,
          sourceCardInstanceId: action.cardInstanceId,
          definitionId: def.id,
          targetId,
          createdAtTurn: state.turn.number,
          duration: effectDef.duration,
          data: buildEffectData(effectDef),
        });
      });
    });
  }
}
