import axios, {
  AxiosError,
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import { API_URL } from '@/constants';
import { ApiResponse } from '@/types';
import { readStoredSession } from '../authSession';

const axiosInstance: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

axiosInstance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const session = readStoredSession();
    if (session?.token) {
      config.headers.Authorization = `Bearer ${session.token}`;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

axiosInstance.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => response,
  (error: AxiosError<ApiResponse>) => {
    if (error.response) {
      const { status, data } = error.response;
      return Promise.reject({
        success: false,
        error: data?.error || data?.message || `Request failed with status ${status}`,
        status,
      });
    }

    if (error.request) {
      return Promise.reject({
        success: false,
        error: 'Network error. Please check your internet connection.',
      });
    }

    return Promise.reject({
      success: false,
      error: error.message || 'An unexpected error occurred',
    });
  },
);

export default axiosInstance;
