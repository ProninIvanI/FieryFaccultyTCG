import { CardRegistry } from '../cards/CardRegistry';
import { compileRoundActions } from '../rounds/compileRoundActions';
import { getResolutionLayerForCardDefinition } from '../rounds/compileRoundActions';
import { RESOLUTION_LAYER_ORDER, sortRoundActions } from '../rounds/sortRoundActions';
import {
  BoardItem,
  BoardItemId,
  GameState,
  PlayerRibbonEntry,
  PlayerBoardModel,
  PlayerId,
  PlayerRoundDraft,
  PublicBoardItemRibbonEntry,
  RoundAction,
  RoundActionIntent,
  RoundResolutionResult,
  ResolutionLayer,
} from '../types';

export const toCreatureBoardItemId = (creatureId: string): BoardItemId => `creature:${creatureId}`;
export const toEffectBoardItemId = (effectId: string): BoardItemId => `effect:${effectId}`;

const compareNumbers = (left?: number, right?: number): number => {
  if (left === undefined && right === undefined) {
    return 0;
  }
  if (left === undefined) {
    return 1;
  }
  if (right === undefined) {
    return -1;
  }
  return left - right;
};

const getLayerOrder = (layer: ResolutionLayer): number => {
  const index = RESOLUTION_LAYER_ORDER.indexOf(layer);
  return index >= 0 ? index : RESOLUTION_LAYER_ORDER.length;
};

const sortBoardItems = (items: BoardItem[]): BoardItem[] =>
  [...items].sort((left, right) => {
    const roundDelta = compareNumbers(left.createdAtRound, right.createdAtRound);
    if (roundDelta !== 0) {
      return roundDelta;
    }

    const turnDelta = compareNumbers(left.createdAtTurn, right.createdAtTurn);
    if (turnDelta !== 0) {
      return turnDelta;
    }

    return left.id.localeCompare(right.id);
  });

const getFallbackBoardItemLayer = (item: Pick<BoardItem, 'subtype'>): ResolutionLayer =>
  item.subtype === 'creature' ? 'summon' : 'other_modifiers';

const getFallbackEffectLayer = (effectType: string): ResolutionLayer => {
  switch (effectType) {
    case 'ShieldEffect':
    case 'HealEffect':
      return 'defensive_spells';
    case 'DamageEffect':
      return 'offensive_control_spells';
    case 'BuffEffect':
      return 'defensive_modifiers';
    case 'DebuffEffect':
      return 'other_modifiers';
    case 'SummonEffect':
      return 'summon';
    default:
      return 'other_modifiers';
  }
};

const resolveBoardItemLayer = (
  cards: CardRegistry,
  item: Pick<BoardItem, 'definitionId' | 'subtype'>,
  effectType?: string,
): ResolutionLayer => {
  if (item.definitionId) {
    const definition = cards.get(item.definitionId);
    if (definition) {
      return getResolutionLayerForCardDefinition(definition);
    }
  }

  if (effectType) {
    return getFallbackEffectLayer(effectType);
  }

  return getFallbackBoardItemLayer(item);
};

const resolveRoundActionSource = (
  state: Pick<GameState, 'cardInstances' | 'creatures'>,
  intent: RoundActionIntent,
): RoundAction['source'] => {
  switch (intent.kind) {
    case 'Summon':
    case 'CastSpell':
    case 'PlayCard': {
      const instance = state.cardInstances[intent.cardInstanceId];
      return {
        type: 'card',
        cardInstanceId: intent.cardInstanceId,
        definitionId: instance?.definitionId,
      };
    }
    case 'Attack':
      return {
        type: 'boardItem',
        boardItemId: toCreatureBoardItemId(intent.sourceCreatureId),
      };
    case 'Evade':
      return state.creatures[String(intent.actorId)]
        ? {
            type: 'boardItem',
            boardItemId: toCreatureBoardItemId(String(intent.actorId)),
          }
        : {
            type: 'actor',
            actorId: intent.actorId,
          };
  }
};

