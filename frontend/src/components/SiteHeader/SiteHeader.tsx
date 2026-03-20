import { ReactNode } from 'react';
import { Header } from '@/components';
import styles from './SiteHeader.module.css';

type Props = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

export const SiteHeader = ({ title, subtitle, actions }: Props) => {
  return (
    <header className={styles.root}>
      <Header title={title} subtitle={subtitle} />
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
};
