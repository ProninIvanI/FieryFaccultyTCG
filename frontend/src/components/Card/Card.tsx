import { ReactNode } from 'react';
import styles from './Card.module.css';

interface CardProps {
  title?: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export const Card = ({ title, children, className, contentClassName }: CardProps) => {
  return (
    <div className={[styles.card, className].filter(Boolean).join(' ')}>
      {title && <h2 className={styles.title}>{title}</h2>}
      <div className={[styles.content, contentClassName].filter(Boolean).join(' ')}>{children}</div>
    </div>
  );
};






