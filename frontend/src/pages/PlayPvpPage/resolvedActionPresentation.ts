import type { ResolvedRoundAction, RoundResolutionResult } from '@game-core/types';
import type { GameStateSnapshot } from '@/types';

export type ResolvedActionTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface ResolvedTimelineEntrySummary {
  order: number;
  action: ResolvedRoundAction;
  ownerLabel: string;
  title: string;
  subtitle: string;
  summary?: string;
  detailItems: string[];
}

interface ResolvedActionPresentationDeps {
  playerId: string;
  knownTargetLabelsById: ReadonlyMap<string, string>;
  cardNameByDefinitionId: ReadonlyMap<string, string>;
  getPlayerDisplayName: (candidatePlayerId?: string | null) => string;
  getResolvedBoardItemLabel: (boardItemId?: string | null, runtimeId?: string | null) => string | null;
  getResolvedCharacterLabel: (characterId?: string | null) => string | null;
}

interface ReplayLogEntrySummary {
  seq: number;
  type: 'action' | 'damage' | 'summon' | 'effect';
  payload: Record<string, unknown>;
}

const quoteLabel = (value: string): string => `«${value}»`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const getReplayLogEntries = (state: GameStateSnapshot | null): ReplayLogEntrySummary[] => {
  if (!state?.log || !Array.isArray(state.log)) {
    return [];
  }

  return state.log.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const seq = typeof entry.seq === 'number' ? entry.seq : null;
    const type = entry.type;
    const payload = isRecord(entry.payload) ? entry.payload : null;
    if (
      seq === null ||
      (type !== 'action' && type !== 'damage' && type !== 'summon' && type !== 'effect') ||
      !payload
    ) {
      return [];
    }

    return [{ seq, type, payload }];
  });
};

const doesLogActionMatchResolvedAction = (
  action: ResolvedRoundAction,
  logEntry: ReplayLogEntrySummary,
): boolean => {
  if (logEntry.type !== 'action') {
    return false;
  }

  const rawAction = logEntry.payload.action;
  if (!isRecord(rawAction) || rawAction.type !== action.kind) {
    return false;
  }

  if (typeof rawAction.actorId === 'string' && rawAction.actorId !== String(action.actorId)) {
    return false;
  }

  if (typeof rawAction.playerId === 'string' && rawAction.playerId !== action.playerId) {
    return false;
  }

  if ('cardInstanceId' in rawAction && typeof rawAction.cardInstanceId === 'string') {
    return rawAction.cardInstanceId === action.cardInstanceId;
  }

  if ('targetId' in rawAction && typeof rawAction.targetId === 'string' && action.target?.targetId) {
    return rawAction.targetId === action.target.targetId;
  }

  return true;
};

const normalizeReplayLabel = (value: string): string => value.replace(/^Маг\s+/u, '').trim();

const getReplayTargetState = (
  matchState: GameStateSnapshot | null,
  targetId: string,
): { hp?: number; maxHp?: number } | null => {
  const character = matchState?.characters?.[targetId];
  if (character) {
    return {
      hp: typeof character.hp === 'number' ? character.hp : undefined,
      maxHp: typeof character.maxHp === 'number' ? character.maxHp : undefined,
    };
  }

  const creature = matchState?.creatures?.[targetId];
  if (creature) {
    return {
      hp: typeof creature.hp === 'number' ? creature.hp : undefined,
      maxHp: typeof creature.maxHp === 'number' ? creature.maxHp : undefined,
    };
  }

  return null;
};

