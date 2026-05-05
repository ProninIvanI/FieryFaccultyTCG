import { CardRegistry } from '../cards/CardRegistry';
import { validateTargetType } from '../validation/validators';
import {
  GameState,
  RoundActionIntent,
  RoundActionIntentTarget,
  TargetType,
} from '../types';

type IntentPlanningState = Pick<GameState, 'cardInstances' | 'characters' | 'creatures'>;
type CreatureIntentPlanningState = Pick<GameState, 'characters' | 'creatures' | 'round'>;

export interface CreateInitialCardRoundIntentParams {
  state: IntentPlanningState;
  cards: CardRegistry;
  intentId: string;
  roundNumber: number;
  queueIndex: number;
  playerId: string;
  actorId: string;
  cardInstanceId: string;
}

export interface CreateInitialCreatureRoundIntentParams {
  state: CreatureIntentPlanningState;
  intentId: string;
  roundNumber: number;
  queueIndex: number;
  playerId: string;
  creatureId: string;
  actionKind: 'Attack' | 'Evade';
  preferredTargetId?: string;
}

const sortIds = (ids: string[]): string[] => [...ids].sort((left, right) => left.localeCompare(right));

const getOwnerIdByActor = (
  state: Pick<GameState, 'characters' | 'creatures'>,
  actorId: string,
): string | undefined => state.characters[actorId]?.ownerId ?? state.creatures[actorId]?.ownerId;

const getDefaultTargetCandidates = (
  state: IntentPlanningState,
  actorId: string,
  targetType: TargetType,
): string[] => {
  const actorOwnerId = getOwnerIdByActor(state, actorId);
  if (!actorOwnerId) {
    return [];
  }

  const allyCharacterIds = sortIds(
    Object.keys(state.characters).filter((characterId) => state.characters[characterId]?.ownerId === actorOwnerId),
  );
  const enemyCharacterIds = sortIds(
    Object.keys(state.characters).filter((characterId) => state.characters[characterId]?.ownerId !== actorOwnerId),
  );
  const enemyCreatureIds = sortIds(
    Object.keys(state.creatures).filter((creatureId) => state.creatures[creatureId]?.ownerId !== actorOwnerId),
  );
  const allyCreatureIds = sortIds(
    Object.keys(state.creatures).filter((creatureId) => state.creatures[creatureId]?.ownerId === actorOwnerId),
  );

  switch (targetType) {
    case 'self':
      return [actorId];
    case 'allyCharacter':
      return allyCharacterIds;
    case 'enemyCharacter':
      return enemyCharacterIds;
    case 'enemyAny':
      return [...enemyCharacterIds, ...enemyCreatureIds];
    case 'creature':
      return [...enemyCreatureIds, ...allyCreatureIds];
    case 'any':
      return [...enemyCharacterIds, ...enemyCreatureIds, ...allyCharacterIds, ...allyCreatureIds];
  }
};

const isValidAttackTarget = (
  state: Pick<GameState, 'characters' | 'creatures'>,
  creatureId: string,
  targetId: string,
): boolean => {
  const ownerId = state.creatures[creatureId]?.ownerId;
  if (!ownerId) {
    return false;
  }

  const targetCharacter = state.characters[targetId];
  if (targetCharacter) {
    return targetCharacter.ownerId !== ownerId;
  }

  const targetCreature = state.creatures[targetId];
  if (targetCreature) {
    return targetCreature.ownerId !== ownerId;
  }

  return false;
};

const getAttackTargetType = (
  state: Pick<GameState, 'characters' | 'creatures'>,
  targetId: string,
): TargetType | null => {
  if (state.characters[targetId]) {
    return 'enemyCharacter';
  }

  if (state.creatures[targetId]) {
    return 'creature';
  }

  return null;
};

