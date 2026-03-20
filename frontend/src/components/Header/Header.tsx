import styles from './Header.module.css';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export const Header = ({ title, subtitle }: HeaderProps) => {
  const hasSubtitle = Boolean(subtitle?.trim());
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>{title}</h1>
      {hasSubtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
    </header>
  );
};






