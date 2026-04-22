import { Router } from 'express';
import {
  completeInternalMatch,
  createInternalMatch,
  getInternalFriendshipStatus,
  listInternalActiveMatchInvites,
  saveInternalReplay,
  upsertInternalMatchInvite,
} from '../controllers/internalMatchController';
import { requireInternalToken } from '../middlewares/requireInternalToken';

const router = Router();

router.use(requireInternalToken);
router.get('/friends/status', getInternalFriendshipStatus);
router.get('/social/invites', listInternalActiveMatchInvites);
router.put('/social/invites/:inviteId', upsertInternalMatchInvite);
router.post('/matches', createInternalMatch);
router.post('/matches/:matchId/complete', completeInternalMatch);
router.post('/matches/:matchId/replay', saveInternalReplay);

export default router;
