import { useEffect, useState } from 'react';
import { Card, HomeLinkButton, PageShell } from '@/components';
import { authService, profileService } from '@/services';
import { AuthSession, PlayerProfileViewModel, ProfileStatItem } from '@/types';
import styles from './ProfilePage.module.css';

type ProfileStatsGroupProps = {
  title: string;
  items: ProfileStatItem[];
};

type MatchFilterId = 'all' | 'wins' | 'losses';

type ProfileNoticeProps = {
  title: string;
  message: string;
  tone: 'warning' | 'error';
  onDismiss: () => void;
};

const sessionDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const formatSessionDate = (value: string | undefined): string => {
  if (!value) {
    return '—';
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return '—';
  }

  return sessionDateFormatter.format(new Date(timestamp));
};

function ProfileStatsGroup({ title, items }: ProfileStatsGroupProps) {
  return (
    <div className={styles.statsGroup}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      <div className={styles.statPairs}>
        {items.map((item) => (
          <div className={styles.statRow} key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfileNotice({ title, message, tone, onDismiss }: ProfileNoticeProps) {
  return (
    <div
      className={[
        styles.noticeToast,
        tone === 'error' ? styles.noticeToastError : styles.noticeToastWarning,
      ].join(' ')}
      role="status"
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      data-testid="profile-notice"
    >
      <div className={styles.noticeCopy}>
        <div className={styles.noticeTitle}>{title}</div>
        <div className={styles.noticeMessage}>{message}</div>
      </div>
      <button
        type="button"
        className={styles.noticeDismiss}
        aria-label="Скрыть уведомление"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
}

export const ProfilePage = () => {
  const [session, setSession] = useState<AuthSession | null>(() => authService.getSession());
  const [profile, setProfile] = useState<PlayerProfileViewModel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [matchFilter, setMatchFilter] = useState<MatchFilterId>('all');
  const [noticeDismissed, setNoticeDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const currentSession = authService.getSession();
    setSession(currentSession);

    if (!currentSession) {
      setIsLoading(false);
      setProfile(null);
      setWarning(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    setWarning(null);

    void profileService
      .getMyProfile()
      .then((result) => {
        if (cancelled) {
          return;
        }

        if (!result.ok) {
          setProfile(null);
          setError(result.error);
          setWarning(null);
          return;
        }

        setProfile(result.profile);
        setWarning(result.warning);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const fallbackDisplayName = session?.username ?? session?.userId ?? 'Игрок';
  const displayName = profile?.displayName ?? fallbackDisplayName;
  const avatarInitial = profile?.avatarInitial ?? fallbackDisplayName.slice(0, 1).toUpperCase();
  const joinedAtLabel = profile?.joinedAtLabel ?? formatSessionDate(session?.createdAt);
  const profileHint = isLoading
    ? 'Загружаем статистику по аккаунту, колодам и матчам.'
    : error || warning
      ? 'Не все данные профиля удалось загрузить.'
      : 'Профиль собран из живых данных аккаунта, колод и матчей.';
  const noticeTitle = error ? 'Профиль не загружен' : warning ? 'Часть данных недоступна' : null;
  const noticeMessage = error ?? warning;
  const noticeTone = error ? 'error' : 'warning';
  const filteredRecentMatches =
    profile?.recentMatches.filter((match) => {
      if (matchFilter === 'wins') {
        return match.resultTone === 'positive';
      }

      if (matchFilter === 'losses') {
        return match.resultTone === 'negative';
      }

      return true;
    }) ?? [];

  useEffect(() => {
    setNoticeDismissed(false);
  }, [noticeTitle, noticeMessage]);

  return (
    <PageShell
      title="Кабинет мага"
      subtitle="Ваш путь, рабочие колоды и хроника последних дуэлей."
      actions={
        <div className={styles.headerActions}>
          {noticeTitle && noticeMessage && !noticeDismissed ? (
            <ProfileNotice
              title={noticeTitle}
              message={noticeMessage}
              tone={noticeTone}
              onDismiss={() => setNoticeDismissed(true)}
            />
          ) : null}
          <HomeLinkButton />
        </div>
      }
    >
      <Card title="Профиль игрока">
        <div className={styles.profileHeader}>
          <div className={styles.avatar} aria-hidden="true">
            {avatarInitial}
          </div>
          <div className={styles.profileMeta}>
            <div className={styles.profileName}>{displayName}</div>
            <div className={styles.metaRow}>
              <span>В академии с {joinedAtLabel}</span>
            </div>
            <div className={styles.metaHint}>{profileHint}</div>
          </div>
        </div>
      </Card>

      {!session ? (
        <Card title="Профиль недоступен">
          <p className={styles.emptyState}>
            Войдите в аккаунт, чтобы увидеть статистику, колоды и историю матчей.
          </p>
        </Card>
      ) : null}

      {session && isLoading ? (
        <Card title="Загрузка">
          <p className={styles.emptyState}>Подтягиваем актуальные данные профиля...</p>
        </Card>
      ) : null}

      {session && !isLoading && profile ? (
        <>
          <Card title="Сводка по матчам">
            <div className={styles.statsGrid}>
              <ProfileStatsGroup title="Общая" items={profile.matchStats} />
              <ProfileStatsGroup title="Результаты" items={profile.resultStats} />
              <ProfileStatsGroup title="Активность" items={profile.activityStats} />
            </div>
          </Card>

          <Card title="Колоды">
            <div className={styles.deckMeta}>
              <span>Всего колод: {profile.totalDecks}</span>
              <span>Последнее обновление: {profile.latestDeckUpdateLabel}</span>
            </div>
            {profile.recentDecks.length > 0 ? (
              <div className={styles.deckList}>
                {profile.recentDecks.map((deck) => (
                  <div className={styles.deckItem} key={deck.id}>
                    <div className={styles.itemHeader}>
                      <div className={styles.itemTitle}>{deck.name}</div>
                      <div className={styles.itemDate}>{deck.updatedAtLabel}</div>
                    </div>
                    <div className={styles.itemMetaRow}>
                      <span>{deck.cardCountLabel}</span>
                      <span>{deck.characterLabel}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.emptyState}>Колод пока нет. Первая колода появится в мастерской.</p>
            )}
          </Card>

          <Card title="Недавние матчи">
            {profile.recentMatches.length > 0 ? (
              <>
                <div className={styles.filterRow}>
                  <button
                    type="button"
                    className={`${styles.filterChip} ${
                      matchFilter === 'all' ? styles.filterChipActive : ''
                    }`.trim()}
                    onClick={() => setMatchFilter('all')}
                  >
                    Все
                  </button>
                  <button
                    type="button"
                    className={`${styles.filterChip} ${
                      matchFilter === 'wins' ? styles.filterChipActive : ''
                    }`.trim()}
                    onClick={() => setMatchFilter('wins')}
                  >
                    Победы
                  </button>
                  <button
                    type="button"
                    className={`${styles.filterChip} ${
                      matchFilter === 'losses' ? styles.filterChipActive : ''
                    }`.trim()}
                    onClick={() => setMatchFilter('losses')}
                  >
                    Поражения
                  </button>
                </div>

                {filteredRecentMatches.length > 0 ? (
                  <div className={styles.matchList}>
                    {filteredRecentMatches.map((match) => (
                      <div className={styles.matchItem} key={match.matchId}>
                        <div className={styles.itemHeader}>
                          <div className={styles.itemHeading}>
                            <div className={styles.itemTitle}>{match.title}</div>
                            <div className={styles.itemSubtitle}>{match.subtitleLabel}</div>
                          </div>
                          <div className={styles.itemDate}>{match.dateLabel}</div>
                        </div>
                        <div className={styles.matchBadges}>
                          <span
                            className={[
                              styles.resultBadge,
                              match.resultTone === 'positive'
                                ? styles.resultBadgePositive
                                : match.resultTone === 'negative'
                                  ? styles.resultBadgeNegative
                                  : styles.resultBadgeNeutral,
                            ].join(' ')}
                          >
                            {match.resultLabel}
                          </span>
                          <span className={styles.statusBadge}>{match.statusLabel}</span>
                        </div>
                        <div className={styles.itemMetaRow}>
                          <span>{match.deckLabel}</span>
                          <span>vs {match.opponentDeckLabel}</span>
                          <span>{match.endReasonLabel}</span>
                        </div>
                        <div className={styles.matchMeta}>
                          {match.subtitleLabel} · {match.metaLabel}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={styles.emptyState}>Под выбранный фильтр матчей пока нет.</p>
                )}
              </>
            ) : (
              <p className={styles.emptyState}>
                Матчей пока нет. Сыграйте первую дуэль, и история появится здесь.
              </p>
            )}
          </Card>
        </>
      ) : null}
    </PageShell>
  );
};
