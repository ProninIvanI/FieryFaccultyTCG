import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FriendListItem } from "@/components";
import { ROUTES } from "@/constants";
import { friendService, socialWsService } from "@/services";
import { Friend, FriendRequest, MatchInvite, PresenceState } from "@/types";
import styles from "./HomePage.module.css";

const FRIEND_PAGE_LIMIT = 50;
const MATCH_CONFIRM_STORAGE_PREFIX = "fftcg_match_confirm";

const toFriendSubtitle = (createdAt: string): string => {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return "В списке друзей";
  }

  return `В друзьях с ${date.toLocaleDateString("ru-RU")}`;
};

const toPresenceLabel = (presence: PresenceState | undefined): string => {
  switch (presence) {
    case "online":
      return "Онлайн";
    case "in_match":
      return "В матче";
    default:
      return "Не в сети";
  }
};

const toInviteErrorLabel = (error: string): string => {
  switch (error) {
    case "Invite is available only for friends":
      return "Приглашение в матч доступно только друзьям.";
    case "Target user is already in a match":
      return "Этот друг уже находится в активном матче.";
    case "Target user is offline":
      return "Друг сейчас не в сети.";
    case "Invite already pending":
      return "Приглашение уже отправлено и ожидает ответа.";
    case "Cannot invite yourself":
      return "Нельзя отправить приглашение самому себе.";
    default:
      return error;
  }
};

const toInviteStatusInfoLabel = (status: MatchInvite["status"]): string | null => {
  switch (status) {
    case "consumed":
      return "Матч уже запущен. Если экран боя не открылся, попробуйте зайти в PvP заново.";
    case "expired":
      return "Подготовленная сессия истекла. Отправьте приглашение в матч ещё раз.";
    case "cancelled":
      return "Приглашение было отменено.";
    case "declined":
      return "Приглашение было отклонено.";
    default:
      return null;
  }
};

const MATCH_CONFIRM_STALE_MESSAGE =
  "Подготовленная сессия больше недоступна. Отправьте приглашение ещё раз.";

const pickFirstFriendError = (
  ...results: Array<{ ok: boolean; error?: string }>
): string | null => {
  const failed = results.find((result) => !result.ok);
  return failed && "error" in failed ? failed.error ?? null : null;
};

