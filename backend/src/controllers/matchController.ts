import { NextFunction, Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import { ApiResponse, MatchListResponse, MatchReplayResponse, MatchResponse } from '../types';
import { MatchService } from '../services/matchService';

const matchService = new MatchService();

export const listMatches = async (
  req: Request,
  res: Response<ApiResponse<MatchListResponse>>,
  next: NextFunction,
): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const matches = await matchService.listByUserId(authReq.authUser.id);

    res.status(200).json({
      success: true,
      data: { matches },
    });
  } catch (error) {
    next(error);
  }
};

export const getMatch = async (
  req: Request,
  res: Response<ApiResponse<MatchResponse>>,
  next: NextFunction,
): Promise<void> => {
  try {
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
  } catch (error) {
    next(error);
  }
};

export const getMatchReplay = async (
  req: Request,
  res: Response<ApiResponse<MatchReplayResponse>>,
  next: NextFunction,
): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const result = await matchService.getReplayByMatchIdForUser(
      authReq.authUser.id,
      req.params.matchId,
    );

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
  } catch (error) {
    next(error);
  }
};
