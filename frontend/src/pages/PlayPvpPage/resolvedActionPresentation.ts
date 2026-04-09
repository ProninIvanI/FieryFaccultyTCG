import type { ResolvedRoundAction, RoundResolutionResult } from '@game-core/types';
import { getTargetTypeLabel } from '@game-core/rounds/presentation';

export type ResolvedActionTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface ResolvedTimelineEntrySummary {
  order: number;
  action: ResolvedRoundAction;
  ownerLabel: string;
  title: string;
  subtitle: string;
}

interface ResolvedActionPresentationDeps {
  playerId: string;
  knownTargetLabelsById: ReadonlyMap<string, string>;
  cardNameByDefinitionId: ReadonlyMap<string, string>;
  getPlayerDisplayName: (candidatePlayerId?: string | null) => string;
  getResolvedBoardItemLabel: (boardItemId?: string | null, runtimeId?: string | null) => string | null;
  getResolvedCharacterLabel: (characterId?: string | null) => string | null;
}

const quoteLabel = (value: string): string => `«${value}»`;

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
    return action.kind === 'Summon' || action.kind === 'Evade' ? 'Цель не требуется' : 'Цель не указана';
  }

  if (!action.target.targetId) {
    return 'Цель уточняется';
  }

  const targetLabel = deps.knownTargetLabelsById.get(action.target.targetId);
  return `${getTargetTypeLabel(action.target.targetType)}: ${targetLabel ?? action.target.targetId}`;
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
): ResolvedTimelineEntrySummary[] =>
  !lastResolvedRound
    ? []
    : lastResolvedRound.orderedActions.map((action) => ({
        order: action.orderIndex + 1,
        action,
        ownerLabel: action.playerId === deps.playerId ? 'Ты' : `Игрок ${deps.getPlayerDisplayName(action.playerId)}`,
        title: getResolvedActionTitle(deps, action),
        subtitle: getResolvedActionTargetLabel(deps, action),
      }));
