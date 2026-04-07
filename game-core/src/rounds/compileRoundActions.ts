import { CardRegistry } from '../cards/CardRegistry';
import {
  CardDefinition,
  CompiledRoundAction,
  EffectType,
  GameState,
  ResolutionLayer,
  ResolutionRole,
  RoundActionIntent,
} from '../types';

const hasAnyEffect = (definition: CardDefinition, effectTypes: EffectType[]): boolean =>
  definition.effects.some((effect) => effectTypes.includes(effect.type));

const getResolutionLayerFromRole = (role: ResolutionRole): ResolutionLayer => {
  switch (role) {
    case 'summon':
      return 'summon';
    case 'defensive_spell':
      return 'defensive_spells';
    case 'offensive_spell':
      return 'offensive_control_spells';
    case 'control_spell':
      return 'other_modifiers';
    case 'support_spell':
      return 'other_modifiers';
    case 'modifier':
      return 'other_modifiers';
    case 'artifact':
      return 'other_modifiers';
  }
};

export const getResolutionLayerForCardDefinition = (definition: CardDefinition): ResolutionLayer => {
  if (definition.type === 'creature') {
    return 'summon';
  }

  if (definition.resolutionRole) {
    return getResolutionLayerFromRole(definition.resolutionRole);
  }

  if (hasAnyEffect(definition, ['ShieldEffect', 'HealEffect'])) {
    return 'defensive_spells';
  }

  if (
    hasAnyEffect(definition, ['BuffEffect']) &&
    (definition.targetType === 'self' || definition.targetType === 'allyCharacter')
  ) {
    return 'defensive_modifiers';
  }

  if (hasAnyEffect(definition, ['BuffEffect', 'DebuffEffect'])) {
    return 'other_modifiers';
  }

  if (hasAnyEffect(definition, ['DamageEffect'])) {
    return 'offensive_control_spells';
  }

  if (definition.targetType === 'self' || definition.targetType === 'allyCharacter') {
    return 'defensive_modifiers';
  }

  return 'offensive_control_spells';
};

export const getResolutionLayerForIntent = (
  intent: RoundActionIntent,
  state: Pick<GameState, 'cardInstances' | 'creatures'>,
  cards: CardRegistry,
): ResolutionLayer => {
  switch (intent.kind) {
    case 'Summon':
      return 'summon';
    case 'Evade':
      return 'defensive_modifiers';
    case 'Attack':
      return 'attacks';
    case 'CastSpell':
    case 'PlayCard': {
      const instance = state.cardInstances[intent.cardInstanceId];
      const definition = instance ? cards.get(instance.definitionId) : undefined;
      if (!definition) {
        return 'other_modifiers';
      }
      return getResolutionLayerForCardDefinition(definition);
    }
  }
};

export const getPriorityForIntent = (
  intent: RoundActionIntent,
  state: Pick<GameState, 'cardInstances' | 'creatures'>,
  cards: CardRegistry,
): number => {
  if (intent.priority !== undefined) {
    return intent.priority;
  }

  if (intent.kind === 'Attack') {
    return state.creatures[intent.sourceCreatureId]?.speed ?? 0;
  }

  if (
    intent.kind === 'Summon' ||
    intent.kind === 'CastSpell' ||
    intent.kind === 'PlayCard'
  ) {
    const instance = state.cardInstances[intent.cardInstanceId];
    const definition = instance ? cards.get(instance.definitionId) : undefined;
    return definition?.speed ?? 0;
  }

  return 0;
};

const getSpeedBonusForCardDefinition = (definition: CardDefinition): number =>
  definition.effects.reduce((sum, effect) => (
    effect.type === 'NextSpellSpeedBoostEffect'
      ? sum + Number(effect.value ?? 0)
      : sum
  ), 0);

const buildPriorityOverrides = (
  intents: RoundActionIntent[],
  state: Pick<GameState, 'cardInstances' | 'creatures'>,
  cards: CardRegistry,
): Map<string, number> => {
  const overrides = new Map<string, number>();
  const pendingSpeedBonusByPlayer = new Map<string, number>();

  const sortedIntents = [...intents].sort((left, right) => {
    const playerDelta = left.playerId.localeCompare(right.playerId);
    if (playerDelta !== 0) {
      return playerDelta;
    }

    const queueDelta = left.queueIndex - right.queueIndex;
    if (queueDelta !== 0) {
      return queueDelta;
    }

    return left.intentId.localeCompare(right.intentId);
  });

  sortedIntents.forEach((intent) => {
    const basePriority = getPriorityForIntent(intent, state, cards);
    if (intent.kind !== 'Summon' && intent.kind !== 'CastSpell' && intent.kind !== 'PlayCard') {
      overrides.set(intent.intentId, basePriority);
      return;
    }

    const instance = state.cardInstances[intent.cardInstanceId];
    const definition = instance ? cards.get(instance.definitionId) : undefined;
    if (!definition) {
      overrides.set(intent.intentId, basePriority);
      return;
    }

    if (intent.kind === 'CastSpell') {
      const pendingBonus = Number(pendingSpeedBonusByPlayer.get(intent.playerId) ?? 0);
      overrides.set(intent.intentId, basePriority + pendingBonus);
      pendingSpeedBonusByPlayer.set(intent.playerId, 0);
      return;
    }

    overrides.set(intent.intentId, basePriority);

    const speedBonus = getSpeedBonusForCardDefinition(definition);
    if (speedBonus > 0) {
      pendingSpeedBonusByPlayer.set(
        intent.playerId,
        Number(pendingSpeedBonusByPlayer.get(intent.playerId) ?? 0) + speedBonus,
      );
    }
  });

  return overrides;
};

export const compileRoundActions = (
  intents: RoundActionIntent[],
  state: Pick<GameState, 'cardInstances' | 'creatures'>,
  cards: CardRegistry,
  roundInitiativePlayerId: string,
): CompiledRoundAction[] => {
  const priorityOverrides = buildPriorityOverrides(intents, state, cards);

  return intents.map((intent) => ({
    intent,
    layer: getResolutionLayerForIntent(intent, state, cards),
    priority: priorityOverrides.get(intent.intentId) ?? getPriorityForIntent(intent, state, cards),
    roundInitiativePlayerId,
  }));
};
