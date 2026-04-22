import { NextFunction, Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import {
  ApiResponse,
  FriendListResponse,
  FriendMutationResponse,
  FriendRequestListResponse,
  FriendRequestResponse,
} from '../types';
import { FriendService } from '../services/friendService';

const friendService = new FriendService();

const parseLimit = (value: unknown): number | undefined => {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseCursor = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const readStatus = (code: string): number => {
  switch (code) {
    case 'forbidden':
      return 403;
    case 'request_not_found':
    case 'friendship_not_found':
    case 'user_not_found':
      return 404;
    case 'validation_error':
      return 400;
    default:
      return 409;
  }
};

export const listFriends = async (
  req: Request,
  res: Response<ApiResponse<FriendListResponse>>,
  next: NextFunction,
): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const friends = await friendService.listFriends({
      authUserId: authReq.authUser.id,
      limit: parseLimit(req.query.limit),
      cursor: parseCursor(req.query.cursor),
    });

    res.status(200).json({
      success: true,
      data: { friends },
    });
  } catch (error) {
    next(error);
  }
};

export const listIncomingFriendRequests = async (
  req: Request,
  res: Response<ApiResponse<FriendRequestListResponse>>,
  next: NextFunction,
): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const requests = await friendService.listIncomingRequests({
      authUserId: authReq.authUser.id,
      limit: parseLimit(req.query.limit),
      cursor: parseCursor(req.query.cursor),
    });

    res.status(200).json({
      success: true,
      data: { requests },
    });
  } catch (error) {
    next(error);
  }
};

export const listOutgoingFriendRequests = async (
  req: Request,
  res: Response<ApiResponse<FriendRequestListResponse>>,
  next: NextFunction,
): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const requests = await friendService.listOutgoingRequests({
      authUserId: authReq.authUser.id,
      limit: parseLimit(req.query.limit),
      cursor: parseCursor(req.query.cursor),
    });

    res.status(200).json({
      success: true,
      data: { requests },
    });
  } catch (error) {
    next(error);
  }
};

export const createFriendRequest = async (
  req: Request,
  res: Response<ApiResponse<FriendRequestResponse>>,
  next: NextFunction,
): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const username = typeof req.body?.username === 'string' ? req.body.username : '';
    const result = await friendService.sendRequest(authReq.authUser.id, username);
    if (!result.ok) {
      res.status(readStatus(result.code)).json({ success: false, error: result.error, message: result.code });
      return;
    }

    res.status(201).json({
      success: true,
      data: { request: result.data },
    });
  } catch (error) {
    next(error);
  }
};

export const acceptFriendRequest = async (
  req: Request,
  res: Response<ApiResponse<FriendRequestResponse>>,
  next: NextFunction,
): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const result = await friendService.acceptRequest(authReq.authUser.id, req.params.requestId);
    if (!result.ok) {
      res.status(readStatus(result.code)).json({ success: false, error: result.error, message: result.code });
      return;
    }

    res.status(200).json({
      success: true,
      data: { request: result.data },
    });
  } catch (error) {
    next(error);
  }
};

export const declineFriendRequest = async (
  req: Request,
  res: Response<ApiResponse<FriendRequestResponse>>,
  next: NextFunction,
): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const result = await friendService.declineRequest(authReq.authUser.id, req.params.requestId);
    if (!result.ok) {
      res.status(readStatus(result.code)).json({ success: false, error: result.error, message: result.code });
      return;
    }

    res.status(200).json({
      success: true,
      data: { request: result.data },
    });
  } catch (error) {
    next(error);
  }
};

export const cancelFriendRequest = async (
  req: Request,
  res: Response<ApiResponse<FriendRequestResponse>>,
  next: NextFunction,
): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const result = await friendService.cancelRequest(authReq.authUser.id, req.params.requestId);
    if (!result.ok) {
      res.status(readStatus(result.code)).json({ success: false, error: result.error, message: result.code });
      return;
    }

    res.status(200).json({
      success: true,
      data: { request: result.data },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteFriend = async (
  req: Request,
  res: Response<ApiResponse<FriendMutationResponse>>,
  next: NextFunction,
): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const result = await friendService.deleteFriend(authReq.authUser.id, req.params.friendUserId);
    if (!result.ok) {
      res.status(readStatus(result.code)).json({ success: false, error: result.error, message: result.code });
      return;
    }

    res.status(200).json({
      success: true,
      data: { message: result.message },
    });
  } catch (error) {
    next(error);
  }
};
