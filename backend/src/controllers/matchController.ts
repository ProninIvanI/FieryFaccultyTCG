import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import { MatchListResponse, MatchReplayResponse, MatchResponse, ApiResponse } from '../types';
import { MatchService } from '../services/matchService';

const matchService = new MatchService();

export const listMatches = async (
  req: Request,
  res: Response<ApiResponse<MatchListResponse>>,
): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const matches = await matchService.listByUserId(authReq.authUser.id);

  res.status(200).json({
    success: true,
    data: { matches },
  });
};

export const getMatch = async (
  req: Request,
  res: Response<ApiResponse<MatchResponse>>,
): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const result = await matchService.getByMatchIdForUser(authReq.authUser.id, req.params.matchId);

  if (!result.ok) {
    const status = result.error === 'Матч не найден' ? 404 : 403;
    res.status(status).json({ success: false, error: result.error });
    return;
  }

  res.status(200).json({
    success: true,
    data: { match: result.data },
  });
};

export const getMatchReplay = async (
  req: Request,
  res: Response<ApiResponse<MatchReplayResponse>>,
): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const result = await matchService.getReplayByMatchIdForUser(authReq.authUser.id, req.params.matchId);

  if (!result.ok) {
    const status =
      result.error === 'Матч не найден'
        ? 404
        : result.error === 'Replay для матча ещё не сохранён'
          ? 404
          : 403;
    res.status(status).json({ success: false, error: result.error });
    return;
  }

  res.status(200).json({
    success: true,
    data: { replay: result.data },
  });
};
