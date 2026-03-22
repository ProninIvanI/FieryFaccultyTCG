import { Router } from 'express';
import {
  completeInternalMatch,
  createInternalMatch,
  saveInternalReplay,
} from '../controllers/internalMatchController';
import { requireInternalToken } from '../middlewares/requireInternalToken';

const router = Router();

router.use(requireInternalToken);
router.post('/matches', createInternalMatch);
router.post('/matches/:matchId/complete', completeInternalMatch);
router.post('/matches/:matchId/replay', saveInternalReplay);

export default router;
