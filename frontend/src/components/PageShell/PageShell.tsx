import { ReactNode } from 'react';
import { Header } from '@/components/Header';
import styles from './PageShell.module.css';

interface PageShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
}

export const PageShell = ({ title, subtitle, children, actions }: PageShellProps) => {
  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <Header title={title} subtitle={subtitle ?? ''} />
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  );
};
