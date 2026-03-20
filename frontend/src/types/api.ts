// Типы для API слоя

import { AxiosError } from 'axios';
import { ApiResponse } from './index';

/**
 * Расширенный тип ошибки API
 */
export interface ApiError extends ApiResponse {
  status?: number;
  timestamp?: string;
}

/**
 * Тип для обработки ошибок axios
 */
export type AxiosApiError = AxiosError<ApiResponse>;

/**
 * Конфигурация для API запросов
 */
export interface ApiRequestConfig {
  timeout?: number;
  headers?: Record<string, string>;
  params?: Record<string, unknown>;
}






