import { Router } from 'express';
import healthRoutes from './healthRoutes';
import newsRoutes from './newsRoutes';
import authRoutes from './authRoutes';

const router = Router();

// Health check routes
router.use('/health', healthRoutes);
router.use('/news', newsRoutes);
router.use('/auth', authRoutes);

// API routes
router.get('/', (_req, res) => {
  res.json({ 
    success: true,
    message: 'API routes are working',
    endpoints: {
      health: '/api/health',
      news: '/api/news',
      auth: '/api/auth',
    },
  });
});

export default router;
