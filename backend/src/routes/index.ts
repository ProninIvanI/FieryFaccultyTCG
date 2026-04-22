import { Router } from 'express';
import healthRoutes from './healthRoutes';
import newsRoutes from './newsRoutes';
import authRoutes from './authRoutes';
import friendRoutes from './friendRoutes';
import deckRoutes from './deckRoutes';
import matchRoutes from './matchRoutes';
import internalMatchRoutes from './internalMatchRoutes';

const router = Router();

// Health check routes
router.use('/health', healthRoutes);
router.use('/news', newsRoutes);
router.use('/auth', authRoutes);
router.use('/friends', friendRoutes);
router.use('/decks', deckRoutes);
router.use('/matches', matchRoutes);
router.use('/internal', internalMatchRoutes);

// API routes
router.get('/', (_req, res) => {
  res.json({ 
    success: true,
    message: 'API routes are working',
    endpoints: {
      health: '/api/health',
      news: '/api/news',
      auth: '/api/auth',
      friends: '/api/friends',
      decks: '/api/decks',
      matches: '/api/matches',
      internal: '/api/internal',
    },
  });
});

export default router;
