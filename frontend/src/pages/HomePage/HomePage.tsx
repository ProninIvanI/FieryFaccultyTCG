import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, SiteHeader, Tooltip } from "@/components";
import { ROUTES, UI_THEMES, type UiTheme } from "@/constants";
import { useUiTheme } from "@/hooks/useUiTheme";
import { authService } from "@/services";
import { type AuthSession } from "@/types";
import { FriendsPanel } from "./FriendsPanel";
import styles from "./HomePage.module.css";

const THEME_PRESENTATION: Record<
  UiTheme,
  {
    title: string;
    subtitle: string;
  }
> = {
  "magical-library": {
    title: "Библиотека",
    subtitle:
      "Тёплый академический архив: латунь, каталоги, витрины и камерный свет.",
  },
  "alchemical-laboratory": {
    title: "Лаборатория",
    subtitle:
      "Стекло, металл и магическая инженерия. Более холодный и экспериментальный тон.",
  },
  "celestial-observatory": {
    title: "Обсерватория",
    subtitle:
      "Небесная глубина, астральный свет и более величественное ощущение академии.",
  },
};

type ThemeSettingsProps = {
  isThemeSettingsOpen: boolean;
  onOpenThemeSettings: () => void;
  onCloseThemeSettings: () => void;
};

export const HomePage = () => {
  const [session, setSession] = useState<AuthSession | null>(() =>
    authService.getSession(),
  );
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [isThemeSettingsOpen, setIsThemeSettingsOpen] = useState(false);

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

  const themeSettingsProps: ThemeSettingsProps = {
    isThemeSettingsOpen,
    onOpenThemeSettings: () => setIsThemeSettingsOpen(true),
    onCloseThemeSettings: () => setIsThemeSettingsOpen(false),
  };

  if (!session) {
    return <PublicHome />;
  }

  return (
    <AuthHome
      session={session}
      logoutError={logoutError}
      onLogout={async () => {
        const result = await authService.logout(session);
        if (!result.ok) {
          setLogoutError(result.error ?? "Не удалось завершить сессию");
          return;
        }

        setLogoutError(null);
        setSession(null);
      }}
      {...themeSettingsProps}
    />
  );
};

const PublicHome = () => {
  return (
    <div className={styles.page}>
      <SiteHeader
        title="Академия Ремесла"
        actions={
          <>
            <Link className={styles.secondary} to={ROUTES.REGISTER}>
              Создать аккаунт
            </Link>
            <Link className={styles.primary} to={ROUTES.LOGIN}>
              Войти
            </Link>
          </>
        }
      />

      <main className={styles.layout}>
        <section className={styles.grid}>
          <Card title="Новости и баланс">
            <ul className={styles.list}>
              <li>Fireball: урон 6 → 5</li>
              <li>Shield: энергия 3 → 4</li>
              <li>Добавлена тестовая школа Металла</li>
            </ul>
          </Card>
          <Card title="Почему стоит войти">
            <p className={styles.paragraph}>
              После авторизации откроются дуэли, мастерская колод, личный
              кабинет и доступ к основным залам академии.
            </p>
          </Card>
        </section>
      </main>

      <footer className={styles.footer}>
        <div>Документация: /docs · Лицензия: ISC</div>
        <div>Контакты: team@academycraft.local</div>
      </footer>
    </div>
  );
};

