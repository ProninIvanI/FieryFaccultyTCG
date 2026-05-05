import type { FocusEvent, ReactNode } from 'react';
import type { ResolvedRoundAction, ResolvePlaybackFrame, ResolutionLayer, TargetType } from '@game-core/types';
import {
  getActiveBoardItemPlaybackEffect,
  getPlaybackNumberOverride,
  getPlaybackValueOverride,
  type PlaybackFieldValue,
} from './playback';
import type {
  BattlefieldSelection,
  LocalBattleRibbonEntrySummary,
  RibbonTargetOptionSummary,
  RoundRibbonActionSummary,
  SceneInspectTarget,
} from './PlayPvpPage';
import styles from './PlayPvpPage.module.css';

interface LocalBattleRibbonProps {
  entries: LocalBattleRibbonEntrySummary[];
  playerId: string;
  selection: BattlefieldSelection;
  activeResolvePlaybackFrame: ResolvePlaybackFrame | null;
  playbackFieldValues: ReadonlyMap<string, PlaybackFieldValue>;
  activeResolvedAction: ResolvedRoundAction | null;
  visibleLocalPlaybackSourceBoardItemId: string | null;
  activeLocalPlaybackIntentId: string | null;
  inspectedBoardItemId: string | null;
  inspectedRoundActionId: string | null;
  isSelfLocked: boolean;
  selectedCreatureActionStatusLabel: string;
  selectedAttackTargetLabel: string;
  canQueueEvade: boolean;
  canQueueAttack: boolean;
  activeDraftTargetId: string | null;
  getBoardItemPlaybackEffectClassName: (effect: ReturnType<typeof getActiveBoardItemPlaybackEffect>) => string;
  getRibbonActionToneClassName: (layer: ResolutionLayer) => string;
  getRibbonArtworkAccentClassName: (
    school?: 'fire' | 'water' | 'earth' | 'air',
    variant?: 'creature' | 'effect' | 'action',
  ) => string;
  getDurationLabel: (duration: number) => string;
  getTargetButtonAriaLabel: (label: string, selectable: boolean) => string;
  getRibbonTargetTabAriaLabel: (label: string) => string;
  getRibbonTargetOptions: (targetType: TargetType | null | undefined) => RibbonTargetOptionSummary[];
  isSelectableTarget: (candidateId: string) => boolean;
  isDraftTargetActive: (candidateId: string) => boolean;
  onInspectTarget: (target: SceneInspectTarget) => void;
  onInspectLeave: (target: SceneInspectTarget) => void;
  onInspectBlur: (event: FocusEvent<HTMLDivElement>, target: SceneInspectTarget) => void;
  onSelectCreature: (creatureId: string) => void;
  onApplyDraftTarget: (targetId: string) => void;
  onQueueEvade: () => void;
  onQueueAttack: () => void;
  onResetDraftTarget: () => void;
  onRemoveRoundIntent: (intentId: string) => void;
  onRoundIntentTargetSelect: (intentId: string, targetType: TargetType, targetId: string) => void;
  renderIntentValidationErrors: (intentId: string) => ReactNode;
}

