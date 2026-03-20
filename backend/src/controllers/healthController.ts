import { Request, Response } from 'express';
import { HealthService } from '../services/healthService';
import { ApiResponse, HealthCheckResponse } from '../types';

const healthService = new HealthService();

export const getHealth = async (
  _req: Request,
  res: Response<ApiResponse<HealthCheckResponse>>
): Promise<void> => {
  try {
    const healthData = await healthService.checkHealth();
    
    if (healthData.status === 'ok') {
      res.status(200).json({
        success: true,
        data: healthData,
      });
    } else {
      res.status(500).json({
        success: false,
        data: healthData,
        error: healthData.message,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Health check failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

