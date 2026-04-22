import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { FriendListItem, Tooltip } from "@/components";
import { ROUTES } from "@/constants";
import { friendService, socialWsService } from "@/services";
import { Friend, FriendRequest, MatchInvite, PresenceState } from "@/types";
import styles from "./HomePage.module.css";

const FRIEND_PAGE_LIMIT = 50;
const MATCH_CONFIRM_STORAGE_PREFIX = "fftcg_match_confirm";

type FriendsPanelProps = {
  title: string;
  currentUserId: string;
  displayName: string;
  logoutError: string | null;
  onLogout: () => Promise<void>;
  onOpenThemeSettings: () => void;
  sessionToken: string;
};

type SocialTabId = "friends" | "incoming" | "outgoing" | "matches";

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

const upsertInvite = (current: MatchInvite[], invite: MatchInvite): MatchInvite[] => {
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
    return friends.find((friend) => friend.userId === invite.targetUserId)?.username ?? invite.targetUserId;
  }

  return invite.inviterUsername ?? invite.inviterUserId;
};

const isConfirmedInviteReady = (
  invite: MatchInvite | null,
): invite is MatchInvite & { sessionId: string; seed: number } =>
  Boolean(invite?.sessionId) && typeof invite?.seed === "number";

const getMatchConfirmStorageKey = (currentUserId: string): string =>
  `${MATCH_CONFIRM_STORAGE_PREFIX}:${currentUserId}`;

const FriendsIcon = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true" className={styles.socialTabIconSvg}>
    <path
      d="M6.2 10.1a3.1 3.1 0 1 1 0-6.2 3.1 3.1 0 0 1 0 6.2Zm7.2-.8a2.4 2.4 0 1 1 0-4.8 2.4 2.4 0 0 1 0 4.8ZM2.8 15.8c0-2 2-3.6 4.5-3.6s4.5 1.6 4.5 3.6v.3H2.8v-.3Zm10.1.3c0-1.1-.4-2.1-1.1-2.9 1.8.1 3.2 1.1 3.2 2.6v.3h-2.1v-.1Z"
      fill="currentColor"
    />
  </svg>
);

const IncomingIcon = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true" className={styles.socialTabIconSvg}>
    <path
      d="M10 3.2a.8.8 0 0 1 .8.8v7.1l2.5-2.5a.8.8 0 1 1 1.1 1.1l-3.9 3.9a.8.8 0 0 1-1.1 0L5.5 9.7a.8.8 0 0 1 1.1-1.1l2.6 2.5V4a.8.8 0 0 1 .8-.8Zm-5 11.2h10a.8.8 0 1 1 0 1.6H5a.8.8 0 0 1 0-1.6Z"
      fill="currentColor"
    />
  </svg>
);

const OutgoingIcon = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true" className={styles.socialTabIconSvg}>
    <path
      d="M10 16.8a.8.8 0 0 1-.8-.8V8.9L6.6 11.4a.8.8 0 0 1-1.1-1.1l3.9-3.9a.8.8 0 0 1 1.1 0l3.9 3.9a.8.8 0 0 1-1.1 1.1l-2.5-2.5V16a.8.8 0 0 1-.8.8Zm-5-12.8h10a.8.8 0 1 1 0 1.6H5A.8.8 0 0 1 5 4Z"
      fill="currentColor"
    />
  </svg>
);

const MatchInviteIcon = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true" className={styles.socialTabIconSvg}>
    <path
      d="M6 3.1 9 6.2 7.7 7.5 6.8 6.6 4.3 9l1.9 1.9-1.3 1.3L3 10.3a1 1 0 0 1 0-1.4L6 5.9 4.7 4.6 6 3.1Zm8 0 1.3 1.5L14 5.9l3 3a1 1 0 0 1 0 1.4l-1.9 1.9-1.3-1.3L15.7 9l-2.5-2.4-.9.9L11 6.2l3-3.1ZM9.2 8.6l2.2 2.2-4.9 4.9a1.6 1.6 0 0 1-2.2 0 1.6 1.6 0 0 1 0-2.2l4.9-4.9Zm1.6 2.2L13 8.6l4.9 4.9a1.6 1.6 0 0 1-2.2 2.2l-4.9-4.9Z"
      fill="currentColor"
    />
  </svg>
);

