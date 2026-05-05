import type { RefObject } from 'react';
import type { MatchFeedRoundSummary } from './matchFeed';
import styles from './PlayPvpPage.module.css';

interface MatchFeedDrawerProps {
  isOpen: boolean;
  rounds: MatchFeedRoundSummary[];
  expandedRoundNumber: number | null;
  toggleRef: RefObject<HTMLButtonElement>;
  panelRef: RefObject<HTMLDivElement>;
  onToggleOpen: () => void;
  onToggleRound: (roundNumber: number) => void;
}

const MatchFeedScrollIcon = () => (
  <span className={styles.matchFeedScrollIcon} aria-hidden="true">
    <span className={styles.matchFeedScrollRollTop} />
    <span className={styles.matchFeedScrollSheet} />
    <span className={styles.matchFeedScrollLine} />
    <span className={styles.matchFeedScrollLine} />
  </span>
);

const getRoundCountLabel = (count: number): string =>
  count > 0 ? `${count} раунд${count === 1 ? '' : count < 5 ? 'а' : 'ов'}` : 'Пока пусто';

const getEntryToneClassName = (tone: MatchFeedRoundSummary['entries'][number]['tone']): string => {
  switch (tone) {
    case 'success':
      return styles.matchFeedEntryToneSuccess;
    case 'warning':
      return styles.matchFeedEntryToneWarning;
    case 'danger':
      return styles.matchFeedEntryToneDanger;
    default:
      return styles.matchFeedEntryToneNeutral;
  }
};

export const MatchFeedDrawer = ({
  isOpen,
  rounds,
  expandedRoundNumber,
  toggleRef,
  panelRef,
  onToggleOpen,
  onToggleRound,
}: MatchFeedDrawerProps) => (
  <>
    <button
      ref={toggleRef}
      className={`${styles.matchFeedToggleButton} ${isOpen ? styles.matchFeedToggleButtonActive : ''}`.trim()}
      type="button"
      onClick={onToggleOpen}
      aria-label={isOpen ? 'Скрыть историю раундов' : 'Открыть историю раундов'}
      aria-expanded={isOpen}
    >
      <MatchFeedScrollIcon />
      {rounds.length > 0 ? <span className={styles.matchFeedToggleCount}>{rounds.length}</span> : null}
    </button>
    <div
      ref={panelRef}
      className={`${styles.matchFeedDrawer} ${isOpen ? styles.matchFeedDrawerOpen : ''}`.trim()}
      aria-hidden={!isOpen}
    >
      <div className={styles.matchFeedDrawerHeader}>
        <div className={styles.panelSectionHeading}>
          <span className={styles.panelSectionKicker}>История матча</span>
          <strong className={styles.panelSectionTitle}>Летопись раундов</strong>
        </div>
        <span className={styles.cardBadge}>{getRoundCountLabel(rounds.length)}</span>
      </div>
      <div className={styles.matchFeedDrawerBody}>
        {rounds.length > 0 ? (
          <div className={styles.matchFeed} data-testid="match-feed">
            {rounds.map((round) => {
              const isExpanded = round.roundNumber === expandedRoundNumber;

              return (
                <section key={round.roundNumber} className={styles.matchFeedRound}>
                  <button
                    type="button"
                    className={styles.matchFeedRoundToggle}
                    onClick={() => onToggleRound(round.roundNumber)}
                    aria-expanded={isExpanded}
                  >
                    <div className={styles.matchFeedRoundHeading}>
                      <strong>{round.title}</strong>
                      <span>{round.subtitle}</span>
                    </div>
                    <span className={styles.matchFeedRoundChevron}>{isExpanded ? 'Свернуть' : 'Раскрыть'}</span>
                  </button>

                  {isExpanded ? (
                    <div className={styles.matchFeedEntries}>
                      {round.entries.map((entry) => (
                        <article
                          key={entry.id}
                          className={`${styles.matchFeedEntry} ${getEntryToneClassName(entry.tone)}`}
                        >
                          <div className={styles.matchFeedEntryMain}>
                            <strong>{entry.actorLabel}</strong>
                            <span>{entry.actionLabel}</span>
                          </div>
                          {entry.targetLabel ? <div className={styles.matchFeedEntryMeta}>Цель: {entry.targetLabel}</div> : null}
                          <div className={styles.matchFeedEntryOutcome}>{entry.outcomeLabel}</div>
                          {entry.detailText ? <div className={styles.matchFeedEntryDetail}>{entry.detailText}</div> : null}
                          {entry.detailItems?.length ? (
                            <div className={styles.matchFeedEntryDetails}>
                              {entry.detailItems.map((detailItem) => (
                                <div key={detailItem} className={styles.matchFeedEntryDetailItem}>
                                  {detailItem}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        ) : (
          <div className={styles.emptyState}>Раунды появятся после первого резолва.</div>
        )}
      </div>
    </div>
  </>
);
