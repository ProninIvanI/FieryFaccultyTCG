import styles from './PlayPvpPage.module.css';

interface OpponentPreparationZoneProps {
  isReplayOpen: boolean;
  isHandEmpty: boolean;
  visibleHandCount: number;
  preparationCount: number;
  preparationToneClassName: string;
}

export const OpponentPreparationZone = ({
  isReplayOpen,
  isHandEmpty,
  visibleHandCount,
  preparationCount,
  preparationToneClassName,
}: OpponentPreparationZoneProps) => {
  if (isReplayOpen) {
    return null;
  }

  return (
    <>
      <section
        className={`${styles.handTray} ${styles.opponentHandTray} ${isHandEmpty ? styles.compactZone : ''}`.trim()}
        data-testid="opponent-hand-tray"
      >
        {visibleHandCount > 0 ? (
          <div className={styles.opponentHandFanGrid} aria-hidden="true">
            {Array.from({ length: visibleHandCount }).map((_, index) => (
              <div key={`enemy-hand-${index}`} className={styles.opponentHandCard} data-testid="opponent-hand-card">
                <span className={styles.opponentHandCardBack} />
              </div>
            ))}
          </div>
        ) : null}
      </section>
      <section
        className={`${styles.opponentIntentTray} ${preparationToneClassName}`.trim()}
        data-testid="opponent-hidden-draft-zone"
        aria-label="Скрытая подготовка соперника"
      >
        <div className={styles.opponentIntentFan} aria-hidden="true">
          {preparationCount > 0
            ? Array.from({ length: preparationCount }).map((_, index) => (
                <span
                  key={`opponent-intent-${index}`}
                  className={`${styles.opponentIntentCard} ${
                    index === 0 ? styles.opponentIntentCardLead : ''
                  }`.trim()}
                />
              ))
            : null}
        </div>
      </section>
    </>
  );
};
