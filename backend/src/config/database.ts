import { Pool, PoolConfig } from 'pg';
import { logger } from '../utils/logger';
import { databaseConfig as dbConfig } from './env';

const poolConfig: PoolConfig = {
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ...(dbConfig.connectionString
    ? { connectionString: dbConfig.connectionString }
    : {
        user: dbConfig.user,
        host: dbConfig.host,
        database: dbConfig.database,
        password: dbConfig.password,
        port: dbConfig.port,
      }),
};

export const pool = new Pool(poolConfig);

// Тест подключения
pool.on('connect', () => {
  logger.info('✅ Connected to PostgreSQL database');
});

pool.on('error', (err: Error) => {
  logger.error('❌ Unexpected error on idle client', err);
  process.exit(-1);
});
