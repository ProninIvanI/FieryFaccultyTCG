import { Router } from 'express';
import {
  acceptInternalFriendRequest,
  cancelInternalFriendRequest,
  completeInternalMatch,
  createInternalFriendRequest,
  createInternalMatch,
  declineInternalFriendRequest,
  deleteInternalFriend,
  getInternalFriendshipStatus,
  getInternalSocialGraphSnapshot,
  listInternalActiveMatchInvites,
  saveInternalReplay,
  upsertInternalMatchInvite,
} from '../controllers/internalMatchController';
import { requireInternalToken } from '../middlewares/requireInternalToken';

const router = Router();

router.use(requireInternalToken);
router.get('/friends/status', getInternalFriendshipStatus);
router.get('/social/friends', getInternalSocialGraphSnapshot);
router.post('/social/friend-requests', createInternalFriendRequest);
router.post('/social/friend-requests/:requestId/accept', acceptInternalFriendRequest);
router.post('/social/friend-requests/:requestId/decline', declineInternalFriendRequest);
router.post('/social/friend-requests/:requestId/cancel', cancelInternalFriendRequest);
router.delete('/social/friends/:friendUserId', deleteInternalFriend);
router.get('/social/invites', listInternalActiveMatchInvites);
router.put('/social/invites/:inviteId', upsertInternalMatchInvite);
router.post('/matches', createInternalMatch);
router.post('/matches/:matchId/complete', completeInternalMatch);
router.post('/matches/:matchId/replay', saveInternalReplay);

export default router;
