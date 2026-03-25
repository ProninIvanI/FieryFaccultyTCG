import { CardRegistry } from '../cards/CardRegistry';
import {
  CardDefinition,
  CompiledRoundAction,
  EffectType,
  GameState,
  ResolutionLayer,
  RoundActionIntent,
} from '../types';

const hasAnyEffect = (definition: CardDefinition, effectTypes: EffectType[]): boolean =>
  definition.effects.some((effect) => effectTypes.includes(effect.type));

const inferLayerFromCard = (
  intent: Extract<RoundActionIntent, { kind: 'CastSpell' | 'PlayCard' }>,
  definition: CardDefinition,
): ResolutionLayer => {
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

  if (intent.target.targetType === 'self' || intent.target.targetType === 'allyCharacter') {
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
      return inferLayerFromCard(intent, definition);
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

export const compileRoundActions = (
  intents: RoundActionIntent[],
  state: Pick<GameState, 'cardInstances' | 'creatures'>,
  cards: CardRegistry,
  roundInitiativePlayerId: string,
): CompiledRoundAction[] =>
  intents.map((intent) => ({
    intent,
    layer: getResolutionLayerForIntent(intent, state, cards),
    priority: getPriorityForIntent(intent, state, cards),
    roundInitiativePlayerId,
  }));