const InlineActionStack = ({
  itemId,
  actions,
  activeLocalPlaybackIntentId,
  isSelfLocked,
  getRibbonActionToneClassName,
  onInspectTarget,
  onInspectLeave,
  onInspectBlur,
  onRemoveRoundIntent,
  renderIntentValidationErrors,
}: {
  itemId: string;
  actions: RoundRibbonActionSummary[];
  activeLocalPlaybackIntentId: string | null;
  isSelfLocked: boolean;
  getRibbonActionToneClassName: (layer: ResolutionLayer) => string;
  onInspectTarget: (target: SceneInspectTarget) => void;
  onInspectLeave: (target: SceneInspectTarget) => void;
  onInspectBlur: (event: FocusEvent<HTMLDivElement>, target: SceneInspectTarget) => void;
  onRemoveRoundIntent: (intentId: string) => void;
  renderIntentValidationErrors: (intentId: string) => ReactNode;
}) => {
  if (actions.length === 0) {
    return null;
  }

  return (
    <div className={styles.ribbonActionStack}>
      {actions.map((action) => {
        const actionInspectTarget: SceneInspectTarget = { kind: 'roundAction', id: action.id };
        const compactActionTitle = action.sourceType === 'boardItem' ? action.modeLabel : action.title;

        return (
          <div
            key={`${itemId}_${action.id}`}
            className={`${styles.ribbonInlineAction} ${getRibbonActionToneClassName(action.layer)} ${
              activeLocalPlaybackIntentId === action.id ? styles.ribbonInlineActionActive : ''
            }`.trim()}
            data-testid={
              activeLocalPlaybackIntentId === action.id
                ? 'local-playback-inline-action'
                : `battle-ribbon-inline-action-${action.id}`
            }
            onMouseEnter={() => onInspectTarget(actionInspectTarget)}
            onMouseLeave={() => onInspectLeave(actionInspectTarget)}
            onFocusCapture={() => onInspectTarget(actionInspectTarget)}
            onBlurCapture={(event) => onInspectBlur(event, actionInspectTarget)}
          >
            <div className={styles.ribbonInlineActionHeader}>
              <strong className={styles.ribbonCompactTitle}>{compactActionTitle}</strong>
              <div className={styles.ribbonBadgeRow}>
                {action.cardSpeed ? <span className={styles.handStatPill}>SPD {action.cardSpeed}</span> : null}
              </div>
            </div>
            {renderIntentValidationErrors(action.id)}
            <div className={styles.inlineActions}>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => onRemoveRoundIntent(action.id)}
                disabled={isSelfLocked}
              >
                Убрать из ленты
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const LocalBattleRibbon = ({
  entries,
  playerId,
  selection,
  activeResolvePlaybackFrame,
  playbackFieldValues,
  activeResolvedAction,
  visibleLocalPlaybackSourceBoardItemId,
  activeLocalPlaybackIntentId,
  inspectedBoardItemId,
  inspectedRoundActionId,
  isSelfLocked,
  selectedCreatureActionStatusLabel,
  selectedAttackTargetLabel,
  canQueueEvade,
  canQueueAttack,
  activeDraftTargetId,
  getBoardItemPlaybackEffectClassName,
  getRibbonActionToneClassName,
  getRibbonArtworkAccentClassName,
  getDurationLabel,
  getTargetButtonAriaLabel,
  getRibbonTargetTabAriaLabel,
  getRibbonTargetOptions,
  isSelectableTarget,
  isDraftTargetActive,
  onInspectTarget,
  onInspectLeave,
  onInspectBlur,
  onSelectCreature,
  onApplyDraftTarget,
  onQueueEvade,
  onQueueAttack,
  onResetDraftTarget,
  onRemoveRoundIntent,
  onRoundIntentTargetSelect,
  renderIntentValidationErrors,
}: LocalBattleRibbonProps) => (
  <div className={styles.ribbonSection}>
    <div className={styles.ribbonGrid}>
      {entries.map((entry) => {
        if (entry.kind === 'boardItem') {
          const { item, attachedActions } = entry;
          const boardItemPlaybackEffect =
            item.subtype === 'creature' ? getActiveBoardItemPlaybackEffect(activeResolvePlaybackFrame, item.runtimeId) : null;
          const boardItemPresenceOverride =
            item.subtype === 'creature'
              ? getPlaybackValueOverride(playbackFieldValues, 'creature', item.runtimeId, 'presence')
              : undefined;
          const boardItemHpOverride =
            item.subtype === 'creature'
              ? getPlaybackNumberOverride(playbackFieldValues, 'creature', item.runtimeId, 'hp')
              : null;
          const boardItemDisplayHp = boardItemHpOverride ?? item.hp ?? 0;
          const isBoardItemHiddenByPlayback =
            boardItemPresenceOverride === false && boardItemPlaybackEffect?.tone !== 'destroy';
          if (isBoardItemHiddenByPlayback) {
            return null;
          }

          const isSelectedBoardCreature =
            item.subtype === 'creature' && selection?.kind === 'creature' && selection.creatureId === item.runtimeId;
          const isPlaybackBoardItemActive = visibleLocalPlaybackSourceBoardItemId === item.id;
          const activeBoardItemAction =
            isPlaybackBoardItemActive && activeResolvedAction?.playerId === playerId ? activeResolvedAction : null;
          const boardItemInspectTarget: SceneInspectTarget = { kind: 'boardItem', id: item.id };
          const localCardClassName = [
            styles.ribbonCard,
            item.subtype === 'effect' ? styles.ribbonCardEffect : styles.ribbonCardLocal,
            attachedActions.length > 0 ? styles.ribbonCardActive : '',
            isPlaybackBoardItemActive ? styles.ribbonCardPlaybackActive : '',
            activeBoardItemAction?.layer === 'attacks' ? styles.ribbonCardPlaybackAttack : '',
            isPlaybackBoardItemActive && item.speed ? styles.ribbonCardPlaybackSpeed : '',
            getBoardItemPlaybackEffectClassName(boardItemPlaybackEffect),
            inspectedBoardItemId === item.id ? styles.ribbonCardInspected : '',
          ]
            .filter(Boolean)
            .join(' ');

          return item.subtype === 'creature' ? (
            <div
              key={entry.id}
              className={localCardClassName}
              data-testid={`battle-ribbon-item-${item.id}`}
              onMouseEnter={() => onInspectTarget(boardItemInspectTarget)}
              onMouseLeave={() => onInspectLeave(boardItemInspectTarget)}
              onFocusCapture={() => onInspectTarget(boardItemInspectTarget)}
              onBlurCapture={(event) => onInspectBlur(event, boardItemInspectTarget)}
            >
              <button
                className={`${styles.selectionSurface} ${
                  selection?.kind === 'creature' && selection.creatureId === item.runtimeId
                    ? styles.selectionSurfaceActive
                    : ''
                } ${isSelectableTarget(item.runtimeId) ? styles.selectionSurfaceTargetable : ''} ${
                  isDraftTargetActive(item.runtimeId) ? styles.selectionSurfaceTargetActive : ''
                }`.trim()}
                aria-label={getTargetButtonAriaLabel(`Существо ${item.runtimeId}`, isSelectableTarget(item.runtimeId))}
                type="button"
                onClick={() =>
                  isSelectableTarget(item.runtimeId)
                    ? onApplyDraftTarget(item.runtimeId)
                    : onSelectCreature(item.runtimeId)
                }
              >
                <div className={`${styles.ribbonArtwork} ${getRibbonArtworkAccentClassName(item.school, 'creature')}`.trim()}>
                  {attachedActions.length > 0 ? (
                    <span className={styles.ribbonArtworkBadge}>Действий: {attachedActions.length}</span>
                  ) : null}
                </div>
                <div className={styles.ribbonCardBody}>
                  <strong className={styles.ribbonCompactTitle}>{item.title}</strong>
                  <div className={styles.ribbonStats}>
                    <span>HP {boardItemDisplayHp}/{item.maxHp ?? 0}</span>
                    <span>ATK {item.attack ?? 0}</span>
                    <span>SPD {item.speed ?? 0}</span>
                  </div>
                </div>
              </button>
              {boardItemPlaybackEffect?.floatingText ? (
                <span className={styles.ribbonFloatingNumber}>{boardItemPlaybackEffect.floatingText}</span>
              ) : null}
              <InlineActionStack
                itemId={item.id}
                actions={attachedActions}
                activeLocalPlaybackIntentId={activeLocalPlaybackIntentId}
                isSelfLocked={isSelfLocked}
                getRibbonActionToneClassName={getRibbonActionToneClassName}
                onInspectTarget={onInspectTarget}
                onInspectLeave={onInspectLeave}
                onInspectBlur={onInspectBlur}
                onRemoveRoundIntent={onRemoveRoundIntent}
                renderIntentValidationErrors={renderIntentValidationErrors}
              />
              {isSelectedBoardCreature && item.ownerId === playerId ? (
                <div className={styles.inlineConfigurator}>
                  <div className={styles.indicatorRail}>
                    <div className={styles.indicatorPill}>
                      <span className={styles.indicatorKicker}>Режим</span>
                      <strong className={styles.indicatorValue}>{selectedCreatureActionStatusLabel}</strong>
                    </div>
                    <div className={styles.indicatorPill}>
                      <span className={styles.indicatorKicker}>Текущая цель</span>
                      <strong className={styles.indicatorValue}>{selectedAttackTargetLabel}</strong>
                    </div>
                  </div>
                  <div className={styles.indicatorRail}>
                    <button
                      aria-label="Добавить уклонение в ленту"
                      className={`${styles.indicatorButton} ${styles.indicatorButtonDefensive}`.trim()}
                      type="button"
                      onClick={onQueueEvade}
                      disabled={!canQueueEvade || isSelfLocked}
                    >
                      <span className={styles.indicatorKicker}>Действие</span>
                      <strong className={styles.indicatorValue}>Уклонение</strong>
                    </button>
                    <button
                      aria-label="Добавить атаку в ленту"
                      className={`${styles.indicatorButton} ${styles.indicatorButtonOffensive}`.trim()}
                      type="button"
                      onClick={onQueueAttack}
                      disabled={!canQueueAttack || isSelfLocked}
                    >
                      <span className={styles.indicatorKicker}>Действие</span>
                      <strong className={styles.indicatorValue}>Атака</strong>
                      <span className={styles.indicatorSubvalue}>{selectedAttackTargetLabel}</span>
                    </button>
                    <button className={styles.secondaryButton} type="button" onClick={onResetDraftTarget} disabled={!activeDraftTargetId}>
                      Сбросить цель
                    </button>
                  </div>
                  <div className={styles.hint}>Сменить цель можно только кликом по подсвеченной сущности прямо на поле.</div>
                </div>
              ) : null}
            </div>
          ) : (
            <div
              key={entry.id}
              className={localCardClassName}
              data-testid={`battle-ribbon-item-${item.id}`}
              onMouseEnter={() => onInspectTarget(boardItemInspectTarget)}
              onMouseLeave={() => onInspectLeave(boardItemInspectTarget)}
              onFocusCapture={() => onInspectTarget(boardItemInspectTarget)}
              onBlurCapture={(event) => onInspectBlur(event, boardItemInspectTarget)}
            >
              <div className={`${styles.ribbonArtwork} ${getRibbonArtworkAccentClassName(item.school, 'effect')}`.trim()}>
                {item.duration !== undefined ? (
                  <span className={styles.ribbonArtworkBadge}>{getDurationLabel(item.duration)}</span>
                ) : attachedActions.length > 0 ? (
                  <span className={styles.ribbonArtworkBadge}>Действий: {attachedActions.length}</span>
                ) : null}
              </div>
              <div className={styles.ribbonCardBody}>
                <strong className={styles.ribbonCompactTitle}>{item.title}</strong>
                <div className={styles.ribbonBadgeRow}>
                  <span className={styles.cardBadge}>{item.lifetimeType === 'persistent' ? 'Закреплено' : 'Раунд'}</span>
                  {attachedActions.length > 0 ? <span className={styles.cardBadge}>Действий: {attachedActions.length}</span> : null}
                </div>
              </div>
              <InlineActionStack
                itemId={item.id}
                actions={attachedActions}
                activeLocalPlaybackIntentId={activeLocalPlaybackIntentId}
                isSelfLocked={isSelfLocked}
                getRibbonActionToneClassName={getRibbonActionToneClassName}
                onInspectTarget={onInspectTarget}
                onInspectLeave={onInspectLeave}
                onInspectBlur={onInspectBlur}
                onRemoveRoundIntent={onRemoveRoundIntent}
                renderIntentValidationErrors={renderIntentValidationErrors}
              />
            </div>
          );
        }

        const action = entry.action;
        const ribbonTargetOptions = action.targetType ? getRibbonTargetOptions(action.targetType) : [];
        const canAdjustActionTarget = action.sourceType === 'card' && ribbonTargetOptions.length > 0;
        const roundActionInspectTarget: SceneInspectTarget = { kind: 'roundAction', id: action.id };
        const activeDetachedAction = activeLocalPlaybackIntentId === action.id ? activeResolvedAction : null;

        return (
          <div
            key={entry.id}
            className={[
              styles.ribbonCard,
              styles.ribbonCardAction,
              getRibbonActionToneClassName(action.layer),
              activeLocalPlaybackIntentId === action.id ? styles.ribbonCardPlaybackActive : '',
              activeDetachedAction?.layer === 'attacks' ? styles.ribbonCardPlaybackAttack : '',
              activeLocalPlaybackIntentId === action.id && action.cardSpeed ? styles.ribbonCardPlaybackSpeed : '',
              activeDetachedAction?.status === 'fizzled' ? styles.ribbonCardPlaybackFizzle : '',
              inspectedRoundActionId === action.id ? styles.ribbonCardInspected : '',
            ]
              .filter(Boolean)
              .join(' ')}
            data-testid={
              activeLocalPlaybackIntentId === action.id ? 'local-playback-action-card' : `battle-ribbon-action-${action.id}`
            }
            onMouseEnter={() => onInspectTarget(roundActionInspectTarget)}
            onMouseLeave={() => onInspectLeave(roundActionInspectTarget)}
            onFocusCapture={() => onInspectTarget(roundActionInspectTarget)}
            onBlurCapture={(event) => onInspectBlur(event, roundActionInspectTarget)}
          >
            <div className={styles.ribbonActionLayout}>
              {canAdjustActionTarget ? (
                <div className={styles.ribbonTargetTabs} aria-label="Выбор цели для действия">
                  {ribbonTargetOptions.map((candidate) => (
                    <button
                      key={`${action.id}_${candidate.id}`}
                      className={`${styles.ribbonTargetTab} ${
                        action.targetId === candidate.id ? styles.ribbonTargetTabActive : ''
                      }`.trim()}
                      type="button"
                      aria-label={getRibbonTargetTabAriaLabel(candidate.label)}
                      onClick={() => onRoundIntentTargetSelect(action.id, action.targetType!, candidate.id)}
                      disabled={isSelfLocked}
                    >
                      <span className={styles.ribbonTargetTabIcon}>{candidate.compactLabel}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              <div className={styles.ribbonActionBody}>
                <div className={`${styles.ribbonArtwork} ${getRibbonArtworkAccentClassName(action.school, 'action')}`.trim()}>
                  {action.mana !== undefined ? <span className={styles.ribbonArtworkMana}>{action.mana}</span> : null}
                </div>
                <div className={styles.ribbonCardBody}>
                  <strong className={`${styles.ribbonCompactTitle} ${styles.ribbonActionMain}`.trim()}>{action.title}</strong>
                  <div className={styles.ribbonBadgeRow}>
                    {action.cardSpeed ? <span className={styles.handStatPill}>SPD {action.cardSpeed}</span> : null}
                  </div>
                </div>
                {renderIntentValidationErrors(action.id)}
                <div className={styles.inlineActions}>
                  <button className={styles.secondaryButton} type="button" onClick={() => onRemoveRoundIntent(action.id)} disabled={isSelfLocked}>
                    Убрать из ленты
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);
