import { EffectDefinition, GameState } from '../types';

const getTargetEvasion = (state: GameState, targetId: string): number | null => {
  const character = state.characters[targetId];
  if (character) {
    return character.dexterity;
  }

  const creature = state.creatures[targetId];
  if (creature) {
    return creature.speed;
  }

  return null;
};

export const shouldEnqueueEffectForTarget = (
  state: GameState,
  targetId: string,
  effectDef: EffectDefinition,
  sourceSpeed: number,
  options?: {
    ignoreEvade?: boolean;
  },
): boolean => {
  if (effectDef.type !== 'DamageEffect' || effectDef.ignoreEvade || options?.ignoreEvade) {
    return true;
  }

  const targetEvasion = getTargetEvasion(state, targetId);
  if (targetEvasion === null) {
    return false;
  }

  return targetEvasion < sourceSpeed;
};
