import styles from './StatusBadge.module.css';

interface StatusBadgeProps {
  status: string;
  isLoading?: boolean;
}

export const StatusBadge = ({ status, isLoading }: StatusBadgeProps) => {
  if (isLoading) {
    return <span className={styles.loading}>Checking...</span>;
  }

  return <span className={styles.status}>{status}</span>;
};






