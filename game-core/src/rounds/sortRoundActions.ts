import { CompiledRoundAction, ResolutionLayer } from '../types';

export const RESOLUTION_LAYER_ORDER: ResolutionLayer[] = [
  'summon',
  'defensive_modifiers',
  'defensive_spells',
  'other_modifiers',
  'offensive_control_spells',
  'attacks',
  'cleanup_end_of_round',
];

const getLayerOrder = (layer: ResolutionLayer): number => {
  const index = RESOLUTION_LAYER_ORDER.indexOf(layer);
  return index >= 0 ? index : RESOLUTION_LAYER_ORDER.length;
};

const compareInitiative = (left: CompiledRoundAction, right: CompiledRoundAction): number => {
  const leftHasInitiative = left.intent.playerId === left.roundInitiativePlayerId;
  const rightHasInitiative = right.intent.playerId === right.roundInitiativePlayerId;
  if (leftHasInitiative === rightHasInitiative) {
    return 0;
  }
  return leftHasInitiative ? -1 : 1;
};

export const sortRoundActions = (actions: CompiledRoundAction[]): CompiledRoundAction[] =>
  [...actions].sort((left, right) => {
    const layerDelta = getLayerOrder(left.layer) - getLayerOrder(right.layer);
    if (layerDelta !== 0) {
      return layerDelta;
    }

    const priorityDelta = right.priority - left.priority;
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    const queueDelta = left.intent.queueIndex - right.intent.queueIndex;
    if (queueDelta !== 0) {
      return queueDelta;
    }

    const initiativeDelta = compareInitiative(left, right);
    if (initiativeDelta !== 0) {
      return initiativeDelta;
    }

    const actorDelta = left.intent.actorId.localeCompare(right.intent.actorId);
    if (actorDelta !== 0) {
      return actorDelta;
    }

    return left.intent.intentId.localeCompare(right.intent.intentId);
  });