const loadSocialSnapshot = async (): Promise<{
  friends: Friend[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  error: string | null;
}> => {
  const [friendsResult, incomingResult, outgoingResult] = await Promise.all([
    friendService.listFriends({ limit: FRIEND_PAGE_LIMIT }),
    friendService.listIncomingRequests({ limit: FRIEND_PAGE_LIMIT }),
    friendService.listOutgoingRequests({ limit: FRIEND_PAGE_LIMIT }),
  ]);

  return {
    friends: friendsResult.ok ? friendsResult.data : [],
    incomingRequests: incomingResult.ok ? incomingResult.data : [],
    outgoingRequests: outgoingResult.ok ? outgoingResult.data : [],
    error: pickFirstFriendError(friendsResult, incomingResult, outgoingResult),
  };
};

type FriendsPanelProps = {
  currentUserId: string;
  displayName: string;
  logoutError: string | null;
  onLogout: () => Promise<void>;
  onOpenThemeSettings: () => void;
  sessionToken: string;
};

const upsertInvite = (
  current: MatchInvite[],
  invite: MatchInvite,
): MatchInvite[] => {
  const next = current.filter((item) => item.id !== invite.id);
  return [invite, ...next];
};

const getInvitePeerLabel = (invite: MatchInvite, currentUserId: string): string =>
  invite.inviterUserId === currentUserId
    ? invite.targetUserId
    : invite.inviterUsername ?? invite.inviterUserId;

const resolveInvitePeerLabel = (
  invite: MatchInvite,
  currentUserId: string,
  friends: Friend[],
): string => {
  if (invite.inviterUserId === currentUserId) {
    return (
      friends.find((friend) => friend.userId === invite.targetUserId)?.username ??
      invite.targetUserId
    );
  }

  return invite.inviterUsername ?? invite.inviterUserId;
};

const isConfirmedInviteReady = (
  invite: MatchInvite | null,
): invite is MatchInvite & { sessionId: string; seed: number } =>
  Boolean(invite?.sessionId) && typeof invite?.seed === "number";

const getMatchConfirmStorageKey = (currentUserId: string): string =>
  `${MATCH_CONFIRM_STORAGE_PREFIX}:${currentUserId}`;

export function FriendsPanel({
  currentUserId,
  displayName,
  logoutError,
  onLogout,
  onOpenThemeSettings,
  sessionToken,
}: FriendsPanelProps) {
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAddFriendOpen, setIsAddFriendOpen] = useState(false);
  const [friendNickname, setFriendNickname] = useState("");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [liveInvites, setLiveInvites] = useState<MatchInvite[]>([]);
  const [presenceByUserId, setPresenceByUserId] = useState<
    Record<string, PresenceState>
  >({});
  const [isFriendsLoading, setIsFriendsLoading] = useState(true);
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const [friendActionError, setFriendActionError] = useState<string | null>(null);
  const [isSubmittingFriendRequest, setIsSubmittingFriendRequest] = useState(false);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [activeFriendUserId, setActiveFriendUserId] = useState<string | null>(null);
  const [pendingMatchConfirmation, setPendingMatchConfirmation] =
    useState<MatchInvite | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const handledInviteRedirectIdsRef = useRef(new Set<string>());
  const avatarInitial = displayName.slice(0, 1).toUpperCase();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const rawValue = window.sessionStorage.getItem(
      getMatchConfirmStorageKey(currentUserId),
    );
    if (!rawValue) {
      return;
    }

    try {
      const parsed = JSON.parse(rawValue) as MatchInvite;
      if (isConfirmedInviteReady(parsed)) {
        handledInviteRedirectIdsRef.current.add(parsed.id);
        setPendingMatchConfirmation(parsed);
        setLiveInvites((prev) => upsertInvite(prev, parsed));
      } else {
        window.sessionStorage.removeItem(getMatchConfirmStorageKey(currentUserId));
      }
    } catch {
      window.sessionStorage.removeItem(getMatchConfirmStorageKey(currentUserId));
    }
  }, [currentUserId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storageKey = getMatchConfirmStorageKey(currentUserId);
    if (isConfirmedInviteReady(pendingMatchConfirmation)) {
      window.sessionStorage.setItem(
        storageKey,
        JSON.stringify(pendingMatchConfirmation),
      );
      return;
    }

    window.sessionStorage.removeItem(storageKey);
  }, [currentUserId, pendingMatchConfirmation]);

  const refreshSocialData = async (): Promise<void> => {
    setIsFriendsLoading(true);
    const snapshot = await loadSocialSnapshot();
    setFriends(snapshot.friends);
    setIncomingRequests(snapshot.incomingRequests);
    setOutgoingRequests(snapshot.outgoingRequests);
    setFriendsError(snapshot.error);
    setIsFriendsLoading(false);
  };

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

  useEffect(() => {
    let cancelled = false;

    void loadSocialSnapshot().then((snapshot) => {
      if (cancelled) {
        return;
      }

      setFriends(snapshot.friends);
      setIncomingRequests(snapshot.incomingRequests);
      setOutgoingRequests(snapshot.outgoingRequests);
      setFriendsError(snapshot.error);
      setIsFriendsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = socialWsService.subscribe((event) => {
      if (event.type === "presence") {
        setPresenceByUserId((prev) => {
          const next = { ...prev };
          event.presences.forEach((presence) => {
            next[presence.userId] = presence.status;
          });
          return next;
        });
        return;
      }

      if (event.type === "inviteSnapshot") {
        setLiveInvites(event.invites);
        if (
          pendingMatchConfirmation &&
          !event.invites.some(
            (invite) =>
              invite.id === pendingMatchConfirmation.id &&
              invite.status === "accepted",
          )
        ) {
          setPendingMatchConfirmation(null);
          setFriendActionError(MATCH_CONFIRM_STALE_MESSAGE);
        }
        return;
      }

      if (event.type === "inviteReceived" || event.type === "inviteUpdated") {
        setLiveInvites((prev) => upsertInvite(prev, event.invite));
        if (
          pendingMatchConfirmation?.id === event.invite.id &&
          event.invite.status !== "accepted"
        ) {
          setPendingMatchConfirmation(null);
          const statusInfo = toInviteStatusInfoLabel(event.invite.status);
          if (statusInfo) {
            setFriendActionError(statusInfo);
          }
        }
        if (
          event.type === "inviteUpdated" &&
          event.invite.status === "accepted" &&
          event.invite.sessionId &&
          typeof event.invite.seed === "number" &&
          !handledInviteRedirectIdsRef.current.has(event.invite.id)
        ) {
          handledInviteRedirectIdsRef.current.add(event.invite.id);
          setPendingMatchConfirmation(event.invite);
        }
        return;
      }

      if (event.type === "inviteRejected") {
        setFriendActionError(toInviteErrorLabel(event.error));
      }
    });

    void socialWsService.connect(sessionToken).catch(() => {
      setFriendActionError("Не удалось подключить social realtime");
    });

    return () => {
      unsubscribe();
      socialWsService.disconnect();
    };
  }, [navigate, pendingMatchConfirmation?.id, sessionToken]);

  useEffect(() => {
    if (friends.length === 0) {
      return;
    }

    void socialWsService
      .queryPresence(friends.map((friend) => friend.userId))
      .catch(() => {
        setFriendActionError("Не удалось обновить статусы друзей");
      });
  }, [friends]);

  const pendingLiveInvites = liveInvites.filter(
    (invite) => invite.status === "pending",
  );
  const incomingLiveInvites = pendingLiveInvites.filter(
    (invite) => invite.targetUserId === currentUserId,
  );
  const outgoingLiveInvites = pendingLiveInvites.filter(
    (invite) => invite.inviterUserId === currentUserId,
  );

  return (
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
          <label className={styles.addFriendLabel} htmlFor="friend-nickname">
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
          {friendActionError ? (
            <div className={styles.friendError}>{friendActionError}</div>
          ) : null}
          <div className={styles.addFriendActions}>
            <button
              className={styles.addFriendButton}
              type="button"
              disabled={isSubmittingFriendRequest}
              onClick={async () => {
                setFriendActionError(null);
                setIsSubmittingFriendRequest(true);
                const result = await friendService.sendRequest(friendNickname);
                setIsSubmittingFriendRequest(false);

                if (!result.ok) {
                  setFriendActionError(result.error);
                  return;
                }

                setFriendNickname("");
                setIsAddFriendOpen(false);
                await refreshSocialData();
              }}
            >
              {isSubmittingFriendRequest ? "Отправка..." : "Отправить запрос"}
            </button>
            <button
              className={styles.addFriendGhost}
              type="button"
              onClick={() => {
                setIsAddFriendOpen(false);
                setFriendNickname("");
                setFriendActionError(null);
              }}
            >
              Отмена
            </button>
          </div>
        </div>
      ) : null}

      <div className={styles.friendsList}>
        {friendActionError && !isAddFriendOpen ? (
          <div className={styles.friendError}>{friendActionError}</div>
        ) : null}
        {isConfirmedInviteReady(pendingMatchConfirmation) ? (
          <div className={styles.matchConfirmPanel} data-testid="match-confirm-panel">
            <div className={styles.matchConfirmMeta}>Матч готов</div>
            <strong className={styles.matchConfirmTitle}>
              {`Сессия с ${getInvitePeerLabel(
                pendingMatchConfirmation,
                currentUserId,
              )} уже подготовлена.`}
            </strong>
            <div className={styles.matchConfirmText}>
              Перейти на PvP-экран сейчас или вернуться к этому позже.
            </div>
            <div className={styles.matchConfirmActions}>
              <button
                className={styles.friendActionPrimary}
                type="button"
                onClick={() => {
                  navigate(
                    `${ROUTES.PLAY_PVP}?mode=create&sessionId=${encodeURIComponent(
                      pendingMatchConfirmation.sessionId,
                    )}&seed=${encodeURIComponent(
                      String(pendingMatchConfirmation.seed),
                    )}&autojoin=1&peer=${encodeURIComponent(
                      resolveInvitePeerLabel(
                        pendingMatchConfirmation,
                        currentUserId,
                        friends,
                      ),
                    )}`,
                  );
                  setPendingMatchConfirmation(null);
                }}
              >
                Перейти к матчу
              </button>
              <button
                className={styles.friendActionGhost}
                type="button"
                onClick={() => {
                  setPendingMatchConfirmation(null);
                }}
              >
                Позже
              </button>
            </div>
          </div>
        ) : null}
        {friendsError ? (
          <div className={styles.friendError}>{friendsError}</div>
        ) : null}
        {isFriendsLoading ? (
          <div className={styles.friendsEmpty}>Загружаем социальный профиль...</div>
        ) : (
          <>
            <div className={styles.friendsSection}>
              <div className={styles.friendsSectionTitle}>Приглашения в матч</div>
              {incomingLiveInvites.length === 0 && outgoingLiveInvites.length === 0 ? (
                <div className={styles.friendsEmpty}>
                  Активных приглашений в матч нет.
                </div>
              ) : (
                <>
                  {incomingLiveInvites.map((invite) => (
                    <FriendListItem
                      key={invite.id}
                      friend={{
                        id: invite.id,
                        name: invite.inviterUsername ?? invite.inviterUserId,
                        status: "Приглашает в матч",
                        subtitle: "Live invite",
                      }}
                      actions={
                        <>
                          <button
                            className={styles.friendActionPrimary}
                            type="button"
                            disabled={activeRequestId === invite.id}
                            onClick={async () => {
                              setFriendActionError(null);
                              setActiveRequestId(invite.id);
                              try {
                                await socialWsService.respondToInvite(
                                  invite.id,
                                  "accept",
                                );
                              } catch {
                                setFriendActionError(
                                  "Не удалось принять приглашение",
                                );
                              } finally {
                                setActiveRequestId(null);
                              }
                            }}
                          >
                            Принять
                          </button>
                          <button
                            className={styles.friendActionGhost}
                            type="button"
                            disabled={activeRequestId === invite.id}
                            onClick={async () => {
                              setFriendActionError(null);
                              setActiveRequestId(invite.id);
                              try {
                                await socialWsService.respondToInvite(
                                  invite.id,
                                  "decline",
                                );
                              } catch {
                                setFriendActionError(
                                  "Не удалось отклонить приглашение",
                                );
                              } finally {
                                setActiveRequestId(null);
                              }
                            }}
                          >
                            Отклонить
                          </button>
                        </>
                      }
                    />
                  ))}
                  {outgoingLiveInvites.map((invite) => (
                    <FriendListItem
                      key={invite.id}
                      friend={{
                        id: invite.id,
                        name: invite.targetUserId,
                        status: "Ждет ответа на приглашение",
                        subtitle: "Live invite",
                      }}
                      actions={
                        <button
                          className={styles.friendActionGhost}
                          type="button"
                          disabled={activeRequestId === invite.id}
                          onClick={async () => {
                            setFriendActionError(null);
                            setActiveRequestId(invite.id);
                            try {
                              await socialWsService.cancelInvite(invite.id);
                            } catch {
                              setFriendActionError(
                                "Не удалось отменить приглашение",
                              );
                            } finally {
                              setActiveRequestId(null);
                            }
                          }}
                        >
                          Отменить
                        </button>
                      }
                    />
                  ))}
                </>
              )}
            </div>

            <div className={styles.friendsSection}>
              <div className={styles.friendsSectionTitle}>Входящие заявки</div>
              {incomingRequests.length === 0 ? (
                <div className={styles.friendsEmpty}>Новых заявок пока нет.</div>
              ) : (
                incomingRequests.map((request) => (
                  <FriendListItem
                    key={request.id}
                    friend={{
                      id: request.id,
                      name: request.senderUsername,
                      status: "Хочет в друзья",
                      subtitle: "Входящая заявка",
                    }}
                    actions={
                      <>
                        <button
                          className={styles.friendActionPrimary}
                          type="button"
                          disabled={activeRequestId === request.id}
                          onClick={async () => {
                            setFriendActionError(null);
                            setActiveRequestId(request.id);
                            const result = await friendService.acceptRequest(
                              request.id,
                            );
                            setActiveRequestId(null);

                            if (!result.ok) {
                              setFriendActionError(result.error);
                              return;
                            }

                            await refreshSocialData();
                          }}
                        >
                          Принять
                        </button>
                        <button
                          className={styles.friendActionGhost}
                          type="button"
                          disabled={activeRequestId === request.id}
                          onClick={async () => {
                            setFriendActionError(null);
                            setActiveRequestId(request.id);
                            const result = await friendService.declineRequest(
                              request.id,
                            );
                            setActiveRequestId(null);

                            if (!result.ok) {
                              setFriendActionError(result.error);
                              return;
                            }

                            await refreshSocialData();
                          }}
                        >
                          Отклонить
                        </button>
                      </>
                    }
                  />
                ))
              )}
            </div>

            <div className={styles.friendsSection}>
              <div className={styles.friendsSectionTitle}>Друзья</div>
              {friends.length === 0 ? (
                <div className={styles.friendsEmpty}>Друзья пока не добавлены.</div>
              ) : (
                friends.map((friend) => (
                  (() => {
                    const friendPresence = presenceByUserId[friend.userId];
                    const isInviteDisabled =
                      activeFriendUserId === friend.userId ||
                      friendPresence === "offline" ||
                      friendPresence === "in_match";

                    return (
                  <FriendListItem
                    key={friend.userId}
                    friend={{
                      id: friend.userId,
                      name: friend.username,
                      status: toPresenceLabel(friendPresence),
                      subtitle: toFriendSubtitle(friend.createdAt),
                    }}
                    actions={
                      <>
                        <button
                          className={styles.friendActionPrimary}
                          type="button"
                          disabled={isInviteDisabled}
                          onClick={async () => {
                            setFriendActionError(null);
                            setActiveFriendUserId(friend.userId);
                            try {
                              await socialWsService.sendMatchInvite(
                                friend.userId,
                              );
                            } catch {
                              setFriendActionError(
                                "Не удалось отправить приглашение в матч",
                              );
                            } finally {
                              setActiveFriendUserId(null);
                            }
                          }}
                        >
                          {friendPresence === "in_match"
                            ? "В матче"
                            : friendPresence === "offline"
                              ? "Не в сети"
                              : "Пригласить"}
                        </button>
                        <button
                          className={styles.friendActionGhost}
                          type="button"
                          disabled={activeFriendUserId === friend.userId}
                          onClick={async () => {
                            setFriendActionError(null);
                            setActiveFriendUserId(friend.userId);
                            const result = await friendService.deleteFriend(
                              friend.userId,
                            );
                            setActiveFriendUserId(null);

                            if (!result.ok) {
                              setFriendActionError(result.error);
                              return;
                            }

                            await refreshSocialData();
                          }}
                        >
                          Удалить
                        </button>
                      </>
                    }
                  />
                    );
                  })()
                ))
              )}
            </div>

            <div className={styles.friendsSection}>
              <div className={styles.friendsSectionTitle}>Исходящие</div>
              {outgoingRequests.length === 0 ? (
                <div className={styles.friendsEmpty}>
                  Активных исходящих заявок нет.
                </div>
              ) : (
                outgoingRequests.map((request) => (
                  <FriendListItem
                    key={request.id}
                    friend={{
                      id: request.id,
                      name: request.receiverUsername,
                      status: "Ожидает ответа",
                      subtitle: "Исходящая заявка",
                    }}
                    actions={
                      <button
                        className={styles.friendActionGhost}
                        type="button"
                        disabled={activeRequestId === request.id}
                        onClick={async () => {
                          setFriendActionError(null);
                          setActiveRequestId(request.id);
                          const result = await friendService.cancelRequest(
                            request.id,
                          );
                          setActiveRequestId(null);

                          if (!result.ok) {
                            setFriendActionError(result.error);
                            return;
                          }

                          await refreshSocialData();
                        }}
                      >
                        Отменить
                      </button>
                    }
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
