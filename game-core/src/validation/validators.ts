import { Action, CardLocation, GameState, PhaseType } from '../types';

export const MAX_CREATURES_PER_PLAYER = 2;

export const validatePhase = (state: GameState, allowed: PhaseType[]): string[] => {
  if (!allowed.includes(state.phase.current)) {
    return [`Invalid phase: ${state.phase.current}`];
  }
  return [];
};

export const validateOwnership = (state: GameState, playerId: string, actorId: string): string[] => {
  const actor = state.characters[actorId];
  if (!actor || actor.ownerId !== playerId) {
    return ['Actor does not belong to player'];
  }
  return [];
};

export const validateActivePlayer = (state: GameState, playerId: string): string[] => {
  if (state.turn.activePlayerId !== playerId) {
    return ['Only active player can act'];
  }
  return [];
};

export const validateActionLimit = (state: GameState, playerId: string): string[] => {
  const player = state.players[playerId];
  if (!player || player.actionPoints <= 0) {
    return ['No action points left'];
  }
  return [];
};

export const validateMana = (state: GameState, playerId: string, cost: number): string[] => {
  const player = state.players[playerId];
  if (!player || player.mana < cost) {
    return ['Not enough mana'];
  }
  return [];
};

export const validateCardOwnership = (
  state: GameState,
  playerId: string,
  cardInstanceId: string
): string[] => {
  const instance = state.cardInstances[cardInstanceId];
  if (!instance) {
    return ['Card instance not found'];
  }
  if (instance.ownerId !== playerId) {
    return ['Card does not belong to player'];
  }
  return [];
};

export const validateCardLocation = (
  state: GameState,
  cardInstanceId: string,
  allowed: CardLocation[]
): string[] => {
  const instance = state.cardInstances[cardInstanceId];
  if (!instance) {
    return ['Card instance not found'];
  }
  if (!allowed.includes(instance.location)) {
    return [`Invalid card location: ${instance.location}`];
  }
  return [];
};

export const validateTarget = (state: Pick<GameState, 'characters' | 'creatures'>, targetId?: string): string[] => {
  if (!targetId) {
    return ['Target is required'];
  }
  const isCharacter = Boolean(state.characters[targetId]);
  const isCreature = Boolean(state.creatures[targetId]);
  if (!isCharacter && !isCreature) {
    return ['Target not found'];
  }
  return [];
};

export const validateTargetType = (
  state: Pick<GameState, 'characters' | 'creatures'>,
  actorId: string,
  targetId: string | undefined,
  targetType: string
): string[] => {
  if (!targetId) {
    return ['Target is required'];
  }
  const actor = state.characters[actorId];
  if (!actor) {
    return ['Actor not found'];
  }
  const targetCharacter = state.characters[targetId];
  const targetCreature = state.creatures[targetId];
  const targetOwner = targetCharacter?.ownerId ?? targetCreature?.ownerId;

  switch (targetType) {
    case 'self':
      return targetId === actorId ? [] : ['Target must be self'];
    case 'allyCharacter':
      return targetCharacter && targetOwner === actor.ownerId ? [] : ['Target must be ally character'];
    case 'enemyCharacter':
      return targetCharacter && targetOwner !== actor.ownerId ? [] : ['Target must be enemy character'];
    case 'enemyAny':
      return (targetCharacter || targetCreature) && targetOwner !== actor.ownerId ? [] : ['Target must be enemy'];
    case 'creature':
      return targetCreature ? [] : ['Target must be creature'];
    case 'any':
      return [];
    default:
      return ['Unknown target type'];
  }
};

export const validateCreatureBoardLimit = (state: GameState, playerId: string): string[] => {
  const creatureCount = Object.values(state.creatures).filter((creature) => creature.ownerId === playerId).length;
  if (creatureCount >= MAX_CREATURES_PER_PLAYER) {
    return [`Creature limit reached (${MAX_CREATURES_PER_PLAYER})`];
  }
  return [];
};

export const validateActionBase = (action: Action, state: GameState): string[] => {
  const errors: string[] = [];
  errors.push(...validateOwnership(state, action.playerId, action.actorId));
  errors.push(...validateActivePlayer(state, action.playerId));
  return errors;
};

export const validateCanEvade = (
  state: Pick<GameState, 'characters' | 'turn'>,
  actorId: string,
): string[] => {
  const character = state.characters[actorId];
  if (!character) {
    return ['Actor not found'];
  }

  if (
    typeof character.cannotEvadeUntilTurn === 'number' &&
    state.turn.number <= character.cannotEvadeUntilTurn
  ) {
    return ['Actor cannot evade'];
  }

  return [];
};
