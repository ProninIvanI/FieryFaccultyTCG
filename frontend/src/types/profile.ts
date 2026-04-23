import { UserAccount } from './auth';

export interface ProfileStatItem {
  label: string;
  value: string;
}

export interface ProfileDeckSummaryItem {
  id: string;
  name: string;
  cardCountLabel: string;
  characterLabel: string;
  updatedAtLabel: string;
}

export interface ProfileRecentMatchItem {
  matchId: string;
  title: string;
  subtitleLabel: string;
  opponentLabel: string;
  opponentDeckLabel: string;
  resultLabel: string;
  resultTone: 'positive' | 'negative' | 'neutral';
  statusLabel: string;
  endReasonLabel: string;
  dateLabel: string;
  deckLabel: string;
  metaLabel: string;
}

export interface PlayerProfileViewModel {
  user: UserAccount;
  displayName: string;
  avatarInitial: string;
  joinedAtLabel: string;
  accountStats: ProfileStatItem[];
  matchStats: ProfileStatItem[];
  resultStats: ProfileStatItem[];
  activityStats: ProfileStatItem[];
  totalDecks: number;
  latestDeckUpdateLabel: string;
  recentDecks: ProfileDeckSummaryItem[];
  recentMatches: ProfileRecentMatchItem[];
}
