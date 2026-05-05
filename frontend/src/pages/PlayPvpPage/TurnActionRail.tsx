import styles from './PlayPvpPage.module.css';

interface TurnActionRailProps {
  canLockRound: boolean;
  isSelfLocked: boolean;
  isOpponentLocked: boolean;
  hasReplayAvailable: boolean;
  isResolvedReplayOpen: boolean;
  onLockRound: () => void;
  onToggleResolvedReplay: () => void;
}

export const TurnActionRail = ({
  canLockRound,
  isSelfLocked,
  isOpponentLocked,
  hasReplayAvailable,
  isResolvedReplayOpen,
  onLockRound,
  onToggleResolvedReplay,
}: TurnActionRailProps) => (
  <div className={styles.turnActionRail}>
    <div className={styles.turnActionControls}>
      <button
        className={`${styles.primaryButton} ${styles.turnActionButton}`.trim()}
        type="button"
        onClick={onLockRound}
        disabled={!canLockRound}
      >
        {isSelfLocked ? 'Ждём ход соперника' : 'Завершить ход'}
      </button>
      {hasReplayAvailable ? (
        <button
          className={`${styles.replayToggleButton} ${styles.turnActionReplayButton} ${
            isResolvedReplayOpen ? styles.replayToggleButtonActive : ''
          }`.trim()}
          type="button"
          aria-label={isResolvedReplayOpen ? 'Вернуться к текущему драфту' : 'Открыть прошлый резолв'}
          onClick={onToggleResolvedReplay}
        >
          <span className={styles.replayToggleEye} aria-hidden="true">
            <span className={styles.replayToggleEyePupil} />
          </span>
        </button>
      ) : null}
    </div>
    <div className={styles.turnActionStatus}>
      <span>
        Ты: <strong>{isSelfLocked ? 'Готово' : 'Собираешь ленту'}</strong>
      </span>
      <span>
        Соперник: <strong>{isOpponentLocked ? 'Готово' : 'Выбирает'}</strong>
      </span>
    </div>
  </div>
);