const resolveAttachedBoardItemId = (
  action: RoundAction,
  boardItemsById: ReadonlyMap<BoardItemId, BoardItem>,
): BoardItemId | null => {
  if (action.source.type === 'boardItem') {
    return boardItemsById.has(action.source.boardItemId) ? action.source.boardItemId : null;
  }

  if (action.source.type === 'actor') {
    const actorBoardItemId = toCreatureBoardItemId(String(action.source.actorId));
    return boardItemsById.has(actorBoardItemId) ? actorBoardItemId : null;
  }

  return null;
};

export const buildPlayerRibbonEntries = (
  boardItems: BoardItem[],
  roundActions: RoundAction[],
): PlayerRibbonEntry[] => {
  const boardItemsById = new Map(boardItems.map((item) => [item.id, item] as const));
  const attachedActionIdsByBoardItemId = new Map<BoardItemId, string[]>();
  const detachedActions: RoundAction[] = [];

  roundActions.forEach((action) => {
    const attachedBoardItemId = resolveAttachedBoardItemId(action, boardItemsById);
    if (!attachedBoardItemId) {
      detachedActions.push(action);
      return;
    }

    const existing = attachedActionIdsByBoardItemId.get(attachedBoardItemId) ?? [];
    existing.push(action.id);
    attachedActionIdsByBoardItemId.set(attachedBoardItemId, existing);
  });

  const ribbonEntries = [
    ...boardItems.map((item) => ({
      id: `boardItem:${item.id}`,
      kind: 'boardItem' as const,
      orderIndex: -1,
      layer: item.placement.layer,
      boardItemId: item.id,
      attachedRoundActionIds: attachedActionIdsByBoardItemId.get(item.id) ?? [],
      sortPlacementOrderIndex: item.placement.orderIndex,
    })),
    ...detachedActions.map((action) => ({
      id: `roundAction:${action.id}`,
      kind: 'roundAction' as const,
      orderIndex: -1,
      layer: action.placement.layer,
      roundActionId: action.id,
      sortPlacementOrderIndex: action.placement.orderIndex,
    })),
  ].sort((left, right) => {
    const layerDelta = getLayerOrder(left.layer) - getLayerOrder(right.layer);
    if (layerDelta !== 0) {
      return layerDelta;
    }

    const orderDelta = left.sortPlacementOrderIndex - right.sortPlacementOrderIndex;
    if (orderDelta !== 0) {
      return orderDelta;
    }

    if (left.kind !== right.kind) {
      return left.kind === 'boardItem' ? -1 : 1;
    }

    return left.id.localeCompare(right.id);
  });

  return ribbonEntries.map((entry, orderIndex) => ({
    ...(entry.kind === 'boardItem'
      ? {
          id: entry.id,
          kind: entry.kind,
          orderIndex,
          layer: entry.layer,
          boardItemId: entry.boardItemId,
          attachedRoundActionIds: entry.attachedRoundActionIds,
        }
      : {
          id: entry.id,
          kind: entry.kind,
          orderIndex,
          layer: entry.layer,
          roundActionId: entry.roundActionId,
        }),
  }));
};

export const buildPublicRibbonEntries = (
  boardItems: BoardItem[],
): PublicBoardItemRibbonEntry[] =>
  buildPlayerRibbonEntries(boardItems, [])
    .filter((entry): entry is Extract<PlayerRibbonEntry, { kind: 'boardItem' }> => entry.kind === 'boardItem')
    .map((entry) => ({
      id: entry.id,
      kind: 'boardItem',
      orderIndex: entry.orderIndex,
      layer: entry.layer,
      boardItemId: entry.boardItemId,
    }));

