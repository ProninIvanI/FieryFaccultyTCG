import styles from './PlayPvpPage.module.css';

export const MatchWaitingPanel = () => (
  <div className={styles.boardEmpty}>
    <div className={styles.matchSpotlight}>
      <span className={styles.summaryLabel}>Игровое поле</span>
      <strong className={styles.spotlightValue}>Ожидание матча</strong>
      <p className={styles.paragraph}>Матч откроется автоматически после подключения к PvP-сессии.</p>
    </div>
  </div>
);