const getReplayImpactItems = (
  action: ResolvedRoundAction,
  events: ReplayLogEntrySummary[],
  matchState: GameStateSnapshot | null,
  knownTargetLabelsById: ReadonlyMap<string, string>,
): string[] => {
  const impactItems = events.flatMap((event) => {
    if (event.type === 'damage') {
      const amount = typeof event.payload.amount === 'number' ? event.payload.amount : null;
      const targetId = typeof event.payload.targetId === 'string' ? event.payload.targetId : null;
      const targetLabel = normalizeReplayLabel(
        targetId ? knownTargetLabelsById.get(targetId) ?? targetId : 'Неизвестная цель',
      );
      const targetState = targetId ? getReplayTargetState(matchState, targetId) : null;

      if (amount !== null && targetState?.hp !== undefined) {
        return [`${targetLabel}: ${targetState.hp + amount} -> ${targetState.hp} HP`];
      }

      if (amount !== null) {
        return [`-${amount} HP ${targetLabel}`];
      }

      return [`Урон по цели ${targetLabel}`];
    }

    if (event.type === 'summon') {
      const creatureId = typeof event.payload.creatureId === 'string' ? event.payload.creatureId : null;
      const creatureLabel = normalizeReplayLabel(
        creatureId ? knownTargetLabelsById.get(creatureId) ?? creatureId : 'Существо',
      );
      return [`На поле: ${creatureLabel}`];
    }

    if (event.type === 'effect') {
      if (action.kind === 'Evade') {
        return ['Уклонение подготовлено'];
      }

      if (action.kind === 'Summon') {
        return ['Призыв завершён'];
      }

      if (action.kind === 'CastSpell' || action.kind === 'PlayCard') {
        return ['Эффект карты применён'];
      }
    }

    return [];
  });

  return [...new Set(impactItems)];
};

const getReplaySummary = (summary: string | undefined): string | undefined => {
  const trimmedSummary = summary?.trim();
  if (!trimmedSummary) {
    return undefined;
  }

  const loweredSummary = trimmedSummary.toLowerCase();
  if (
    loweredSummary.includes('resolved in layer') ||
    loweredSummary.includes('offensive_') ||
    loweredSummary.includes('defensive_') ||
    loweredSummary.includes('modifier') ||
    loweredSummary.includes('control_spells')
  ) {
    return undefined;
  }

  return trimmedSummary;
};

const getResolvedActionSourceLabel = (
  deps: ResolvedActionPresentationDeps,
  action: ResolvedRoundAction,
): { cardName?: string; sourceLabel: string | null } => {
  const cardName =
    (action.source.type === 'card' && action.source.definitionId
      ? deps.cardNameByDefinitionId.get(action.source.definitionId)
      : undefined) ?? (action.definitionId ? deps.cardNameByDefinitionId.get(action.definitionId) : undefined);

  const sourceLabel =
    action.source.type === 'boardItem'
      ? deps.getResolvedBoardItemLabel(action.source.boardItemId, action.actorId)
      : action.source.type === 'actor'
        ? deps.getResolvedCharacterLabel(action.source.actorId) ?? deps.getResolvedBoardItemLabel(null, action.source.actorId)
        : cardName ?? null;

  return { cardName, sourceLabel };
};

export const getResolvedActionTitle = (
  deps: ResolvedActionPresentationDeps,
  action: ResolvedRoundAction,
): string => {
  const { cardName, sourceLabel } = getResolvedActionSourceLabel(deps, action);
  const fallbackLabel = sourceLabel ?? action.cardInstanceId ?? action.intentId;

  switch (action.kind) {
    case 'Summon':
      return `Призыв: ${cardName ?? fallbackLabel}`;
    case 'CastSpell':
      return `Заклинание: ${cardName ?? fallbackLabel}`;
    case 'PlayCard':
      return `Розыгрыш: ${cardName ?? fallbackLabel}`;
    case 'Attack':
      return `Атака: ${sourceLabel ?? action.actorId}`;
    case 'Evade':
      return sourceLabel ? `Уклонение: ${sourceLabel}` : 'Уклонение';
  }
};

export const getResolvedActionSentence = (
  deps: ResolvedActionPresentationDeps,
  action: ResolvedRoundAction,
): string => {
  const { cardName, sourceLabel } = getResolvedActionSourceLabel(deps, action);
  const fallbackLabel = sourceLabel ?? action.cardInstanceId ?? action.intentId;

  switch (action.kind) {
    case 'Summon':
      return `призвал существо ${quoteLabel(cardName ?? fallbackLabel)}`;
    case 'CastSpell':
      return `разыграл заклинание ${quoteLabel(cardName ?? fallbackLabel)}`;
    case 'PlayCard':
      return `разыграл карту ${quoteLabel(cardName ?? fallbackLabel)}`;
    case 'Attack':
      return sourceLabel ? `атаковал ${quoteLabel(sourceLabel)}` : 'выполнил атаку';
    case 'Evade':
      return sourceLabel ? `подготовил уклонение для ${quoteLabel(sourceLabel)}` : 'подготовил уклонение';
  }
};

