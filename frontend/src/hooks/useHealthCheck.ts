// Кастомный хук для проверки здоровья backend

import { useState, useEffect } from 'react';
import { healthService } from '@/services/healthService';
import { HealthCheckResponse } from '@/types';

export const useHealthCheck = () => {
  const [healthStatus, setHealthStatus] = useState<string>('checking...');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [healthData, setHealthData] = useState<HealthCheckResponse | null>(null);

  useEffect(() => {
    const checkHealth = async () => {
      setIsLoading(true);
      try {
        const data = await healthService.checkHealth();
        if (data) {
          setHealthData(data);
          setHealthStatus(data.status === 'ok' ? '✅ Connected' : '❌ Error');
        } else {
          setHealthStatus('❌ Connection failed');
        }
      } catch (error) {
        setHealthStatus('❌ Connection failed');
      } finally {
        setIsLoading(false);
      }
    };

    checkHealth();
  }, []);

  return { healthStatus, isLoading, healthData };
};






