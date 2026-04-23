import { apiClient } from '@/services/api';
import { MatchListResponse, MatchSummary } from '@/types';

const DEFAULT_ERROR = 'Не удалось загрузить матчи';

const unwrapMatchList = (
  response: Awaited<ReturnType<typeof apiClient.get<MatchListResponse>>>,
): { ok: true; matches: MatchSummary[] } | { ok: false; error: string } => {
  if (!response.success || !response.data) {
    return { ok: false, error: response.error ?? DEFAULT_ERROR };
  }

  return { ok: true, matches: response.data.matches };
};

export const matchService = {
  async list(): Promise<{ ok: true; matches: MatchSummary[] } | { ok: false; error: string }> {
    return unwrapMatchList(await apiClient.get<MatchListResponse>('/api/matches'));
  },
};
