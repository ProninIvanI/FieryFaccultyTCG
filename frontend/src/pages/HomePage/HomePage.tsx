import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card, FriendListItem, SiteHeader } from "@/components";
import { API_URL, ROUTES } from "@/constants";
import { authService } from "@/services";
import { AuthSession } from "@/types";
import styles from "./HomePage.module.css";

export const HomePage = () => {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  useEffect(() => {
    setSession(authService.getSession());
  }, []);

  if (!session) {
    return <PublicHome />;
  }

  return (
    <AuthHome
      logoutError={logoutError}
      onLogout={async () => {
        if (!session?.token) {
          await authService.logout();
          setLogoutError(null);
          setSession(null);
          return;
        }

        try {
          const response = await fetch(`${API_URL}/api/auth/logout`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.token}`,
              "Content-Type": "application/json",
            },
            body: "{}",
          });

          if (!response.ok && response.status !== 401) {
            setLogoutError("Не удалось завершить сессию");
            return;
          }

          await authService.logout();
          setLogoutError(null);
          setSession(null);
        } catch {
          setLogoutError("Не удалось завершить сессию");
        }
      }}
    />
  );
};

const PublicHome = () => {
  return (
    <div className={styles.page}>
      <SiteHeader
        title="Академия Ремесла"
        subtitle="Коллекционная карточная игра для быстрых экспериментов с механиками, балансом и симуляциями."
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
              После авторизации открывается полный функционал: запуск матчей,
              декбилдер, дебаг-панель, симуляции и реплеи.
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
  logoutError,
  onLogout,
}: {
  logoutError: string | null;
  onLogout: () => Promise<void>;
}) => {
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
        subtitle="Полный режим: запуск матчей, дебаг и симуляции."
        actions={null}
      />

      <main className={styles.layout}>
        <div className={styles.mainColumn}>
          <section className={styles.sectionsBar}>
            <Link className={styles.sectionChip} to={ROUTES.NEWS}>
              Новости и баланс
            </Link>
            <Link className={styles.sectionChip} to={ROUTES.CARDS}>
              Превью карт и персонажей
            </Link>
            <Link className={styles.sectionChip} to={ROUTES.DEMO}>
              Демо-тур
            </Link>
          </section>
          <section className={styles.hero}>
            <div className={styles.heroInfo}>
              <h2 className={styles.heroTitle}>
                Быстрый старт для тестирования карт
              </h2>
              <p className={styles.heroText}>
                Запускайте матчи, собирайте колоды, тестируйте эффекты и быстро
                проверяйте баланс.
              </p>
              <div className={styles.heroButtons}>
                <Link className={styles.ctaPrimary} to={ROUTES.PLAY_PVP}>
                  Начать игру (PvP)
                </Link>
                <Link className={styles.ctaOutline} to={ROUTES.PLAY_PVE}>
                  Начать игру (PvE)
                </Link>
                <Link className={styles.ctaGhost} to={ROUTES.PLAY_SIM}>
                  Simulation / Replay
                </Link>
              </div>
              <div className={styles.secondaryActions}>
                <Link className={styles.secondaryButton} to={ROUTES.DECKS}>
                  Создание колоды
                </Link>
                <Link className={styles.secondaryButton} to={ROUTES.RULES}>
                  Правила игры / справка
                </Link>
                <Link className={styles.secondaryButton} to={ROUTES.PROFILE}>
                  Профиль / Личный кабинет
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
                  <span className={styles.userAvatar}>A</span>
                  <span className={styles.userMeta}>
                    <span className={styles.userName}>Akela</span>
                  </span>
                  <span className={styles.userCaret}>▾</span>
                </button>
                {isMenuOpen ? (
                  <div className={styles.userMenu} role="menu" ref={menuRef}>
                    <div className={styles.userMenuHeader}>
                      <div className={styles.userMenuTitle}>Akela #21635</div>
                      <div className={styles.userMenuSub}>Регион: Европа</div>
                    </div>
                    <div className={styles.userMenuSection}>
                      <button className={styles.menuButton} type="button">
                        Профиль
                      </button>
                      <button className={styles.menuButton} type="button">
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
                  <button className={styles.addFriendPrimary} type="button">
                    Отправить запрос
                  </button>
                  <button
                    className={styles.addFriendSecondary}
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
                <div className={styles.emptyFriends}>Друзья пока не добавлены.</div>
              ) : (
                friends.map((friend) => (
                  <FriendListItem
                    key={friend.id}
                    friend={friend}
                  />
                ))
              )}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
};
