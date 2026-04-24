import { apiClient } from '@/services/api';
import {
  MatchPlayerRecord,
  MatchSummary,
  PlayerProfileViewModel,
  ProfileDeckSummaryItem,
  ProfileRecentMatchItem,
  UserAccount,
  UserDeck,
} from '@/types';
import { deckService } from './deckService';
import { matchService } from './matchService';

type AuthMeResponse = {
  user: UserAccount;
};

const DEFAULT_ERROR = 'Не удалось загрузить профиль игрока';
const RECENT_DECKS_LIMIT = 3;
const RECENT_MATCHES_LIMIT = 5;

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const resolveIsoDate = (value: string | null | undefined): number => {
  if (!value) {
    return 0;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const formatDateLabel = (value: string | null | undefined): string => {
  if (!value) {
    return '—';
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return '—';
  }

  return dateFormatter.format(new Date(timestamp));
};

const formatDateTimeLabel = (value: string | null | undefined): string => {
  if (!value) {
    return '—';
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return '—';
  }

  return dateTimeFormatter.format(new Date(timestamp));
};

const formatPercentLabel = (value: number): string => `${Math.round(value)}%`;

const normalizeIssueText = (value: string): string => {
  const normalized = value.trim().replace(/[.\s]+$/u, '');

  if (normalized.toLowerCase() === 'internal server error') {
    return 'сервер временно не отдал данные';
  }

  return normalized;
};

const resolveProfileWarning = (
  decksResponse: { ok: true; decks: UserDeck[] } | { ok: false; error: string },
  matchesResponse: { ok: true; matches: MatchSummary[] } | { ok: false; error: string },
): string | null => {
  const failedParts: Array<{ label: string; error: string }> = [];

  if (!decksResponse.ok) {
    failedParts.push({
      label: 'раздел «Колоды»',
      error: normalizeIssueText(decksResponse.error),
    });
  }

  if (!matchesResponse.ok) {
    failedParts.push({
      label: 'история матчей и статистика',
      error: normalizeIssueText(matchesResponse.error),
    });
  }

  if (failedParts.length === 0) {
    return null;
  }

  if (failedParts.length === 1) {
    const [issue] = failedParts;
    return `Не загрузились ${issue.label}: ${issue.error}.`;
  }

  const uniqueErrors = [...new Set(failedParts.map((issue) => issue.error))];
  if (uniqueErrors.length === 1) {
    return `Не загрузились колоды, история матчей и статистика: ${uniqueErrors[0]}.`;
  }

  return failedParts.map((issue) => `${issue.label}: ${issue.error}.`).join(' ');
};

const formatMatchResult = (
  player: MatchPlayerRecord | undefined,
  match: MatchSummary,
): { label: string; tone: ProfileRecentMatchItem['resultTone'] } => {
  if (!player) {
    return { label: 'Неизвестно', tone: 'neutral' };
  }

  switch (player.finishResult) {
    case 'win':
      return { label: 'Победа', tone: 'positive' };
    case 'loss':
      return { label: 'Поражение', tone: 'negative' };
    case 'draw':
      return { label: 'Ничья', tone: 'neutral' };
    case 'abandoned':
      return { label: 'Матч покинут', tone: 'negative' };
    case 'pending':
      return match.status === 'active'
        ? { label: 'В процессе', tone: 'neutral' }
        : { label: 'Ожидается итог', tone: 'neutral' };
    default:
      return { label: 'Неизвестно', tone: 'neutral' };
  }
};

const formatStatusLabel = (status: MatchSummary['status']): string => {
  switch (status) {
    case 'finished':
      return 'Завершён';
    case 'active':
      return 'Активный';
    case 'pending':
      return 'Ожидание';
    case 'aborted':
      return 'Прерван';
    default:
      return '—';
  }
};

const formatEndReasonLabel = (endReason: MatchSummary['endReason']): string => {
  switch (endReason) {
    case 'victory':
      return 'Обычная победа';
    case 'surrender':
      return 'Победа после сдачи';
    case 'disconnect':
      return 'Победа после отключения';
    case 'abort':
      return 'Матч отменён';
    case 'error':
      return 'Остановлен из-за ошибки';
    default:
      return 'Причина не указана';
  }
};

const buildDeckSummaryItem = (deck: UserDeck): ProfileDeckSummaryItem => {
  const cardCount = deck.cards.reduce((total, card) => total + card.quantity, 0);
  return {
    id: deck.id,
    name: deck.name,
    cardCountLabel: `${cardCount} карт`,
    characterLabel: deck.characterId
      ? `Персонаж ${deck.characterId}`
      : 'Персонаж не выбран',
    updatedAtLabel: formatDateLabel(deck.updatedAt),
  };
};

const buildRecentMatchItem = (
  match: MatchSummary,
  currentUserId: string,
  index: number,
): ProfileRecentMatchItem => {
  const player = match.players.find((entry) => entry.userId === currentUserId);
  const opponent = match.players.find((entry) => entry.userId !== currentUserId);
  const opponentLabel =
    opponent?.username?.trim() || opponent?.userId || 'Соперник не определён';
  const result = formatMatchResult(player, match);
  const sortDate = match.finishedAt ?? match.updatedAt ?? match.startedAt ?? match.createdAt;
  const shortMatchId = match.matchId.slice(-6).toUpperCase();

  return {
    matchId: match.matchId,
    title: `Против ${opponentLabel}`,
    subtitleLabel: shortMatchId ? `Матч ${shortMatchId}` : `Матч ${index + 1}`,
    opponentLabel,
    opponentDeckLabel: opponent?.deckNameSnapshot ?? 'Колода соперника не сохранена',
    resultLabel: result.label,
    resultTone: result.tone,
    statusLabel: formatStatusLabel(match.status),
    endReasonLabel: formatEndReasonLabel(match.endReason),
    dateLabel: formatDateTimeLabel(sortDate),
    deckLabel: player?.deckNameSnapshot ?? 'Колода не сохранена',
    metaLabel: `${match.turnCount} ходов · ${match.actionCount} действий`,
  };
};

const buildProfileViewModel = (
  user: UserAccount,
  decks: UserDeck[],
  matches: MatchSummary[],
): PlayerProfileViewModel => {
  const sortedDecks = [...decks].sort(
    (left, right) => resolveIsoDate(right.updatedAt) - resolveIsoDate(left.updatedAt),
  );
  const sortedMatches = [...matches].sort((left, right) => {
    const rightValue = resolveIsoDate(
      right.finishedAt ?? right.updatedAt ?? right.startedAt ?? right.createdAt,
    );
    const leftValue = resolveIsoDate(
      left.finishedAt ?? left.updatedAt ?? left.startedAt ?? left.createdAt,
    );
    return rightValue - leftValue;
  });

  const finishedMatches = sortedMatches.filter((match) => match.status === 'finished');
  const wins = finishedMatches.filter((match) =>
    match.players.some((player) => player.userId === user.id && player.finishResult === 'win'),
  ).length;
  const losses = finishedMatches.filter((match) =>
    match.players.some((player) => player.userId === user.id && player.finishResult === 'loss'),
  ).length;
  const draws = finishedMatches.filter((match) =>
    match.players.some((player) => player.userId === user.id && player.finishResult === 'draw'),
  ).length;
  const abortedMatches = sortedMatches.filter((match) => match.status === 'aborted').length;
  const activeMatches = sortedMatches.filter((match) => match.status === 'active').length;
  const lastMatch = sortedMatches[0];

  return {
    user,
    displayName: user.username || user.id,
    avatarInitial: (user.username || user.id).slice(0, 1).toUpperCase(),
    joinedAtLabel: formatDateLabel(user.createdAt),
    matchStats: [
      { label: 'Всего матчей', value: String(sortedMatches.length) },
      { label: 'Завершено', value: String(finishedMatches.length) },
      { label: 'Активных', value: String(activeMatches) },
    ],
    resultStats: [
      { label: 'Победы', value: String(wins) },
      { label: 'Поражения', value: String(losses) },
      { label: 'Ничьи', value: String(draws) },
    ],
    activityStats: [
      {
        label: 'Винрейт',
        value:
          finishedMatches.length > 0
            ? formatPercentLabel((wins / finishedMatches.length) * 100)
            : '—',
      },
      { label: 'Прервано', value: String(abortedMatches) },
      {
        label: 'Последний матч',
        value: lastMatch ? formatDateLabel(lastMatch.finishedAt ?? lastMatch.createdAt) : '—',
      },
    ],
    totalDecks: sortedDecks.length,
    latestDeckUpdateLabel: sortedDecks[0] ? formatDateLabel(sortedDecks[0].updatedAt) : '—',
    recentDecks: sortedDecks.slice(0, RECENT_DECKS_LIMIT).map(buildDeckSummaryItem),
    recentMatches: sortedMatches
      .slice(0, RECENT_MATCHES_LIMIT)
      .map((match, index) => buildRecentMatchItem(match, user.id, index)),
  };
};

export const profileService = {
  async getMyProfile(): Promise<
    { ok: true; profile: PlayerProfileViewModel; warning: string | null } | { ok: false; error: string }
  > {
    const [userResponse, decksResponse, matchesResponse] = await Promise.all([
      apiClient.get<AuthMeResponse>('/api/auth/me'),
      deckService.list(),
      matchService.list(),
    ]);

    if (!userResponse.success || !userResponse.data?.user) {
      return { ok: false, error: userResponse.error ?? DEFAULT_ERROR };
    }

    const decks = decksResponse.ok ? decksResponse.decks : [];
    const matches = matchesResponse.ok ? matchesResponse.matches : [];

    return {
      ok: true,
      profile: buildProfileViewModel(userResponse.data.user, decks, matches),
      warning: resolveProfileWarning(decksResponse, matchesResponse),
    };
  },
};
