import { ActionCommand } from './ActionCommand';
import { CastSpellAction, GameState } from '../types';
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

export class CastSpellActionCommand implements ActionCommand<CastSpellAction> {
  readonly type = 'CastSpell' as const;

  validate(action: CastSpellAction, state: GameState, ctx: GameEngineContext): string[] {
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
    const spellManaDiscount = Number(state.players[action.playerId]?.pendingSpellManaDiscount ?? 0);
    errors.push(...validateMana(state, action.playerId, Math.max(0, def.manaCost - spellManaDiscount)));
    errors.push(...validateTargetType(state, action.actorId, action.targetId, def.targetType));
    return errors;
  }

  execute(action: CastSpellAction, state: GameState, ctx: GameEngineContext): void {
    const instance = state.cardInstances[action.cardInstanceId];
    if (!instance) {
      return;
    }
    const def = ctx.cards.get(instance.definitionId);
    if (!def) {
      return;
    }
    const player = state.players[action.playerId];
    player.actionPoints = Math.max(0, player.actionPoints - 1);
    const spellDamageBonus = Number(player.pendingSpellDamageBonus ?? 0);
    const spellSpeedBonus = Number(player.pendingSpellSpeedBonus ?? 0);
    const spellIgnoreShield = Number(player.pendingSpellIgnoreShield ?? 0);
    const spellIgnoreEvade = player.pendingSpellIgnoreEvade === true;
    const spellManaDiscount = Number(player.pendingSpellManaDiscount ?? 0);
    const spellRepeatNextTurn = player.pendingSpellRepeatNextTurn === true;

    const manaCost = Math.max(0, def.manaCost - spellManaDiscount);
    player.mana = Math.max(0, player.mana - manaCost);
    player.pendingSpellDamageBonus = undefined;
    player.pendingSpellSpeedBonus = undefined;
    player.pendingSpellIgnoreShield = undefined;
    player.pendingSpellIgnoreEvade = undefined;
    player.pendingSpellManaDiscount = undefined;
    player.pendingSpellRepeatNextTurn = undefined;

    moveCardInstance(state, instance.instanceId, 'discard');

    def.effects.forEach((effectDef) => {
      buildEffectTargetIds(state, action.actorId, action.targetId, effectDef).forEach((targetId) => {
        if (!shouldEnqueueEffectForTarget(
          state,
          targetId,
          effectDef,
          def.speed + spellSpeedBonus,
          { ignoreEvade: spellIgnoreEvade },
        )) {
          return;
        }
        const effectId = ctx.ids.next('effect');
        const effectData = buildEffectData(effectDef);
        if (effectDef.type === 'DamageEffect') {
          effectData.value = Number(effectData.value ?? 0) + spellDamageBonus;
          effectData.ignoreShield = Math.max(
            Number(effectData.ignoreShield ?? 0),
            spellIgnoreShield,
          );
          if (spellIgnoreEvade) {
            effectData.ignoreEvade = true;
          }
          if (spellRepeatNextTurn) {
            effectData.repeatNextTurn = true;
          }
        }
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
          data: effectData,
        });
      });
    });
  }
}
