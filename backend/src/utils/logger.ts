// Утилита для логирования

let isDevelopment = false;

// Функция для инициализации logger (вызывается после загрузки конфигурации)
export const initLogger = (nodeEnv: string): void => {
  isDevelopment = nodeEnv === 'development';
};

export const logger = {
  info: (message: string, ...args: unknown[]): void => {
    console.log(`[INFO] ${message}`, ...args);
  },
  error: (message: string, ...args: unknown[]): void => {
    console.error(`[ERROR] ${message}`, ...args);
  },
  warn: (message: string, ...args: unknown[]): void => {
    console.warn(`[WARN] ${message}`, ...args);
  },
  debug: (message: string, ...args: unknown[]): void => {
    if (isDevelopment) {
      console.debug(`[DEBUG] ${message}`, ...args);
    }
  },
};

