import express from 'express';
import cors from 'cors';
import apiRoutes from './routes';
import { errorHandler, notFoundHandler } from './middlewares';
import { logger, initLogger } from './utils/logger';
import { validateConfig, serverConfig, apiConfig, corsConfig } from './config';

// Валидация конфигурации при запуске
validateConfig();

// Инициализация logger с конфигурацией
initLogger(serverConfig.nodeEnv);

const app = express();
const PORT = serverConfig.port;

// Middleware
app.use(cors({
  origin: corsConfig.origin,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use(apiConfig.prefix, apiRoutes);

// Health check (root level)
app.get('/health', (_req, res) => {
  res.redirect(`${apiConfig.prefix}/health`);
});

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

const server = app.listen(PORT, () => {
  logger.info(`🚀 Server is running on port ${PORT}`);
});

const shutdown = () => {
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
