// Настройка axios instance с базовой конфигурацией

import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import { API_URL } from '@/constants';
import { ApiResponse } from '@/types';

// Создаем axios instance с базовой конфигурацией
const axiosInstance: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 10000, // 10 секунд
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - выполняется перед каждым запросом
axiosInstance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Здесь можно добавить токен авторизации, логирование и т.д.
    // Пример:
    // const token = localStorage.getItem('token');
    // if (token) {
    //   config.headers.Authorization = `Bearer ${token}`;
    // }
    
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// Response interceptor - выполняется после каждого ответа
axiosInstance.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    // Если ответ успешный, просто возвращаем его
    return response;
  },
  (error: AxiosError<ApiResponse>) => {
    // Обработка ошибок
    if (error.response) {
      // Сервер ответил с кодом ошибки
      const { status, data } = error.response;
      
      // Можно добавить специфичную обработку для разных статусов
      switch (status) {
        case 401:
          // Неавторизован - можно перенаправить на страницу входа
          // window.location.href = '/login';
          break;
        case 403:
          // Доступ запрещен
          break;
        case 404:
          // Ресурс не найден
          break;
        case 500:
          // Внутренняя ошибка сервера
          break;
        default:
          break;
      }
      
      // Возвращаем ошибку с данными от сервера
      return Promise.reject({
        success: false,
        error: data?.error || data?.message || `Request failed with status ${status}`,
        status,
      });
    } else if (error.request) {
      // Запрос был отправлен, но ответа не получено
      return Promise.reject({
        success: false,
        error: 'Network error. Please check your internet connection.',
      });
    } else {
      // Ошибка при настройке запроса
      return Promise.reject({
        success: false,
        error: error.message || 'An unexpected error occurred',
      });
    }
  }
);

export default axiosInstance;






