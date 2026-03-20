import { Link } from 'react-router-dom';
import { ROUTES } from '@/constants';
import styles from './HomeLinkButton.module.css';

interface HomeLinkButtonProps {
  label?: string;
}

export const HomeLinkButton = ({ label = 'На главную' }: HomeLinkButtonProps) => {
  return (
    <Link className={styles.button} to={ROUTES.HOME}>
      <span className={styles.text}>{label}</span>
    </Link>
  );
};