const FriendInviteGlyph = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true" className={styles.friendActionIconSvg}>
    <path
      d="M6 5.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Zm7.5 1a.8.8 0 0 1 .8.8v1.4h1.4a.8.8 0 1 1 0 1.6h-1.4v1.4a.8.8 0 1 1-1.6 0v-1.4h-1.4a.8.8 0 1 1 0-1.6h1.4V7.3a.8.8 0 0 1 .8-.8ZM2.8 15.6c0-1.8 1.7-3.2 3.8-3.2 1.1 0 2.1.4 2.8 1.1-.4.5-.7 1.2-.7 2v.1H2.8Z"
      fill="currentColor"
    />
  </svg>
);

const FriendMenuGlyph = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true" className={styles.friendActionIconSvg}>
    <path
      d="M4.5 10a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm4 0a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm4 0a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z"
      fill="currentColor"
    />
  </svg>
);

type SocialTabConfig = {
  id: SocialTabId;
  label: string;
  count: number;
  needsAttention: boolean;
  icon: ReactNode;
};

export function FriendsPanel({
  title,
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
  const [presenceByUserId, setPresenceByUserId] = useState<Record<string, PresenceState>>({});
  const [isFriendsLoading, setIsFriendsLoading] = useState(true);
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const [friendActionError, setFriendActionError] = useState<string | null>(null);
  const [isSubmittingFriendRequest, setIsSubmittingFriendRequest] = useState(false);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [activeFriendUserId, setActiveFriendUserId] = useState<string | null>(null);
  const [activeFriendMenuUserId, setActiveFriendMenuUserId] = useState<string | null>(null);
  const [pendingMatchConfirmation, setPendingMatchConfirmation] = useState<MatchInvite | null>(null);
  const [activeTab, setActiveTab] = useState<SocialTabId>("friends");
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const handledInviteRedirectIdsRef = useRef(new Set<string>());
  const avatarInitial = displayName.slice(0, 1).toUpperCase();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const rawValue = window.sessionStorage.getItem(getMatchConfirmStorageKey(currentUserId));
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
      window.sessionStorage.setItem(storageKey, JSON.stringify(pendingMatchConfirmation));
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
    setActiveFriendMenuUserId(null);
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

      if (menuRef.current?.contains(target) || menuButtonRef.current?.contains(target)) {
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
            (invite) => invite.id === pendingMatchConfirmation.id && invite.status === "accepted",
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
  }, [pendingMatchConfirmation, sessionToken]);

  useEffect(() => {
    if (friends.length === 0) {
      return;
    }

    void socialWsService.queryPresence(friends.map((friend) => friend.userId)).catch(() => {
      setFriendActionError("Не удалось обновить статусы друзей");
    });
  }, [friends]);

  const pendingLiveInvites = liveInvites.filter((invite) => invite.status === "pending");
  const incomingLiveInvites = pendingLiveInvites.filter((invite) => invite.targetUserId === currentUserId);
  const outgoingLiveInvites = pendingLiveInvites.filter((invite) => invite.inviterUserId === currentUserId);

  const socialTabs: SocialTabConfig[] = [
    {
      id: "friends",
      label: "Друзья",
      count: friends.length,
      needsAttention: false,
      icon: <FriendsIcon />,
    },
    {
      id: "incoming",
      label: "Входящие заявки",
      count: incomingRequests.length,
      needsAttention: incomingRequests.length > 0,
      icon: <IncomingIcon />,
    },
    {
      id: "outgoing",
      label: "Исходящие заявки",
      count: outgoingRequests.length,
      needsAttention: false,
      icon: <OutgoingIcon />,
    },
    {
      id: "matches",
      label: "Приглашения в матч",
      count: incomingLiveInvites.length + outgoingLiveInvites.length,
      needsAttention:
        incomingLiveInvites.length > 0 || isConfirmedInviteReady(pendingMatchConfirmation),
      icon: <MatchInviteIcon />,
    },
  ];

  const renderMatchesTab = () => {
    if (incomingLiveInvites.length === 0 && outgoingLiveInvites.length === 0) {
      return <div className={styles.friendsEmpty}>Активных приглашений в матч нет.</div>;
    }

    return (
      <div className={styles.matchTabLayout}>
        {incomingLiveInvites.length > 0 ? (
          <div className={`${styles.friendsSectionGroup} ${styles.matchTabGroup}`.trim()}>
            <div className={styles.friendsSectionLabel}>Входящие</div>
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
                          await socialWsService.respondToInvite(invite.id, "accept");
                        } catch {
                          setFriendActionError("Не удалось принять приглашение");
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
                          await socialWsService.respondToInvite(invite.id, "decline");
                        } catch {
                          setFriendActionError("Не удалось отклонить приглашение");
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
          </div>
        ) : null}
        {outgoingLiveInvites.length > 0 ? (
          <div className={`${styles.friendsSectionGroup} ${styles.matchTabGroup}`.trim()}>
            <div className={styles.friendsSectionLabel}>Исходящие</div>
            {outgoingLiveInvites.map((invite) => (
              <FriendListItem
                key={invite.id}
                friend={{
                  id: invite.id,
                  name: resolveInvitePeerLabel(invite, currentUserId, friends),
                  status: "Ждёт ответа на приглашение",
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
                        setFriendActionError("Не удалось отменить приглашение");
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
          </div>
        ) : null}
      </div>
    );
  };

  const renderIncomingTab = () => {
    if (incomingRequests.length === 0) {
      return <div className={styles.friendsEmpty}>Новых заявок пока нет.</div>;
    }

    return incomingRequests.map((request) => (
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
                const result = await friendService.acceptRequest(request.id);
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
                const result = await friendService.declineRequest(request.id);
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
    ));
  };

  const renderFriendsTab = () => {
    if (friends.length === 0) {
      return <div className={styles.friendsEmpty}>Друзья пока не добавлены.</div>;
    }

    return friends.map((friend) => {
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
              <Tooltip
                content={
                  friendPresence === "in_match"
                    ? "Друг уже в матче"
                    : friendPresence === "offline"
                      ? "Друг сейчас не в сети"
                      : "Пригласить в матч"
                }
                side="bottom"
              >
                <button
                  className={styles.friendActionIconButtonPrimary}
                  type="button"
                  aria-label={
                    friendPresence === "in_match"
                      ? "В матче"
                      : friendPresence === "offline"
                        ? "Не в сети"
                        : "Пригласить"
                  }
                  disabled={isInviteDisabled}
                  onClick={async () => {
                    setFriendActionError(null);
                    setActiveFriendUserId(friend.userId);
                    try {
                      await socialWsService.sendMatchInvite(friend.userId);
                    } catch {
                      setFriendActionError("Не удалось отправить приглашение в матч");
                    } finally {
                      setActiveFriendUserId(null);
                    }
                  }}
                >
                  <FriendInviteGlyph />
                </button>
              </Tooltip>
              <Tooltip content="Техническое меню" side="bottom">
                <div className={styles.friendTechMenu}>
                  <button
                    className={styles.friendActionIconButtonGhost}
                    type="button"
                    aria-label="Техническое меню друга"
                    aria-haspopup="menu"
                    aria-expanded={activeFriendMenuUserId === friend.userId}
                    onClick={() => {
                      setActiveFriendMenuUserId((current) =>
                        current === friend.userId ? null : friend.userId,
                      );
                    }}
                  >
                    <FriendMenuGlyph />
                  </button>
                  {activeFriendMenuUserId === friend.userId ? (
                    <div className={styles.friendTechMenuPanel} role="menu">
                      <button
                        className={styles.friendTechMenuItemDanger}
                        type="button"
                        role="menuitem"
                        aria-label="Удалить"
                        disabled={activeFriendUserId === friend.userId}
                        onClick={async () => {
                          setFriendActionError(null);
                          setActiveFriendUserId(friend.userId);
                          const result = await friendService.deleteFriend(friend.userId);
                          setActiveFriendUserId(null);

                          if (!result.ok) {
                            setFriendActionError(result.error);
                            return;
                          }

                          await refreshSocialData();
                        }}
                      >
                        Удалить из друзей
                      </button>
                    </div>
                  ) : null}
                </div>
              </Tooltip>
            </>
          }
        />
      );
    });
  };

  const renderOutgoingTab = () => {
    if (outgoingRequests.length === 0) {
      return <div className={styles.friendsEmpty}>Активных исходящих заявок нет.</div>;
    }

    return outgoingRequests.map((request) => (
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
              const result = await friendService.cancelRequest(request.id);
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
    ));
  };

  const renderActiveTab = () => {
    switch (activeTab) {
      case "incoming":
        return renderIncomingTab();
      case "outgoing":
        return renderOutgoingTab();
      case "matches":
        return renderMatchesTab();
      case "friends":
      default:
        return renderFriendsTab();
    }
  };

  const activeTabLabel = socialTabs.find((tab) => tab.id === activeTab)?.label ?? "Друзья";

  return (
    <div className={styles.friendsPanel}>
      <h2 className={styles.friendsPanelTitle}>{title}</h2>

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
            <span className={styles.userCaret}>▼</span>
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
              {logoutError ? <div className={styles.userMenuSection}>{logoutError}</div> : null}
              <div className={styles.userMenuFooter}>
                <button className={styles.menuLogout} type="button" onClick={onLogout}>
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
          {friendActionError ? <div className={styles.friendError}>{friendActionError}</div> : null}
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
              {`Сессия с ${getInvitePeerLabel(pendingMatchConfirmation, currentUserId)} уже подготовлена.`}
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
                      resolveInvitePeerLabel(pendingMatchConfirmation, currentUserId, friends),
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

        <div className={styles.socialTabs} role="tablist" aria-label="Социальная навигация">
          {socialTabs.map((tab) => {
            const isActive = activeTab === tab.id;

            return (
              <Tooltip
                key={tab.id}
                content={tab.label}
                bubbleClassName={styles.socialTabTooltip}
                side="bottom"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-label={tab.label}
                  title={tab.label}
                  onClick={() => setActiveTab(tab.id)}
                  className={[
                    styles.socialTabButton,
                    isActive ? styles.socialTabButtonActive : "",
                    tab.needsAttention ? styles.socialTabButtonAttention : "",
                  ].join(" ").trim()}
                >
                  <span className={styles.socialTabIcon}>{tab.icon}</span>
                  {tab.count > 0 ? (
                    <span
                      className={[
                        styles.socialTabBadge,
                        tab.needsAttention ? styles.socialTabBadgeAttention : "",
                      ].join(" ").trim()}
                    >
                      {tab.count > 9 ? "9+" : tab.count}
                    </span>
                  ) : null}
                  {isActive ? <span className={styles.socialTabLabel}>{tab.label}</span> : null}
                </button>
              </Tooltip>
            );
          })}
        </div>

        {friendsError ? <div className={styles.friendError}>{friendsError}</div> : null}
        {isFriendsLoading ? (
          <div className={styles.friendsEmpty}>Загружаем социальный профиль...</div>
        ) : (
          <div className={styles.socialContentPanel}>
            <div className={styles.friendsSection}>
              <div className={styles.friendsSectionTitle}>{activeTabLabel}</div>
              {renderActiveTab()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
