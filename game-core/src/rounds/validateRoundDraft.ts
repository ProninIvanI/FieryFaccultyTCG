import { CardRegistry } from '../cards/CardRegistry';
import {
  GameState,
  PlayerRoundDraft,
  RoundActionIntent,
  RoundDraftValidationError,
  RoundDraftValidationResult,
} from '../types';
import {
  MAX_CREATURES_PER_PLAYER,
  validateCardLocation,
  validateCardOwnership,
  validateTarget,
  validateTargetType,
} from '../validation/validators';

const pushError = (
  errors: RoundDraftValidationError[],
  code: string,
  message: string,
  intentId?: string,
): void => {
  errors.push(intentId ? { code, message, intentId } : { code, message });
};

const getActionPointCost = (intent: RoundActionIntent): number => {
  switch (intent.kind) {
    case 'Attack':
      return 0;
    case 'Summon':
    case 'CastSpell':
    case 'PlayCard':
    case 'Evade':
      return 1;
  }
};

const validateActorOwnership = (
  state: GameState,
  playerId: string,
  actorId: string,
  intentId: string,
  errors: RoundDraftValidationError[],
): void => {
  const character = state.characters[actorId];
  const creature = state.creatures[actorId];
  const ownerId = character?.ownerId ?? creature?.ownerId;
  if (!ownerId || ownerId !== playerId) {
    pushError(errors, 'actor_ownership', 'Actor does not belong to player', intentId);
  }
};

const validateCardIntent = (
  state: GameState,
  cards: CardRegistry,
  playerId: string,
  intent: Extract<RoundActionIntent, { kind: 'Summon' | 'CastSpell' | 'PlayCard' }>,
  errors: RoundDraftValidationError[],
): number => {
  validateCardOwnership(state, playerId, intent.cardInstanceId).forEach((message) =>
    pushError(errors, 'card_ownership', message, intent.intentId),
  );
  validateCardLocation(state, intent.cardInstanceId, ['hand']).forEach((message) =>
    pushError(errors, 'card_location', message, intent.intentId),
  );

  const instance = state.cardInstances[intent.cardInstanceId];
  if (!instance) {
    return 0;
  }

  const definition = cards.get(instance.definitionId);
  if (!definition) {
    pushError(errors, 'card_definition', 'Card definition not found', intent.intentId);
    return 0;
  }

  if (intent.kind === 'Summon' && definition.type !== 'creature') {
    pushError(errors, 'card_kind', 'Summon intent requires creature card', intent.intentId);
  }

  if (intent.kind === 'CastSpell' && definition.type !== 'spell') {
    pushError(errors, 'card_kind', 'CastSpell intent requires spell card', intent.intentId);
  }

  if (intent.kind === 'PlayCard' && definition.type === 'creature') {
    pushError(errors, 'card_kind', 'PlayCard intent cannot use creature card', intent.intentId);
  }

  if (intent.kind === 'CastSpell' || intent.kind === 'PlayCard') {
    validateTargetType(
      state,
      String(intent.actorId),
      intent.target.targetId,
      definition.targetType,
    ).forEach((message) => pushError(errors, 'target_type', message, intent.intentId));
  }

  return definition.manaCost;
};

const getManaDiscountForCardDefinition = (definition: { effects: Array<{ type: string; value?: number }> }): number =>
  definition.effects.reduce((sum, effect) => (
    effect.type === 'NextSpellManaDiscountEffect'
      ? sum + Number(effect.value ?? 0)
      : sum
  ), 0);

export const validateRoundDraft = (
  state: GameState,
  cards: CardRegistry,
  draft: PlayerRoundDraft,
): RoundDraftValidationResult => {
  const errors: RoundDraftValidationError[] = [];
  const player = state.players[draft.playerId];
  if (!player) {
    return {
      ok: false,
      errors: [{ code: 'player_not_found', message: 'Player not found for round draft' }],
    };
  }

  if (draft.roundNumber !== state.round.number) {
    pushError(
      errors,
      'round_number',
      `Round draft number ${draft.roundNumber} does not match current round ${state.round.number}`,
    );
  }

  const seenQueueIndexes = new Set<number>();
  const existingCreatureCount = Object.values(state.creatures).filter(
    (creature) => creature.ownerId === draft.playerId,
  ).length;
  let pendingSummons = 0;
  let manaCost = 0;
  let actionPointCost = 0;
  let pendingSpellManaDiscount = 0;

  [...draft.intents]
    .sort((left, right) => {
      const queueDelta = left.queueIndex - right.queueIndex;
      if (queueDelta !== 0) {
        return queueDelta;
      }
      return left.intentId.localeCompare(right.intentId);
    })
    .forEach((intent) => {
    if (intent.playerId !== draft.playerId) {
      pushError(errors, 'intent_player', 'Intent playerId does not match draft owner', intent.intentId);
    }

    if (intent.roundNumber !== draft.roundNumber) {
      pushError(errors, 'intent_round', 'Intent roundNumber does not match draft', intent.intentId);
    }

    if (!Number.isInteger(intent.queueIndex) || intent.queueIndex < 0) {
      pushError(errors, 'queue_index', 'Intent queueIndex must be a non-negative integer', intent.intentId);
    } else if (seenQueueIndexes.has(intent.queueIndex)) {
      pushError(errors, 'queue_index', 'Intent queueIndex must be unique within draft', intent.intentId);
    } else {
      seenQueueIndexes.add(intent.queueIndex);
    }

    validateActorOwnership(state, draft.playerId, String(intent.actorId), intent.intentId, errors);
    actionPointCost += getActionPointCost(intent);

    if (intent.kind === 'Summon' || intent.kind === 'CastSpell' || intent.kind === 'PlayCard') {
      const baseManaCost = validateCardIntent(state, cards, draft.playerId, intent, errors);
      const instance = state.cardInstances[intent.cardInstanceId];
      const definition = instance ? cards.get(instance.definitionId) : undefined;

      if (intent.kind === 'CastSpell') {
        manaCost += Math.max(0, baseManaCost - pendingSpellManaDiscount);
        pendingSpellManaDiscount = 0;
      } else {
        manaCost += baseManaCost;
        if (definition) {
          pendingSpellManaDiscount += getManaDiscountForCardDefinition(definition);
        }
      }
    }

    if (intent.kind === 'Summon') {
      pendingSummons += 1;
      if (existingCreatureCount + pendingSummons > MAX_CREATURES_PER_PLAYER) {
        pushError(
          errors,
          'creature_limit',
          `Creature limit reached (${MAX_CREATURES_PER_PLAYER})`,
          intent.intentId,
        );
      }
    }

    if (intent.kind === 'Attack') {
      const sourceCreature = state.creatures[intent.sourceCreatureId];
      if (!sourceCreature || sourceCreature.ownerId !== draft.playerId) {
        pushError(errors, 'attack_source', 'Attack source creature does not belong to player', intent.intentId);
      } else if (sourceCreature.summonedAtRound === draft.roundNumber) {
        pushError(errors, 'summoning_sickness', 'Creature has summoning sickness this round', intent.intentId);
      }

      validateTarget(state, intent.target.targetId).forEach((message) =>
        pushError(errors, 'attack_target', message, intent.intentId),
      );
    }
  });

  if (manaCost > player.mana) {
    pushError(errors, 'mana_budget', 'Round draft exceeds available mana budget');
  }

  if (actionPointCost > player.actionPoints) {
    pushError(errors, 'action_budget', 'Round draft exceeds available action budget');
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true };
};
