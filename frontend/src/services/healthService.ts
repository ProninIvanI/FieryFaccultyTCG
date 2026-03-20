// Сервис для работы с health check API

import { apiClient } from './api';
import { HealthCheckResponse } from '@/types';

export const healthService = {
  checkHealth: async (): Promise<HealthCheckResponse | null> => {
    const response = await apiClient.get<HealthCheckResponse>('/api/health');
    
    if (response.success && response.data) {
      return response.data;
    }
    
    return null;
  },
};

