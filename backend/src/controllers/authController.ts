import { Request, Response } from 'express';
import { readBearerToken } from '../middlewares/requireAuth';
import { AuthService } from '../services/authService';
import { ApiResponse, AuthResponse, AuthenticatedUserResponse } from '../types';

const authService = new AuthService();

export const register = async (
  req: Request,
  res: Response<ApiResponse<AuthResponse>>,
): Promise<void> => {
  const { email, username, password } = req.body as {
    email?: unknown;
    username?: unknown;
    password?: unknown;
  };

  if (typeof email !== 'string' || typeof username !== 'string' || typeof password !== 'string') {
    res.status(400).json({ success: false, error: 'Некорректный payload регистрации' });
    return;
  }

  const result = await authService.register({ email, username, password });
  if (!result.ok) {
    res.status(409).json({ success: false, error: result.error });
    return;
  }

  res.status(201).json({ success: true, data: result.data });
};

export const login = async (
  req: Request,
  res: Response<ApiResponse<AuthResponse>>,
): Promise<void> => {
  const { email, password } = req.body as {
    email?: unknown;
    password?: unknown;
  };

  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ success: false, error: 'Некорректный payload входа' });
    return;
  }

  const result = await authService.login({ email, password });
  if (!result.ok) {
    res.status(401).json({ success: false, error: result.error });
    return;
  }

  res.status(200).json({ success: true, data: result.data });
};

export const me = async (
  req: Request,
  res: Response<ApiResponse<AuthenticatedUserResponse>>,
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

  res.status(200).json({ success: true, data: { user } });
};

export const logout = async (
  req: Request,
  res: Response<ApiResponse<{ message: string }>>,
): Promise<void> => {
  const token = readBearerToken(req);
  if (!token) {
    res.status(401).json({ success: false, error: 'Не авторизован' });
    return;
  }

  const result = await authService.logout(token);
  if (!result.ok) {
    res.status(401).json({ success: false, error: result.error });
    return;
  }

  res.status(200).json({ success: true, data: { message: 'Сессия завершена' } });
};
