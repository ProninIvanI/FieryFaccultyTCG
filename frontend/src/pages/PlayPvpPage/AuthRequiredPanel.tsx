import { Link } from 'react-router-dom';
import { Card, HomeLinkButton, PageShell } from '@/components';
import { ROUTES } from '@/constants';
import styles from './PlayPvpPage.module.css';

export const AuthRequiredPanel = () => (
  <PageShell
    title="Дуэль магов"
    subtitle="Войдите в аккаунт, чтобы выйти на арену."
    actions={<HomeLinkButton />}
  >
    <Card title="Нужна авторизация">
      <div className={styles.noticeBlock}>
        <p className={styles.paragraph}>
          Сначала войди в аккаунт, чтобы использовать свой игровой идентификатор для PvP-сервера.
        </p>
        <div className={styles.inlineActions}>
          <Link className={styles.primaryButton} to={ROUTES.LOGIN}>
            Войти
          </Link>
          <Link className={styles.secondaryButton} to={ROUTES.REGISTER}>
            Создать аккаунт
          </Link>
        </div>
      </div>
    </Card>
  </PageShell>
);
