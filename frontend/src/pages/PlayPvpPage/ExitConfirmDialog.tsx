import type { FormEvent } from 'react';
import styles from './PlayPvpPage.module.css';

interface ExitConfirmDialogProps {
  onConfirm: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}

export const ExitConfirmDialog = ({ onConfirm, onCancel }: ExitConfirmDialogProps) => (
  <div className={styles.exitConfirmOverlay}>
    <form
      className={styles.exitConfirmDialog}
      onSubmit={onConfirm}
      role="dialog"
      aria-modal="true"
      aria-labelledby="exit-confirm-title"
    >
      <div className={styles.exitConfirmHeader}>
        <span className={styles.panelSectionKicker}>Выход из матча</span>
        <strong id="exit-confirm-title" className={styles.panelSectionTitle}>
          Покинуть дуэль?
        </strong>
      </div>
      <p className={styles.paragraph}>
        Ты выйдешь на главную страницу, а текущее PvP-соединение будет закрыто.
      </p>
      <div className={styles.formActions}>
        <button className={styles.primaryButton} type="submit">
          Выйти из матча
        </button>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={onCancel}
        >
          Остаться
        </button>
      </div>
    </form>
  </div>
);
