import type { MutableRefObject, RefObject } from 'react';
import type { ResolvedRoundAction, ResolutionLayer } from '@game-core/types';
import type { ResolvedTimelineEntrySummary } from './resolvedActionPresentation';
import styles from './PlayPvpPage.module.css';

interface ResolutionReplayStripProps {
  entries: ResolvedTimelineEntrySummary[];
  playerId: string;
  hasActiveStep: boolean;
  activeEntry: ResolvedTimelineEntrySummary | null;
  playbackIndex: number;
  playbackComplete: boolean;
  trackRef: RefObject<HTMLDivElement>;
  itemRefs: MutableRefObject<Record<string, HTMLElement | null>>;
  getQueueToneClassName: (layer: ResolutionLayer) => string;
  getToneBadgeClassName: (layer: ResolutionLayer) => string;
  getModeLabel: (layer: ResolutionLayer) => string;
  getOutcomeLabel: (action: ResolvedRoundAction) => string;
}

export const ResolutionReplayStrip = ({
  entries,
  playerId,
  hasActiveStep,
  activeEntry,
  playbackIndex,
  playbackComplete,
  trackRef,
  itemRefs,
  getQueueToneClassName,
  getToneBadgeClassName,
  getModeLabel,
  getOutcomeLabel,
}: ResolutionReplayStripProps) => (
  <section className={styles.resolveReplayScene} data-testid="resolution-replay-strip">
    <div
      ref={trackRef}
      className={[
        styles.resolveReplayTrack,
        entries.length === 1
          ? styles.resolveReplayTrackSolo
          : entries.length <= 3
            ? styles.resolveReplayTrackSparse
            : entries.length >= 6
              ? styles.resolveReplayTrackDense
              : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {entries.map((entry, index) => {
        const isActive = hasActiveStep && activeEntry?.action.intentId === entry.action.intentId;
        const isResolved =
          playbackComplete ||
          (activeEntry ? entry.action.orderIndex < activeEntry.action.orderIndex : index < playbackIndex);

        return (
          <article
            key={entry.action.intentId}
            ref={(node) => {
              itemRefs.current[entry.action.intentId] = node;
            }}
            className={[
              styles.resolveReplayItem,
              getQueueToneClassName(entry.action.layer),
              entry.action.playerId === playerId ? styles.resolveReplayItemLocal : styles.resolveReplayItemEnemy,
              isActive ? styles.resolveReplayItemActive : '',
              isActive && entry.action.status === 'fizzled' ? styles.resolveReplayItemFizzle : '',
              isActive && entry.action.layer === 'attacks' ? styles.resolveReplayItemAttack : '',
              isResolved ? styles.resolveReplayItemResolved : '',
            ]
              .filter(Boolean)
              .join(' ')}
            data-testid={isActive ? 'resolution-replay-item-active' : 'resolution-replay-item'}
          >
            <div className={styles.resolveReplayItemHeader}>
              <span className={styles.resolveReplayItemOrder}>{entry.order}</span>
              <div className={styles.resolveReplayItemHeading}>
                <span className={styles.summaryLabel}>{entry.ownerLabel}</span>
                <strong>{entry.title}</strong>
              </div>
            </div>
            {entry.subtitle ? <span className={styles.resolveReplayItemSubtitle}>{entry.subtitle}</span> : null}
            <div className={styles.resolveReplayItemMeta}>
              <span className={`${styles.cardBadge} ${getToneBadgeClassName(entry.action.layer)}`.trim()}>
                {getModeLabel(entry.action.layer)}
              </span>
              {entry.action.status !== 'resolved' ? (
                <span className={styles.cardBadge}>{getOutcomeLabel(entry.action)}</span>
              ) : null}
              {isActive ? <span className={styles.cardBadge}>Сейчас</span> : null}
            </div>
            {entry.summary ? <span className={styles.resolveReplayItemSummary}>{entry.summary}</span> : null}
            {entry.detailItems.length ? (
              <div className={styles.resolveReplayItemDetails}>
                {entry.detailItems.map((detailItem) => (
                  <div key={detailItem} className={styles.resolveReplayItemDetail}>
                    {detailItem}
                  </div>
                ))}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  </section>
);
