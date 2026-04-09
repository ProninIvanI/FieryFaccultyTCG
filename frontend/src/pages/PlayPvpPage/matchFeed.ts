import type { ResolvedRoundAction, RoundResolutionResult } from '@game-core/types';
import type { GameStateSnapshot } from '@/types';

export interface MatchFeedEntrySummary {
  id: string;
  actorLabel: string;
  actionLabel: string;
  targetLabel?: string;
  outcomeLabel: string;
  detailText?: string;
  detailItems?: string[];
  tone: 'neutral' | 'success' | 'warning' | 'danger';
}

export interface MatchFeedRoundSummary {
  roundNumber: number;
  title: string;
  subtitle: string;
  entries: MatchFeedEntrySummary[];
}

interface MatchLogEntrySummary {
  seq: number;
  type: 'action' | 'damage' | 'summon' | 'effect';
  payload: Record<string, unknown>;
}

interface MatchFeedBuilderOptions {
  matchState: GameStateSnapshot | null;
  resolvedRoundHistory: RoundResolutionResult[];
  knownTargetLabelsById: ReadonlyMap<string, string>;
  getResolvedActionActorLabel: (action: ResolvedRoundAction) => string;
  getResolvedActionSentence: (action: ResolvedRoundAction) => string;
  getResolvedActionTargetLabel: (action: ResolvedRoundAction) => string;
  getResolvedActionOutcomeLabel: (action: ResolvedRoundAction) => string;
  getResolvedActionTone: (action: ResolvedRoundAction) => MatchFeedEntrySummary['tone'];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const getMatchLogEntries = (state: GameStateSnapshot | null): MatchLogEntrySummary[] => {
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
  logEntry: MatchLogEntrySummary,
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

const getMatchFeedDetailItems = (
  action: ResolvedRoundAction,
  events: MatchLogEntrySummary[],
  matchState: GameStateSnapshot | null,
  knownTargetLabelsById: ReadonlyMap<string, string>,
): string[] => {
  return events.flatMap((event) => {
    if (event.type === 'damage') {
      const amount = typeof event.payload.amount === 'number' ? event.payload.amount : null;
      const targetId = typeof event.payload.targetId === 'string' ? event.payload.targetId : null;
      const targetLabel = targetId ? knownTargetLabelsById.get(targetId) ?? targetId : 'неизвестная цель';
      const targetKind = targetId
        ? matchState?.characters?.[targetId]
          ? 'магу'
          : matchState?.creatures?.[targetId]
            ? 'существу'
            : 'цели'
        : 'цели';
      return [amount !== null ? `Нанесено ${amount} урона ${targetKind} ${targetLabel}` : `Урон по цели ${targetLabel}`];
    }

    if (event.type === 'summon') {
      const creatureId = typeof event.payload.creatureId === 'string' ? event.payload.creatureId : null;
      const creatureLabel = creatureId ? knownTargetLabelsById.get(creatureId) ?? creatureId : 'существо';
      return [`На стол вышло существо ${creatureLabel}`];
    }

    if (event.type === 'effect') {
      if (action.kind === 'Evade') {
        return ['Сработал защитный эффект уклонения'];
      }

      if (action.kind === 'Summon') {
        return ['Сработал связанный эффект призыва'];
      }

      if (action.kind === 'CastSpell' || action.kind === 'PlayCard') {
        return ['Сработал дополнительный эффект карты'];
      }

      return ['Сработал дополнительный эффект действия'];
    }

    return [];
  });
};

export const buildMatchFeedRounds = ({
  matchState,
  resolvedRoundHistory,
  knownTargetLabelsById,
  getResolvedActionActorLabel,
  getResolvedActionSentence,
  getResolvedActionTargetLabel,
  getResolvedActionOutcomeLabel,
  getResolvedActionTone,
}: MatchFeedBuilderOptions): MatchFeedRoundSummary[] => {
  const matchLogEntries = getMatchLogEntries(matchState);
  const orderedResolvedActions = [...resolvedRoundHistory]
    .sort((left, right) => left.roundNumber - right.roundNumber)
    .flatMap((round) =>
      round.orderedActions.map((action) => ({
        id: `${round.roundNumber}_${action.intentId}_${action.orderIndex}`,
        action,
      })),
    );
  const resolvedActionById = new Map(orderedResolvedActions.map((entry) => [entry.id, entry.action] as const));
  const matchedAnchors: Array<{ actionId: string; logIndex: number }> = [];
  let cursor = 0;

  orderedResolvedActions.forEach(({ id, action }) => {
    if (action.status !== 'resolved') {
      return;
    }

    for (let index = cursor; index < matchLogEntries.length; index += 1) {
      if (!doesLogActionMatchResolvedAction(action, matchLogEntries[index])) {
        continue;
      }

      matchedAnchors.push({
        actionId: id,
        logIndex: index,
      });
      cursor = index + 1;
      break;
    }
  });

  const matchFeedLogDetailsByActionId = new Map<string, string[]>();
  matchedAnchors.forEach((anchor, index) => {
    const nextAnchorIndex = matchedAnchors[index + 1]?.logIndex ?? matchLogEntries.length;
    const relatedEvents = matchLogEntries.slice(anchor.logIndex + 1, nextAnchorIndex);
    const action = resolvedActionById.get(anchor.actionId);
    const items = action ? getMatchFeedDetailItems(action, relatedEvents, matchState, knownTargetLabelsById) : [];
    if (items.length > 0) {
      matchFeedLogDetailsByActionId.set(anchor.actionId, items);
    }
  });

  return [...resolvedRoundHistory]
    .sort((left, right) => right.roundNumber - left.roundNumber)
    .map((round) => {
      const entries = round.orderedActions.map<MatchFeedEntrySummary>((action) => {
        const actorLabel = getResolvedActionActorLabel(action);
        const actionLabel = getResolvedActionSentence(action);
        const targetLabel =
          action.target?.targetType || action.target?.targetId ? getResolvedActionTargetLabel(action) : undefined;
        const detailText = action.summary?.trim() ? action.summary.trim() : undefined;
        const actionId = `${round.roundNumber}_${action.intentId}_${action.orderIndex}`;

        return {
          id: actionId,
          actorLabel,
          actionLabel,
          targetLabel,
          outcomeLabel: getResolvedActionOutcomeLabel(action),
          detailText,
          detailItems: matchFeedLogDetailsByActionId.get(actionId),
          tone: getResolvedActionTone(action),
        };
      });

      const ownSteps = entries.filter((entry) => entry.actorLabel === 'Ты').length;
      const enemySteps = entries.length - ownSteps;
      const successCount = round.orderedActions.filter((action) => action.status === 'resolved').length;
      const failedCount = round.orderedActions.length - successCount;
      const stepLabel = entries.length === 1 ? 'шаг' : entries.length < 5 ? 'шага' : 'шагов';
      const outcomeSummary =
        failedCount > 0 ? `${successCount} успешно, ${failedCount} сорвалось` : `${successCount} успешно`;

      return {
        roundNumber: round.roundNumber,
        title: `Раунд ${round.roundNumber}`,
        subtitle: `${entries.length} ${stepLabel} · ${outcomeSummary} · ${ownSteps} твоих, ${enemySteps} соперника`,
        entries,
      };
    });
};
