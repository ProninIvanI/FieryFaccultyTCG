import { NextFunction, Request, Response } from 'express';
import { AuthService } from '../services/authService';
import { ApiResponse, AuthUser } from '../types';

export type AuthenticatedRequest = Request & {
  authUser: AuthUser;
};

const authService = new AuthService();

export const readBearerToken = (request: Request): string | null => {
  const header = request.header('authorization');
  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
};

export const requireAuth = async (
  req: Request,
  res: Response<ApiResponse>,
  next: NextFunction,
): Promise<void> => {
  const token = readBearerToken(req);
  if (!token) {
    res.status(401).json({ success: false, error: 'Не авторизован' });
    return;
  }

  const user = await authService.getUserByToken(token);
  if (!user) {
    res.status(401).json({ success: false, error: 'Не авторизован' });
    return;
  }

  (req as AuthenticatedRequest).authUser = user;
  next();
};
