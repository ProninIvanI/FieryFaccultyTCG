// API клиент с типизированными методами

import axiosInstance from './axiosInstance';
import { ApiResponse } from '@/types';
import { AxiosRequestConfig } from 'axios';

class ApiClient {
  /**
   * GET запрос
   */
  async get<T>(endpoint: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response = await axiosInstance.get<ApiResponse<T>>(endpoint, config);
      
      // Если backend вернул данные в формате ApiResponse, возвращаем как есть
      if (response.data && typeof response.data === 'object' && 'success' in response.data) {
        const apiResponse = response.data as ApiResponse<T>;
        if (typeof apiResponse.success === 'boolean') {
          return apiResponse;
        }
      }
      
      // Иначе оборачиваем в ApiResponse формат
      return {
        success: true,
        data: response.data as T,
      };
    } catch (error) {
      // Ошибки уже обработаны в interceptor
      return error as ApiResponse<T>;
    }
  }

  /**
   * POST запрос
   */
  async post<T>(endpoint: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response = await axiosInstance.post<ApiResponse<T>>(endpoint, data, config);
      
      if (response.data && typeof response.data === 'object' && 'success' in response.data) {
        const apiResponse = response.data as ApiResponse<T>;
        if (typeof apiResponse.success === 'boolean') {
          return apiResponse;
        }
      }
      
      return {
        success: true,
        data: response.data as T,
      };
    } catch (error) {
      return error as ApiResponse<T>;
    }
  }

  /**
   * PUT запрос
   */
  async put<T>(endpoint: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response = await axiosInstance.put<ApiResponse<T>>(endpoint, data, config);
      
      if (response.data && typeof response.data === 'object' && 'success' in response.data) {
        const apiResponse = response.data as ApiResponse<T>;
        if (typeof apiResponse.success === 'boolean') {
          return apiResponse;
        }
      }
      
      return {
        success: true,
        data: response.data as T,
      };
    } catch (error) {
      return error as ApiResponse<T>;
    }
  }

  /**
   * PATCH запрос
   */
  async patch<T>(endpoint: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response = await axiosInstance.patch<ApiResponse<T>>(endpoint, data, config);
      
      if (response.data && typeof response.data === 'object' && 'success' in response.data) {
        const apiResponse = response.data as ApiResponse<T>;
        if (typeof apiResponse.success === 'boolean') {
          return apiResponse;
        }
      }
      
      return {
        success: true,
        data: response.data as T,
      };
    } catch (error) {
      return error as ApiResponse<T>;
    }
  }

  /**
   * DELETE запрос
   */
  async delete<T>(endpoint: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response = await axiosInstance.delete<ApiResponse<T>>(endpoint, config);
      
      if (response.data && typeof response.data === 'object' && 'success' in response.data) {
        const apiResponse = response.data as ApiResponse<T>;
        if (typeof apiResponse.success === 'boolean') {
          return apiResponse;
        }
      }
      
      return {
        success: true,
        data: response.data as T,
      };
    } catch (error) {
      return error as ApiResponse<T>;
    }
  }
}

// Экспортируем singleton instance
export const apiClient = new ApiClient();