export const buildBoardItems = (
  state: Pick<GameState, 'creatures' | 'activeEffects'>,
  cards: CardRegistry,
  playerId: PlayerId,
): BoardItem[] => {
  const creatureItems = Object.values(state.creatures)
    .filter((creature) => creature.ownerId === playerId)
    .map<BoardItem>((creature) => ({
      id: toCreatureBoardItemId(creature.creatureId),
      runtimeId: creature.creatureId,
      ownerId: creature.ownerId,
      controllerId: creature.ownerId,
      subtype: 'creature',
      lifetimeType: 'persistent',
      sourceCardInstanceId: creature.sourceCardInstanceId,
      definitionId: creature.definitionId,
      createdAtRound: creature.summonedAtRound,
      placement: {
        layer: resolveBoardItemLayer(cards, {
          subtype: 'creature',
          definitionId: creature.definitionId,
        }),
        orderIndex: -1,
        queueIndex: 0,
      },
      state: {
        hp: creature.hp,
        maxHp: creature.maxHp,
        attack: creature.attack,
        speed: creature.speed,
      },
    }));

  const effectItems = Object.values(state.activeEffects)
    .filter((effect) => effect.ownerId === playerId)
    .map<BoardItem>((effect) => ({
      id: toEffectBoardItemId(effect.effectId),
      runtimeId: effect.effectId,
      ownerId: effect.ownerId ?? playerId,
      controllerId: effect.ownerId ?? playerId,
      subtype: 'effect',
      lifetimeType: effect.duration !== undefined && effect.duration > 1 ? 'persistent' : 'temporary',
      sourceCardInstanceId: effect.sourceCardInstanceId,
      definitionId: effect.definitionId,
      createdAtTurn: effect.createdAtTurn,
      placement: {
        layer: resolveBoardItemLayer(
          cards,
          {
            subtype: 'effect',
            definitionId: effect.definitionId,
          },
          effect.type,
        ),
        orderIndex: -1,
        queueIndex: 0,
      },
      state: {
        duration: effect.duration,
      },
    }));

  return sortBoardItems([...creatureItems, ...effectItems]).map((item, orderIndex) => ({
    ...item,
    placement: {
      ...item.placement,
      orderIndex,
    },
  }));
};

export const buildRoundActions = (
  state: Pick<GameState, 'cardInstances' | 'creatures' | 'round'>,
  cards: CardRegistry,
  draft: PlayerRoundDraft,
  resolution?: RoundResolutionResult,
): RoundAction[] => {
  const resolutionByIntentId = new Map(
    (resolution?.roundNumber === draft.roundNumber ? resolution.orderedActions : []).map((entry) => [
      entry.intentId,
      entry,
    ]),
  );

  return sortRoundActions(
    compileRoundActions(
      draft.intents,
      state,
      cards,
      state.round.initiativePlayerId,
    ),
  ).map((compiledAction, orderIndex) => {
    const resolutionEntry = resolutionByIntentId.get(compiledAction.intent.intentId);
    const target =
      'target' in compiledAction.intent
        ? {
            targetId: compiledAction.intent.target.targetId,
            targetType: compiledAction.intent.target.targetType,
          }
        : undefined;

    return {
      id: compiledAction.intent.intentId,
      roundNumber: compiledAction.intent.roundNumber,
      playerId: compiledAction.intent.playerId,
      actorId: compiledAction.intent.actorId,
      kind: compiledAction.intent.kind,
      source: resolveRoundActionSource(state, compiledAction.intent),
      target,
      placement: {
        layer: compiledAction.layer,
        orderIndex,
        queueIndex: compiledAction.intent.queueIndex,
      },
      status: resolutionEntry?.status ?? (draft.locked ? 'locked' : 'draft'),
      reasonCode: resolutionEntry?.reasonCode,
      summary: resolutionEntry?.summary,
    };
  });
};

export const buildPlayerBoardModel = (
  state: Pick<GameState, 'activeEffects' | 'cardInstances' | 'creatures' | 'round'>,
  cards: CardRegistry,
  draft: PlayerRoundDraft,
  resolution?: RoundResolutionResult,
): PlayerBoardModel => {
  const boardItems = buildBoardItems(state, cards, draft.playerId);
  const roundActions = buildRoundActions(state, cards, draft, resolution);

  return {
    playerId: draft.playerId,
    boardItems,
    roundActions,
    ribbonEntries: buildPlayerRibbonEntries(boardItems, roundActions),
  };
};
