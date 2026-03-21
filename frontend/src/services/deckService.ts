import { apiClient } from '@/services/api';
import { DeckListResponse, DeckResponse, SaveDeckRequest, UserDeck } from '@/types/deck';

const DEFAULT_ERROR = 'Не удалось выполнить операцию с колодой';

const unwrapDeckList = (
  response: Awaited<ReturnType<typeof apiClient.get<DeckListResponse>>>,
): { ok: true; decks: UserDeck[] } | { ok: false; error: string } => {
  if (!response.success || !response.data) {
    return { ok: false, error: response.error ?? DEFAULT_ERROR };
  }

  return { ok: true, decks: response.data.decks };
};

const unwrapDeck = (
  response: Awaited<ReturnType<typeof apiClient.post<DeckResponse>>>,
): { ok: true; deck: UserDeck } | { ok: false; error: string } => {
  if (!response.success || !response.data) {
    return { ok: false, error: response.error ?? DEFAULT_ERROR };
  }

  return { ok: true, deck: response.data.deck };
};

export const deckService = {
  async list(): Promise<{ ok: true; decks: UserDeck[] } | { ok: false; error: string }> {
    return unwrapDeckList(await apiClient.get<DeckListResponse>('/api/decks'));
  },

  async create(
    payload: SaveDeckRequest,
  ): Promise<{ ok: true; deck: UserDeck } | { ok: false; error: string }> {
    return unwrapDeck(await apiClient.post<DeckResponse>('/api/decks', payload));
  },

  async update(
    deckId: string,
    payload: SaveDeckRequest,
  ): Promise<{ ok: true; deck: UserDeck } | { ok: false; error: string }> {
    return unwrapDeck(await apiClient.put<DeckResponse>(`/api/decks/${deckId}`, payload));
  },

  async remove(deckId: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const response = await apiClient.delete<{ message: string }>(`/api/decks/${deckId}`);
    if (!response.success) {
      return { ok: false, error: response.error ?? DEFAULT_ERROR };
    }

    return { ok: true };
  },
};
