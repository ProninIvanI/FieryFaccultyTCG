import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card, FriendListItem, SiteHeader } from "@/components";
import { ROUTES, UI_THEMES, type UiTheme } from "@/constants";
import { useUiTheme } from "@/hooks/useUiTheme";
import { authService } from "@/services";
import { AuthSession } from "@/types";
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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAddFriendOpen, setIsAddFriendOpen] = useState(false);
  const [friendNickname, setFriendNickname] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const friends: Array<{
    id: string;
    name: string;
    status: string;
    subtitle?: string;
  }> = [];
  const displayName = session.username ?? session.userId;
  const avatarInitial = displayName.slice(0, 1).toUpperCase();

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (
        menuRef.current?.contains(target) ||
        menuButtonRef.current?.contains(target)
      ) {
        return;
      }

      setIsMenuOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMenuOpen]);

  return (
    <div className={styles.page}>
      <SiteHeader
        title="Академия Ремесла"
      />

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
              <h2 className={styles.heroTitle}>
                Ваш путь к следующей дуэли
              </h2>
              <p className={styles.heroText}>
                Собирайте колоды, изучайте архив карт и выходите на арену,
                когда всё будет готово к бою.
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
          <div className={styles.friendsPanel}>
            <div className={styles.friendsHeader}>
              <div className={styles.userChip}>
                <button
                  className={styles.userButton}
                  type="button"
                  onClick={() => setIsMenuOpen((prev) => !prev)}
                  aria-haspopup="menu"
                  aria-expanded={isMenuOpen}
                  ref={menuButtonRef}
                >
                  <span className={styles.userAvatar}>{avatarInitial}</span>
                  <span className={styles.userMeta}>
                    <span className={styles.userName}>{displayName}</span>
                  </span>
                  <span className={styles.userCaret}>▾</span>
                </button>

                {isMenuOpen ? (
                  <div className={styles.userMenu} role="menu" ref={menuRef}>
                    <div className={styles.userMenuHeader}>
                      <div className={styles.userMenuTitle}>{displayName}</div>
                      <div className={styles.userMenuSub}>Аккаунт активен</div>
                    </div>
                    <div className={styles.userMenuSection}>
                      <button className={styles.menuButton} type="button">
                        Профиль
                      </button>
                      <button
                        className={styles.menuButton}
                        type="button"
                        onClick={() => {
                          setIsMenuOpen(false);
                          onOpenThemeSettings();
                        }}
                      >
                        Настройки
                      </button>
                      <button className={styles.menuButton} type="button">
                        Список друзей
                      </button>
                    </div>
                    {logoutError ? (
                      <div className={styles.userMenuSection}>{logoutError}</div>
                    ) : null}
                    <div className={styles.userMenuFooter}>
                      <button
                        className={styles.menuLogout}
                        type="button"
                        onClick={onLogout}
                      >
                        Выйти
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <button className={styles.iconButton} type="button">
                Поиск
              </button>
            </div>

            <div className={styles.friendsTools}>
              <button
                className={styles.toolButton}
                type="button"
                onClick={() => setIsAddFriendOpen((prev) => !prev)}
              >
                Добавить друга
              </button>
            </div>

            {isAddFriendOpen ? (
              <div className={styles.addFriendPanel}>
                <label
                  className={styles.addFriendLabel}
                  htmlFor="friend-nickname"
                >
                  Никнейм друга
                </label>
                <input
                  id="friend-nickname"
                  className={styles.addFriendInput}
                  type="text"
                  placeholder="Введите никнейм"
                  value={friendNickname}
                  onChange={(event) => setFriendNickname(event.target.value)}
                />
                <div className={styles.addFriendActions}>
                  <button className={styles.addFriendButton} type="button">
                    Отправить запрос
                  </button>
                  <button
                    className={styles.addFriendGhost}
                    type="button"
                    onClick={() => {
                      setIsAddFriendOpen(false);
                      setFriendNickname("");
                    }}
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : null}

            <div className={styles.friendsList}>
              {friends.length === 0 ? (
                <div className={styles.friendsEmpty}>Друзья пока не добавлены.</div>
              ) : (
                friends.map((friend) => (
                  <FriendListItem key={friend.id} friend={friend} />
                ))
              )}
            </div>
          </div>
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
              <button
                key={themeOption}
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
                <span className={styles.themeOptionTooltip} role="tooltip">
                  {presentation.subtitle}
                </span>
              </button>
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
