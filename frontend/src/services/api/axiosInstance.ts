import axios, {
  AxiosError,
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import { API_URL } from '@/constants';
import { ApiResponse, AuthSession } from '@/types';

const SESSION_KEY = 'fftcg_session';

const getStoredSession = (): AuthSession | null => {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
};

const axiosInstance: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

axiosInstance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const session = getStoredSession();
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
