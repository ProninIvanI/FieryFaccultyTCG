import { Router } from 'express';
import {
  acceptFriendRequest,
  cancelFriendRequest,
  createFriendRequest,
  declineFriendRequest,
  deleteFriend,
  listFriends,
  listIncomingFriendRequests,
  listOutgoingFriendRequests,
} from '../controllers/friendController';
import { requireAuth } from '../middlewares/requireAuth';

const router = Router();

router.use(requireAuth);
router.get('/', listFriends);
router.get('/requests/incoming', listIncomingFriendRequests);
router.get('/requests/outgoing', listOutgoingFriendRequests);
router.post('/requests', createFriendRequest);
router.post('/requests/:requestId/accept', acceptFriendRequest);
router.post('/requests/:requestId/decline', declineFriendRequest);
router.post('/requests/:requestId/cancel', cancelFriendRequest);
router.delete('/:friendUserId', deleteFriend);

export default router;
