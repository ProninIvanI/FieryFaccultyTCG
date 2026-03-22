import { Router } from 'express';
import { getMatch, getMatchReplay, listMatches } from '../controllers/matchController';
import { requireAuth } from '../middlewares/requireAuth';

const router = Router();

router.use(requireAuth);
router.get('/', listMatches);
router.get('/:matchId', getMatch);
router.get('/:matchId/replay', getMatchReplay);

export default router;
