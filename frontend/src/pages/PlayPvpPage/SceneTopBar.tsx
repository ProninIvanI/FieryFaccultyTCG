import styles from './PlayPvpPage.module.css';

interface SceneTopBarProps {
  hasMatch: boolean;
  onExitClick: () => void;
}

const ExitDoorIcon = () => (
  <span className={styles.exitDoorIcon} aria-hidden="true">
    <span className={styles.exitDoorPanel} />
    <span className={styles.exitDoorHandle} />
  </span>
);

export const SceneTopBar = ({ hasMatch, onExitClick }: SceneTopBarProps) => (
  <div className={styles.sceneTopBar}>
    <div className={styles.sceneTitleBlock}>
      <h1 className={styles.sceneTitle}>Дуэль магов</h1>
      {!hasMatch ? (
        <div className={styles.sceneMeta}>
          <span className={styles.sceneHint}>
            Подключись к матчу, чтобы открыть арену.
          </span>
        </div>
      ) : null}
    </div>
    <div className={styles.sceneActions}>
      <button
        className={styles.exitMatchButton}
        type="button"
        onClick={onExitClick}
        aria-label="Выйти из матча"
        title="Выйти из матча"
      >
        <ExitDoorIcon />
      </button>
    </div>
  </div>
);
