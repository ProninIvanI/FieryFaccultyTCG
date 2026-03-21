import { Router } from 'express';
import {
  createDeck,
  deleteDeck,
  getDeck,
  listDecks,
  updateDeck,
} from '../controllers/deckController';
import { requireAuth } from '../middlewares/requireAuth';

const router = Router();

router.use(requireAuth);
router.get('/', listDecks);
router.get('/:deckId', getDeck);
router.post('/', createDeck);
router.put('/:deckId', updateDeck);
router.delete('/:deckId', deleteDeck);

export default router;
