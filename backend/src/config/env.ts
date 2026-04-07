import dotenv from 'dotenv';

// Загружаем переменные окружения
dotenv.config();

// Простой logger для использования до инициализации основного logger
const initLogger = {
  info: (message: string) => console.log(`[CONFIG] ${message}`),
  warn: (message: string) => console.warn(`[CONFIG] ${message}`),
};

// Интерфейс для конфигурации
export interface EnvConfig {
  // Server
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  INTERNAL_API_TOKEN: string;
  DATABASE_URL: string;
  
  // Database
  POSTGRES_USER: string;
  POSTGRES_HOST: string;
  POSTGRES_DB: string;
  POSTGRES_PASSWORD: string;
  POSTGRES_PORT: number;
  
  // API
  API_PREFIX: string;
  
  // CORS
  CORS_ORIGIN: string;
}

// Валидация и получение переменных окружения
const getEnvNumber = (key: string, defaultValue: number): number => {
  const value = process.env[key];
  if (!value) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    initLogger.warn(`Invalid number for ${key}, using default: ${defaultValue}`);
    return defaultValue;
  }
  return parsed;
};

const getEnvString = (key: string, defaultValue: string): string => {
  return process.env[key] || defaultValue;
};

// Создание конфигурации
export const config: EnvConfig = {
  // Server
  NODE_ENV: (getEnvString('NODE_ENV', 'development') as 'development' | 'production' | 'test'),
  PORT: getEnvNumber('PORT', 3001),
  INTERNAL_API_TOKEN: getEnvString('INTERNAL_API_TOKEN', 'dev-internal-token'),
  DATABASE_URL: getEnvString('DATABASE_URL', ''),
  
  // Database
  POSTGRES_USER: getEnvString('POSTGRES_USER', 'postgres'),
  POSTGRES_HOST: getEnvString('POSTGRES_HOST', 'localhost'),
  POSTGRES_DB: getEnvString('POSTGRES_DB', 'projectbot'),
  POSTGRES_PASSWORD: getEnvString('POSTGRES_PASSWORD', 'postgres'),
  POSTGRES_PORT: getEnvNumber('POSTGRES_PORT', 5432),
  
  // API
  API_PREFIX: getEnvString('API_PREFIX', '/api'),
  
  // CORS
  CORS_ORIGIN: getEnvString('CORS_ORIGIN', '*'),
};

// Валидация конфигурации при запуске
export const validateConfig = (): void => {
  const requiredVars: (keyof EnvConfig)[] = [
    'NODE_ENV',
    'PORT',
    'INTERNAL_API_TOKEN',
    'POSTGRES_USER',
    'POSTGRES_HOST',
    'POSTGRES_DB',
    'POSTGRES_PASSWORD',
  ];

  const missing: string[] = [];

  requiredVars.forEach((key) => {
    if (!config[key]) {
      missing.push(key);
    }
  });

  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  }

  // Дополнительная валидация
  if (!['development', 'production', 'test'].includes(config.NODE_ENV)) {
    throw new Error(`Invalid NODE_ENV: ${config.NODE_ENV}. Must be development, production, or test`);
  }

  if (config.PORT < 1 || config.PORT > 65535) {
    throw new Error(`Invalid PORT: ${config.PORT}. Must be between 1 and 65535`);
  }

  initLogger.info('✅ Configuration validated successfully');
};

// Экспорт отдельных секций конфигурации для удобства
export const serverConfig = {
  nodeEnv: config.NODE_ENV,
  port: config.PORT,
  internalApiToken: config.INTERNAL_API_TOKEN,
  isDevelopment: config.NODE_ENV === 'development',
  isProduction: config.NODE_ENV === 'production',
  isTest: config.NODE_ENV === 'test',
};

export const databaseConfig = {
  connectionString: config.DATABASE_URL || null,
  user: config.POSTGRES_USER,
  host: config.POSTGRES_HOST,
  database: config.POSTGRES_DB,
  password: config.POSTGRES_PASSWORD,
  port: config.POSTGRES_PORT,
  // Формируем connection string
  getConnectionString: () => {
    if (config.DATABASE_URL) {
      return config.DATABASE_URL;
    }
    return `postgresql://${config.POSTGRES_USER}:${config.POSTGRES_PASSWORD}@${config.POSTGRES_HOST}:${config.POSTGRES_PORT}/${config.POSTGRES_DB}`;
  },
};

export const apiConfig = {
  prefix: config.API_PREFIX,
};

export const corsConfig = {
  origin: config.CORS_ORIGIN === '*' ? '*' : config.CORS_ORIGIN.split(','),
};
