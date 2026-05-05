import styles from './PlayPvpPage.module.css';

interface SceneInspectSummary {
  id: string;
  title: string;
  kicker?: string;
  cornerLabel: string;
  badges: string[];
  stats: Array<{ label: string; value: number | string }>;
  details: string[];
}

interface SceneInspectPanelProps {
  summary: SceneInspectSummary;
  selectionLabel: string | null;
}

export const SceneInspectPanel = ({ summary, selectionLabel }: SceneInspectPanelProps) => (
  <aside className={styles.fieldInspectPanel} data-testid="scene-inspect-panel" aria-live="polite">
    <div className={styles.sceneInspectPanel}>
      <div className={styles.sceneInspectHeader}>
        <div className={styles.sceneInspectHeading}>
          {summary.kicker ? (
            <span className={styles.summaryLabel}>{summary.kicker}</span>
          ) : null}
          <strong className={styles.sceneInspectTitle}>{summary.title}</strong>
        </div>
        <span className={styles.sceneInspectCorner}>{summary.cornerLabel}</span>
      </div>
      <div className={styles.sceneInspectBadgeRow}>
        {summary.badges.map((badge) => (
          <span key={`${summary.id}_${badge}`} className={styles.cardBadge}>
            {badge}
          </span>
        ))}
        {selectionLabel ? (
          <span className={`${styles.cardBadge} ${styles.cardBadgeTarget}`.trim()}>
            {selectionLabel}
          </span>
        ) : null}
      </div>
      {summary.stats.length > 0 ? (
        <div className={styles.sceneInspectStats}>
          {summary.stats.map((stat) => (
            <span key={`${summary.id}_${stat.label}`} className={styles.handStatPill}>
              {stat.label} {stat.value}
            </span>
          ))}
        </div>
      ) : null}
      <div className={styles.sceneInspectDetails}>
        {summary.details.map((detail, index) => (
          <p key={`${summary.id}_${index}`} className={styles.sceneInspectDetail}>
            {detail}
          </p>
        ))}
      </div>
    </div>
  </aside>
);
