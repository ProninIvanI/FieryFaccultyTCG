import { ReactNode } from 'react';
import styles from './Card.module.css';

interface CardProps {
  title?: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  allowOverflow?: boolean;
}

export const Card = ({
  title,
  children,
  className,
  contentClassName,
  allowOverflow = false,
}: CardProps) => {
  return (
    <div
      className={[
        styles.card,
        allowOverflow ? styles.cardAllowOverflow : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {title && <h2 className={styles.title}>{title}</h2>}
      <div className={[styles.content, contentClassName].filter(Boolean).join(' ')}>{children}</div>
    </div>
  );
};






