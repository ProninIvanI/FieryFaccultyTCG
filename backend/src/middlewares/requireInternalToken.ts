import { NextFunction, Request, Response } from 'express';
import { serverConfig } from '../config';
import { ApiResponse } from '../types';

export const requireInternalToken = (
  req: Request,
  res: Response<ApiResponse>,
  next: NextFunction,
): void => {
  const token = req.header('x-internal-token');
  if (!token || token !== serverConfig.internalApiToken) {
    res.status(403).json({ success: false, error: 'Forbidden' });
    return;
  }

  next();
};
