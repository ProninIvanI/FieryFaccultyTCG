import type { FocusEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getCatalogCardTypeLabel, getCatalogSchoolLabel, toCatalogCardUiType } from '@game-core/cards/catalog';
import { getDurationLabel } from './presentation';
import type {
  BattlefieldSelection,
  BoardItemSummary,
  HandCardSummary,
  RoundRibbonActionSummary,
  SceneInspectSummary,
  SceneInspectTarget,
} from './PlayPvpPage';

const isSameSceneInspectTarget = (
  left: SceneInspectTarget | null,
  right: SceneInspectTarget,
): boolean => left?.kind === right.kind && left.id === right.id;

const getCardTypeLabel = (cardType: string): string => {
  const catalogType = toCatalogCardUiType(cardType);
  if (catalogType) {
    return catalogType === 'summon' ? 'Существо' : getCatalogCardTypeLabel(catalogType);
  }
  return cardType || 'Карта';
};

const getHandCardInspectSummary = (card: HandCardSummary): SceneInspectSummary => ({
  id: card.instanceId,
  title: card.name,
  cornerLabel: `Мана ${card.mana}`,
  badges: [
    getCardTypeLabel(card.cardType),
    ...(card.school ? [getCatalogSchoolLabel(card.school)] : []),
  ],
  stats: [
    ...(card.hp ? [{ label: 'HP' as const, value: card.hp }] : []),
    ...(card.attack ? [{ label: 'ATK' as const, value: card.attack }] : []),
    ...(card.speed ? [{ label: 'SPD' as const, value: card.speed }] : []),
  ],
  details: [
    card.effect ??
      (card.cardType === 'summon'
        ? 'Призыв существа из руки в фазу summon.'
        : 'Розыгрыш эффекта после фиксации хода и резолва раунда.'),
  ],
});

const getBoardItemInspectSummary = (
  item: BoardItemSummary,
  options: {
    attachedActionCount: number;
  },
): SceneInspectSummary => ({
  id: item.id,
  title: item.title,
  cornerLabel: item.duration !== undefined ? getDurationLabel(item.duration) : 'На поле',
  badges: [
    item.subtype === 'creature' ? 'Существо' : 'Эффект',
    item.lifetimeType === 'persistent' ? 'Закреплено' : 'Раунд',
    ...(item.school ? [getCatalogSchoolLabel(item.school)] : []),
    ...(item.duration !== undefined ? [getDurationLabel(item.duration)] : []),
    ...(options.attachedActionCount > 0 ? [`Действий: ${options.attachedActionCount}`] : []),
  ],
  stats: [
    ...(item.hp !== undefined && item.maxHp !== undefined
      ? [{ label: 'HP', value: `${item.hp}/${item.maxHp}` }]
      : []),
    ...(item.attack !== undefined ? [{ label: 'ATK', value: item.attack }] : []),
    ...(item.speed !== undefined ? [{ label: 'SPD', value: item.speed }] : []),
  ],
  details: [item.subtitle],
});

const getRoundActionInspectSummary = (action: RoundRibbonActionSummary): SceneInspectSummary => ({
  id: action.id,
  title: action.title,
  cornerLabel: action.mana !== undefined ? `Мана ${action.mana}` : 'В ленте',
  badges: [
    action.modeLabel,
    ...(action.school ? [getCatalogSchoolLabel(action.school)] : []),
    ...(action.targetLabel ? ['Цель выбрана'] : []),
  ],
  stats: [...(action.cardSpeed ? [{ label: 'SPD', value: action.cardSpeed }] : [])],
  details: [
    ...(action.effectSummary ? [action.effectSummary] : []),
    ...(action.targetLabel && action.targetLabel !== action.subtitle ? [`Цель: ${action.targetLabel}`] : []),
    ...(!action.effectSummary || action.subtitle !== action.effectSummary ? [action.subtitle] : []),
  ],
});