export const getResolvedActionTargetLabel = (
  deps: ResolvedActionPresentationDeps,
  action: ResolvedRoundAction,
): string => {
  if (!action.target?.targetType) {
    return action.kind === 'Summon' || action.kind === 'Evade' ? 'Без цели' : 'Цель уточняется';
  }

  if (!action.target.targetId) {
    return 'Цель уточняется';
  }

  const targetLabel = deps.knownTargetLabelsById.get(action.target.targetId);
  return `Цель: ${normalizeReplayLabel(targetLabel ?? action.target.targetId)}`;
};

export const getResolvedActionActorLabel = (
  deps: ResolvedActionPresentationDeps,
  action: ResolvedRoundAction,
): string => {
  if (action.playerId === deps.playerId) {
    return 'Ты';
  }

  const ownerName = deps.getPlayerDisplayName(action.playerId);
  if (ownerName && ownerName !== action.playerId) {
    return ownerName;
  }

  return 'Соперник';
};

export const getResolvedActionOutcomeLabel = (action: ResolvedRoundAction): string => {
  if (action.status === 'resolved') {
    return 'Сработало';
  }

  switch (action.reasonCode) {
    case 'target_invalidated':
      return 'Сорвалось: цель исчезла';
    case 'invalid_intent':
      return 'Сорвалось: действие недоступно';
    case 'card_unavailable':
    case 'card_definition_missing':
    case 'attack_source_unavailable':
    case 'actor_unavailable':
    case 'command_unavailable':
      return 'Сорвалось: источник недоступен';
    case 'summoning_sickness':
      return 'Сорвалось: существо только призвано';
    case 'evade_disabled':
      return 'Уклонение заблокировано';
    case 'action_skipped':
      return 'Действие пропущено';
    case 'interrupted':
      return 'Действие прервано';
    default:
      return 'Сорвалось';
  }
};

export const getResolvedActionTone = (action: ResolvedRoundAction): ResolvedActionTone => {
  if (action.status === 'resolved') {
    if (action.kind === 'Attack' || action.kind === 'CastSpell') {
      return 'success';
    }

    return 'neutral';
  }

  switch (action.reasonCode) {
    case 'evade_disabled':
    case 'action_skipped':
      return 'warning';
    default:
      return 'danger';
  }
};

export const buildResolvedTimelineEntries = (
  deps: ResolvedActionPresentationDeps,
  lastResolvedRound: RoundResolutionResult | null,
  matchState: GameStateSnapshot | null,
): ResolvedTimelineEntrySummary[] => {
  if (!lastResolvedRound) {
    return [];
  }

  const replayLogEntries = getReplayLogEntries(matchState);
  const matchedAnchors: Array<{ actionIndex: number; logIndex: number }> = [];
  let cursor = 0;

  lastResolvedRound.orderedActions.forEach((action, actionIndex) => {
    if (action.status !== 'resolved') {
      return;
    }

    for (let index = cursor; index < replayLogEntries.length; index += 1) {
      if (!doesLogActionMatchResolvedAction(action, replayLogEntries[index])) {
        continue;
      }

      matchedAnchors.push({ actionIndex, logIndex: index });
      cursor = index + 1;
      break;
    }
  });

  const impactItemsByActionIndex = new Map<number, string[]>();
  matchedAnchors.forEach((anchor, index) => {
    const nextAnchorIndex = matchedAnchors[index + 1]?.logIndex ?? replayLogEntries.length;
    const relatedEvents = replayLogEntries.slice(anchor.logIndex + 1, nextAnchorIndex);
    const items = getReplayImpactItems(
      lastResolvedRound.orderedActions[anchor.actionIndex],
      relatedEvents,
      matchState,
      deps.knownTargetLabelsById,
    );
    if (items.length > 0) {
      impactItemsByActionIndex.set(anchor.actionIndex, items);
    }
  });

  return lastResolvedRound.orderedActions.map((action, index) => ({
    order: action.orderIndex + 1,
    action,
    ownerLabel: action.playerId === deps.playerId ? 'Ты' : deps.getPlayerDisplayName(action.playerId),
    title: getResolvedActionTitle(deps, action),
    subtitle: getResolvedActionTargetLabel(deps, action),
    summary: getReplaySummary(action.summary),
    detailItems: impactItemsByActionIndex.get(index) ?? [],
  }));
};
