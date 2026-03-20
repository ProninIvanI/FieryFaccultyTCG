import { Router } from 'express';
import healthRoutes from './healthRoutes';
import newsRoutes from './newsRoutes';

const router = Router();

// Health check routes
router.use('/health', healthRoutes);
router.use('/news', newsRoutes);

// API routes
router.get('/', (_req, res) => {
  res.json({ 
    success: true,
    message: 'API routes are working',
    endpoints: {
      health: '/api/health',
      news: '/api/news',
    },
  });
});

export default router;