export const getInitialAttackTargetForCreature = (
  state: CreatureIntentPlanningState,
  creatureId: string,
  preferredTargetId?: string,
): RoundActionIntentTarget | null => {
  const ownerId = state.creatures[creatureId]?.ownerId;
  if (!ownerId) {
    return null;
  }

  if (preferredTargetId && isValidAttackTarget(state, creatureId, preferredTargetId)) {
    const targetType = getAttackTargetType(state, preferredTargetId);
    return targetType ? { targetType, targetId: preferredTargetId } : null;
  }

  const enemyCharacterIds = sortIds(
    Object.keys(state.characters).filter((characterId) => state.characters[characterId]?.ownerId !== ownerId),
  );
  const enemyCreatureIds = sortIds(
    Object.keys(state.creatures).filter((targetCreatureId) => state.creatures[targetCreatureId]?.ownerId !== ownerId),
  );
  const defaultTargetId = [...enemyCharacterIds, ...enemyCreatureIds].find((candidateId) =>
    isValidAttackTarget(state, creatureId, candidateId),
  );

  if (!defaultTargetId) {
    return null;
  }

  const targetType = getAttackTargetType(state, defaultTargetId);
  return targetType ? { targetType, targetId: defaultTargetId } : null;
};

export const getInitialTargetForType = (
  state: IntentPlanningState,
  actorId: string,
  targetType: TargetType,
): RoundActionIntentTarget => {
  const targetId = getDefaultTargetCandidates(state, actorId, targetType).find(
    (candidateId) => validateTargetType(state, actorId, candidateId, targetType).length === 0,
  );

  return targetId ? { targetType, targetId } : { targetType };
};

export const createInitialCardRoundIntent = (
  params: CreateInitialCardRoundIntentParams,
): Extract<RoundActionIntent, { kind: 'Summon' | 'CastSpell' | 'PlayCard' }> | null => {
  const instance = params.state.cardInstances[params.cardInstanceId];
  if (!instance) {
    return null;
  }

  const definition = params.cards.get(instance.definitionId);
  if (!definition) {
    return null;
  }

  if (definition.type === 'creature') {
    return {
      intentId: params.intentId,
      roundNumber: params.roundNumber,
      queueIndex: params.queueIndex,
      playerId: params.playerId,
      actorId: params.actorId,
      kind: 'Summon',
      cardInstanceId: params.cardInstanceId,
    };
  }

  const target = getInitialTargetForType(params.state, params.actorId, definition.targetType);

  if (definition.type === 'spell') {
    return {
      intentId: params.intentId,
      roundNumber: params.roundNumber,
      queueIndex: params.queueIndex,
      playerId: params.playerId,
      actorId: params.actorId,
      kind: 'CastSpell',
      cardInstanceId: params.cardInstanceId,
      target,
    };
  }

  return {
    intentId: params.intentId,
    roundNumber: params.roundNumber,
    queueIndex: params.queueIndex,
    playerId: params.playerId,
    actorId: params.actorId,
    kind: 'PlayCard',
    cardInstanceId: params.cardInstanceId,
    target,
  };
};

export const createInitialCreatureRoundIntent = (
  params: CreateInitialCreatureRoundIntentParams,
): Extract<RoundActionIntent, { kind: 'Attack' | 'Evade' }> | null => {
  const creature = params.state.creatures[params.creatureId];
  if (!creature || creature.ownerId !== params.playerId) {
    return null;
  }

  if (params.actionKind === 'Evade') {
    return {
      intentId: params.intentId,
      roundNumber: params.roundNumber,
      queueIndex: params.queueIndex,
      playerId: params.playerId,
      actorId: params.creatureId,
      kind: 'Evade',
    };
  }

  if (creature.summonedAtRound === params.roundNumber) {
    return null;
  }

  const target = getInitialAttackTargetForCreature(
    params.state,
    params.creatureId,
    params.preferredTargetId,
  );
  if (!target?.targetId || !target.targetType) {
    return null;
  }

  return {
    intentId: params.intentId,
    roundNumber: params.roundNumber,
    queueIndex: params.queueIndex,
    playerId: params.playerId,
    actorId: params.creatureId,
    kind: 'Attack',
    sourceCreatureId: params.creatureId,
    target,
  };
};
