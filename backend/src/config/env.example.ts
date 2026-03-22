/**
 * Пример конфигурации переменных окружения
 * Скопируйте этот файл в .env и заполните значения
 * 
 * Или создайте .env файл в корне backend/ с следующими переменными:
 */

export const envExample = {
  // Server
  NODE_ENV: 'development', // development | production | test
  PORT: '3001',
  INTERNAL_API_TOKEN: 'dev-internal-token',
  
  // Database
  POSTGRES_USER: 'postgres',
  POSTGRES_HOST: 'postgres', // 'postgres' для Docker, 'localhost' для локальной разработки
  POSTGRES_DB: 'projectbot',
  POSTGRES_PASSWORD: 'postgres',
  POSTGRES_PORT: '5432',
  
  // API
  API_PREFIX: '/api',
  
  // CORS
  CORS_ORIGIN: '*', // '*' для всех или 'http://localhost:3000,http://localhost:3001'
};






