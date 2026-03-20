import { pool } from '../config/database';
import { HealthCheckResponse } from '../types';
import { logger } from '../utils/logger';

export class HealthService {
  async checkHealth(): Promise<HealthCheckResponse> {
    try {
      // Проверка подключения к БД
      await pool.query('SELECT 1');
      logger.info('Health check: Database connected');
      
      return {
        status: 'ok',
        message: 'Server is running',
        database: 'connected',
      };
    } catch (error) {
      logger.error('Health check failed:', error);
      
      return {
        status: 'error',
        message: 'Server is running but database connection failed',
        database: 'disconnected',
      };
    }
  }
}






