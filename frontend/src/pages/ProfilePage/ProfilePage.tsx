import { useEffect, useState } from 'react';
import { Card, HomeLinkButton, PageShell } from '@/components';
import { authService } from '@/services';
import styles from './ProfilePage.module.css';

export const ProfilePage = () => {
  const [session, setSession] = useState(() => authService.getSession());

  useEffect(() => {
    let cancelled = false;
    const currentSession = authService.getSession();
    setSession(currentSession);

    if (!currentSession || currentSession.username) {
      return;
    }

    void authService.ensureSessionProfile(currentSession).then((nextSession) => {
      if (!cancelled) {
        setSession(nextSession);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const displayName = session?.username ?? session?.userId ?? 'Игрок';
  const avatarInitial = displayName.slice(0, 1).toUpperCase();

  return (
    <PageShell
      title="Личный кабинет"
      subtitle="Профиль, статистика, колоды и достижения."
      actions={<HomeLinkButton />}
    >
      <Card title="Профиль игрока">
        <div className={styles.profileHeader}>
          <div className={styles.avatar} aria-hidden="true">{avatarInitial}</div>
          <div className={styles.profileMeta}>
            <div className={styles.profileName}>{displayName}</div>
            <div className={styles.metaRow}>
              <span>Уровень: 12</span>
              <span>Ранг: Адепт</span>
            </div>
            <div className={styles.metaHint}>Ранг зависит от уровня и прогрессии.</div>
          </div>
        </div>
      </Card>

      <Card title="Статистика">
        <div className={styles.statsGrid}>
          <div className={styles.statsGroup}>
            <h3 className={styles.sectionTitle}>Общая</h3>
            <div className={styles.statPairs}>
              <span>Бои</span><strong>120</strong>
              <span>Победы</span><strong>78</strong>
              <span>Поражения</span><strong>42</strong>
              <span>Винрейт</span><strong>65%</strong>
            </div>
          </div>

          <div className={styles.statsGroup}>
            <h3 className={styles.sectionTitle}>Соревновательная</h3>
            <div className={styles.statPairs}>
              <span>Рейтинг</span><strong>-</strong>
              <span>Макс. рейтинг</span><strong>-</strong>
              <span>Место в таблице</span><strong>-</strong>
            </div>
          </div>

          <div className={styles.statsGroup}>
            <h3 className={styles.sectionTitle}>Серии</h3>
            <div className={styles.statPairs}>
              <span>Текущая победная</span><strong>3</strong>
              <span>Лучшая победная</span><strong>11</strong>
              <span>Лучшая поражений</span><strong>4</strong>
            </div>
          </div>

          <div className={styles.statsGroup}>
            <h3 className={styles.sectionTitle}>Эффективность</h3>
            <div className={styles.statPairs}>
              <span>Средний урон</span><strong>-</strong>
              <span>Максимальный урон</span><strong>-</strong>
            </div>
          </div>

          <div className={styles.statsGroup}>
            <h3 className={styles.sectionTitle}>Факультеты</h3>
            <div className={styles.statPairs}>
              <span>Победы против Огня</span><strong>20</strong>
              <span>Победы против Воды</span><strong>18</strong>
              <span>Победы против Воздуха</span><strong>22</strong>
              <span>Победы против Земли</span><strong>18</strong>
            </div>
          </div>
        </div>
      </Card>

      <Card title="Колоды">
        <div className={styles.deckRow}>
          <span className={styles.deckChip}>Колода 1</span>
          <span className={styles.deckChip}>Колода 2</span>
          <span className={styles.deckChip}>Колода 3</span>
        </div>
        <div className={styles.deckMeta}>
          <span>Любимая колода: Колода 1</span>
          <span>Всего создано колод: 5</span>
        </div>
      </Card>

      <Card title="Достижения">
        <div className={styles.achievementGrid}>
          <div className={styles.achievementItem} />
          <div className={styles.achievementItem} />
          <div className={styles.achievementItem} />
          <div className={styles.achievementItem} />
          <div className={styles.achievementItem} />
          <div className={styles.achievementItem} />
        </div>
      </Card>

      <Card title="История игр">
        <p>Раздел истории матчей будет наполнен следующим шагом.</p>
      </Card>
    </PageShell>
  );
};
