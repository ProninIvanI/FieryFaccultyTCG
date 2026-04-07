import { EffectDefinition, GameState } from '../types';

export const buildEffectTargetIds = (
  state: GameState,
  actorId: string,
  targetId: string | undefined,
  effectDef: EffectDefinition,
): string[] => {
  if (effectDef.appliesToAllCreatures) {
    return Object.keys(state.creatures).sort();
  }

  if (effectDef.appliesToAllEnemies) {
    const actorOwnerId = state.characters[actorId]?.ownerId;
    if (!actorOwnerId) {
      return targetId ? [targetId] : [];
    }

    const enemyCharacterIds = Object.values(state.characters)
      .filter((character) => character.ownerId !== actorOwnerId)
      .map((character) => character.characterId);
    const enemyCreatureIds = Object.values(state.creatures)
      .filter((creature) => creature.ownerId !== actorOwnerId)
      .map((creature) => creature.creatureId);

    return [...enemyCharacterIds, ...enemyCreatureIds].sort();
  }

  return targetId ? [targetId] : [];
};

