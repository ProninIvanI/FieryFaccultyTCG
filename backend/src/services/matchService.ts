import {
  CompleteMatchInput,
  CreateMatchRecordInput,
  MatchRecord,
  MatchReplayRecord,
  MatchSummary,
  SaveMatchReplayInput,
} from '../types';
import { matchModel } from '../models/matchModel';

type MatchResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const hasUserAccessToMatch = (match: MatchRecord, userId: string): boolean =>
  match.players.some((player) => player.userId === userId);

export class MatchService {
  async listByUserId(userId: string): Promise<MatchSummary[]> {
    return matchModel.listByUserId(userId);
  }

  async getByMatchIdForUser(userId: string, matchId: string): Promise<MatchResult<MatchRecord>> {
    const match = await matchModel.findByPublicMatchId(matchId);
    if (!match) {
      return { ok: false, error: 'Матч не найден' };
    }

    if (!hasUserAccessToMatch(match, userId)) {
      return { ok: false, error: 'Нет доступа к этому матчу' };
    }

    return { ok: true, data: match };
  }

  async getReplayByMatchIdForUser(
    userId: string,
    matchId: string,
  ): Promise<MatchResult<MatchReplayRecord>> {
    const match = await matchModel.findByPublicMatchId(matchId);
    if (!match) {
      return { ok: false, error: 'Матч не найден' };
    }

    if (!hasUserAccessToMatch(match, userId)) {
      return { ok: false, error: 'Нет доступа к replay этого матча' };
    }

    const replay = await matchModel.findReplayByMatchId(match.id);
    if (!replay) {
      return { ok: false, error: 'Replay для матча ещё не сохранён' };
    }

    return { ok: true, data: replay };
  }

  async createMatch(input: CreateMatchRecordInput): Promise<MatchRecord> {
    return matchModel.createMatch(input);
  }

  async completeMatch(matchId: string, input: CompleteMatchInput): Promise<MatchRecord | null> {
    return matchModel.completeMatch(matchId, input);
  }

  async saveReplay(input: SaveMatchReplayInput): Promise<MatchReplayRecord> {
    return matchModel.saveReplay(input);
  }
}