interface UseSceneInspectParams {
  availableHandCardIds: ReadonlySet<string>;
  availableHandCards: HandCardSummary[];
  localBoardItemAttachedActionCountById: ReadonlyMap<string, number>;
  localBoardItemIdByRuntimeId: ReadonlyMap<string, string>;
  localBoardItemsById: ReadonlyMap<string, BoardItemSummary>;
  localRoundRibbonItemsById: ReadonlyMap<string, RoundRibbonActionSummary>;
  selection: BattlefieldSelection;
}

export const useSceneInspect = ({
  availableHandCardIds,
  availableHandCards,
  localBoardItemAttachedActionCountById,
  localBoardItemIdByRuntimeId,
  localBoardItemsById,
  localRoundRibbonItemsById,
  selection,
}: UseSceneInspectParams) => {
  const [target, setTarget] = useState<SceneInspectTarget | null>(null);

  const resolvedTarget = useMemo<SceneInspectTarget | null>(() => {
    if (target) {
      return target;
    }

    if (selection?.kind === 'hand' && availableHandCardIds.has(selection.instanceId)) {
      return { kind: 'hand', id: selection.instanceId };
    }

    return null;
  }, [availableHandCardIds, selection, target]);

  const summary = useMemo(() => {
    if (!resolvedTarget) {
      return null;
    }

    if (resolvedTarget.kind === 'hand') {
      const card = availableHandCards.find((entry) => entry.instanceId === resolvedTarget.id);
      return card ? getHandCardInspectSummary(card) : null;
    }

    if (resolvedTarget.kind === 'boardItem') {
      const item = localBoardItemsById.get(resolvedTarget.id);
      if (!item) {
        return null;
      }

      return getBoardItemInspectSummary(item, {
        attachedActionCount: localBoardItemAttachedActionCountById.get(item.id) ?? 0,
      });
    }

    const action = localRoundRibbonItemsById.get(resolvedTarget.id);
    return action ? getRoundActionInspectSummary(action) : null;
  }, [
    availableHandCards,
    localBoardItemAttachedActionCountById,
    localBoardItemsById,
    localRoundRibbonItemsById,
    resolvedTarget,
  ]);

  const inspectedHandCardId = resolvedTarget?.kind === 'hand' ? resolvedTarget.id : null;
  const inspectedBoardItemId = resolvedTarget?.kind === 'boardItem' ? resolvedTarget.id : null;
  const inspectedRoundActionId = resolvedTarget?.kind === 'roundAction' ? resolvedTarget.id : null;

  const selectionLabel = useMemo(() => {
    if (!resolvedTarget) {
      return null;
    }

    if (resolvedTarget.kind === 'hand') {
      return selection?.kind === 'hand' && selection.instanceId === resolvedTarget.id ? 'Выбрана' : null;
    }

    if (resolvedTarget.kind === 'boardItem') {
      const selectedBoardItemId =
        selection?.kind === 'creature' ? localBoardItemIdByRuntimeId.get(selection.creatureId) ?? null : null;
      return selectedBoardItemId === resolvedTarget.id ? 'Выбрана' : null;
    }

    return null;
  }, [localBoardItemIdByRuntimeId, resolvedTarget, selection]);

  const handleLeave = useCallback((inspectTarget: SceneInspectTarget) => {
    setTarget((current) => (isSameSceneInspectTarget(current, inspectTarget) ? null : current));
  }, []);

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLElement>, inspectTarget: SceneInspectTarget) => {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
        return;
      }

      handleLeave(inspectTarget);
    },
    [handleLeave],
  );

  useEffect(() => {
    if (!target) {
      return;
    }

    if (target.kind === 'hand') {
      if (!availableHandCardIds.has(target.id)) {
        setTarget(null);
      }
      return;
    }

    if (target.kind === 'boardItem') {
      if (!localBoardItemsById.has(target.id)) {
        setTarget(null);
      }
      return;
    }

    if (!localRoundRibbonItemsById.has(target.id)) {
      setTarget(null);
    }
  }, [availableHandCardIds, localBoardItemsById, localRoundRibbonItemsById, target]);

  return {
    handleBlur,
    handleLeave,
    inspectedBoardItemId,
    inspectedHandCardId,
    inspectedRoundActionId,
    selectionLabel,
    setTarget,
    summary,
  };
};
