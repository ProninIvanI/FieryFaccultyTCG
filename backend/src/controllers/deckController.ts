import { NextFunction, Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import {
  ApiResponse,
  DeckListResponse,
  DeckResponse,
  DeleteDeckResponse,
  SaveDeckRequest,
} from '../types';
import { DeckService } from '../services/deckService';

const deckService = new DeckService();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const parseDeckRequest = (value: unknown): SaveDeckRequest | null => {
  if (!isRecord(value)) {
    return null;
  }

  const { name, characterId, cards } = value;
  if (typeof name !== 'string' || !Array.isArray(cards)) {
    return null;
  }

  const parsedCards = cards.map((card) => {
    if (!isRecord(card) || typeof card.cardId !== 'string' || typeof card.quantity !== 'number') {
      return null;
    }

    return {
      cardId: card.cardId,
      quantity: card.quantity,
    };
  });

  if (parsedCards.some((card) => card === null)) {
    return null;
  }

  if (typeof characterId !== 'string' || !characterId.trim()) {
    return null;
  }

  return {
    name,
    characterId: characterId.trim(),
    cards: parsedCards.filter((card): card is NonNullable<typeof card> => card !== null),
  };
};

export const listDecks = async (
  req: Request,
  res: Response<ApiResponse<DeckListResponse>>,
  next: NextFunction,
): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const decks = await deckService.listByUserId(authReq.authUser.id);
    res.status(200).json({
      success: true,
      data: { decks },
    });
  } catch (error) {
    next(error);
  }
};

export const getDeck = async (
  req: Request,
  res: Response<ApiResponse<DeckResponse>>,
  next: NextFunction,
): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const deck = await deckService.getById(authReq.authUser.id, req.params.deckId);
    if (!deck) {
      res.status(404).json({ success: false, error: 'Колода не найдена' });
      return;
    }

    res.status(200).json({
      success: true,
      data: { deck },
    });
  } catch (error) {
    next(error);
  }
};

export const createDeck = async (
  req: Request,
  res: Response<ApiResponse<DeckResponse>>,
  next: NextFunction,
): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const payload = parseDeckRequest(req.body);
    if (!payload) {
      res.status(400).json({ success: false, error: 'Некорректный payload колоды' });
      return;
    }

    const result = await deckService.create(authReq.authUser.id, payload);
    if (!result.ok) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }

    res.status(201).json({
      success: true,
      data: { deck: result.data },
    });
  } catch (error) {
    next(error);
  }
};

export const updateDeck = async (
  req: Request,
  res: Response<ApiResponse<DeckResponse>>,
  next: NextFunction,
): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const payload = parseDeckRequest(req.body);
    if (!payload) {
      res.status(400).json({ success: false, error: 'Некорректный payload колоды' });
      return;
    }

    const result = await deckService.update(authReq.authUser.id, req.params.deckId, payload);
    if (!result.ok) {
      const status = result.error === 'Колода не найдена' ? 404 : 400;
      res.status(status).json({ success: false, error: result.error });
      return;
    }

    res.status(200).json({
      success: true,
      data: { deck: result.data },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteDeck = async (
  req: Request,
  res: Response<ApiResponse<DeleteDeckResponse>>,
  next: NextFunction,
): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const result = await deckService.delete(authReq.authUser.id, req.params.deckId);
    if (!result.ok) {
      res.status(404).json({ success: false, error: result.error });
      return;
    }

    res.status(200).json({
      success: true,
      data: { message: 'Колода удалена' },
    });
  } catch (error) {
    next(error);
  }
};
