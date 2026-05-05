import { getRoundDraftRejectCodeLabel, getRoundDraftValidationCodeLabel } from '@game-core/rounds/presentation';
import type { RoundDraftValidationError } from '@game-core/types';
import type { RoundDraftRejectedServerMessage } from '@/types';
import styles from './PlayPvpPage.module.css';

type RoundDraftRejectedSummary = Omit<RoundDraftRejectedServerMessage, 'type'>;

interface RoundDraftRejectedPanelProps {
  rejected: RoundDraftRejectedSummary;
  commonErrors: RoundDraftValidationError[];
}

export const RoundDraftRejectedPanel = ({ rejected, commonErrors }: RoundDraftRejectedPanelProps) => (
  <div className={styles.roundRejectBox}>
    <strong>
      Сервер отклонил: {rejected.operation === 'lock' ? 'завершение хода' : 'обновление'}{' '}
      {rejected.roundNumber > 0 ? `раунда ${rejected.roundNumber}` : 'текущей ленты'}
    </strong>
    <div className={styles.roundQueueError}>
      <span className={styles.cardBadge}>{rejected.code}</span>
      <span>{getRoundDraftRejectCodeLabel(rejected.code)}</span>
    </div>
    <span>{rejected.error}</span>
    {commonErrors.map((entry) => (
      <div key={`${entry.code}_${entry.message}`} className={styles.roundQueueError}>
        <span className={styles.cardBadge}>{entry.code}</span>
        <span>{getRoundDraftValidationCodeLabel(entry.code)}</span>
      </div>
    ))}
  </div>
);