const AuthHome = ({
  session,
  logoutError,
  onLogout,
  isThemeSettingsOpen,
  onOpenThemeSettings,
  onCloseThemeSettings,
}: {
  session: AuthSession;
  logoutError: string | null;
  onLogout: () => Promise<void>;
} & ThemeSettingsProps) => {
  const displayName = session.username ?? session.userId;

  return (
    <div className={styles.page}>
      <SiteHeader title="Академия Ремесла" />

      <main className={styles.layout}>
        <div className={styles.mainColumn}>
          <section className={styles.sectionsBar}>
            <Link className={styles.sectionChip} to={ROUTES.NEWS}>
              Летопись академии
            </Link>
            <Link className={styles.sectionChip} to={ROUTES.CARDS}>
              Карточный архив
            </Link>
            <Link className={styles.sectionChip} to={ROUTES.DEMO}>
              Путеводитель
            </Link>
          </section>

          <section className={styles.hero}>
            <div className={styles.heroInfo}>
              <div className={styles.heroIntro}>
                <p className={styles.heroEyebrow}>Главный зал академии</p>
                <div className={styles.heroMarks} aria-hidden="true">
                  <span className={styles.heroMark}>Колоды</span>
                  <span className={styles.heroMark}>Архив</span>
                  <span className={styles.heroMark}>Дуэли</span>
                </div>
              </div>
              <h2 className={styles.heroTitle}>Ваш путь к следующей дуэли</h2>
              <p className={styles.heroText}>
                Собирайте колоды, изучайте архив карт и выходите на арену, когда
                всё будет готово к бою.
              </p>
              <div className={styles.heroButtons}>
                <Link className={styles.ctaPrimary} to={ROUTES.PLAY_PVP}>
                  Начать игру (PvP)
                </Link>
                <Link className={styles.ctaOutline} to={ROUTES.PLAY_PVE}>
                  Начать игру (PvE)
                </Link>
                <Link className={styles.ctaGhost} to={ROUTES.PLAY_SIM}>
                  Архив матчей
                </Link>
              </div>
              <div className={styles.secondaryActions}>
                <Link className={styles.secondaryButton} to={ROUTES.DECKS}>
                  Мастерская колод
                </Link>
                <Link className={styles.secondaryButton} to={ROUTES.RULES}>
                  Правила академии
                </Link>
                <Link className={styles.secondaryButton} to={ROUTES.PROFILE}>
                  Кабинет мага
                </Link>
              </div>
            </div>
          </section>
        </div>

        <aside className={styles.sidePanels}>
          <FriendsPanel
            title="Круг магов"
            currentUserId={session.userId}
            displayName={displayName}
            logoutError={logoutError}
            onLogout={onLogout}
            onOpenThemeSettings={onOpenThemeSettings}
            sessionToken={session.token}
          />
        </aside>
      </main>

      {isThemeSettingsOpen ? (
        <ThemeSettingsModal onClose={onCloseThemeSettings} />
      ) : null}
    </div>
  );
};

const ThemeSettingsModal = ({ onClose }: { onClose: () => void }) => {
  const { theme, setTheme } = useUiTheme();

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return (
    <div
      className={styles.settingsOverlay}
      role="presentation"
      onClick={onClose}
    >
      <section
        className={styles.settingsModal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="theme-settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.settingsModalHeader}>
          <div>
            <p className={styles.settingsEyebrow}>Настройки интерфейса</p>
            <h2 className={styles.settingsModalTitle} id="theme-settings-title">
              Тема академии
            </h2>
            <p className={styles.settingsModalSubtitle}>
              Выбери визуальную оболочку проекта. Настройка применяется ко всему
              приложению и сохраняется между сессиями.
            </p>
          </div>
          <button
            className={styles.settingsClose}
            type="button"
            onClick={onClose}
            aria-label="Закрыть настройки"
          >
            ×
          </button>
        </div>

        <div className={styles.themeOptionGrid}>
          {UI_THEMES.map((themeOption) => {
            const presentation = THEME_PRESENTATION[themeOption];
            const isActive = themeOption === theme;

            return (
              <Tooltip
                key={themeOption}
                content={presentation.subtitle}
                bubbleClassName={styles.themeOptionTooltipBubble}
                className={styles.themeOptionTooltipWrap}
                fullWidth
              >
                <button
                  type="button"
                  className={isActive ? styles.themeOptionActive : styles.themeOption}
                  onClick={() => setTheme(themeOption)}
                  aria-pressed={isActive}
                  aria-label={`${presentation.title}. ${presentation.subtitle}`}
                >
                  <span className={styles.themeOptionHeader}>
                    <span className={styles.themeOptionTitle}>
                      {presentation.title}
                    </span>
                    {isActive ? (
                      <span className={styles.themeOptionChip} aria-hidden="true">
                        ✓
                      </span>
                    ) : null}
                  </span>
                </button>
              </Tooltip>
            );
          })}
        </div>

        <div className={styles.settingsFooter}>
          <button className={styles.settingsDone} type="button" onClick={onClose}>
            Готово
          </button>
        </div>
      </section>
    </div>
  );
};
