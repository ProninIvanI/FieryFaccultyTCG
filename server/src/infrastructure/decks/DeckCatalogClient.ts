type DeckResponse = {
  success: boolean;
  data?: {
    deck?: {
      id?: string;
      characterId?: string | null;
      cards?: Array<{
        cardId?: string;
        quantity?: number;
      }>;
    };
  };
};

export type ResolvedDeck = {
  deckId: string;
  characterId: string;
  cards: Array<{
    cardId: string;
    quantity: number;
  }>;
};

const DEFAULT_BACKEND_URL = process.env.BACKEND_API_URL ?? 'http://localhost:3001';

export const resolvePlayerDeck = async (
  token: string,
  deckId: string,
): Promise<ResolvedDeck | null> => {
  const response = await fetch(`${DEFAULT_BACKEND_URL}/api/decks/${deckId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as DeckResponse;
  const deck = payload.data?.deck;
  if (!deck?.id || !deck.characterId || !Array.isArray(deck.cards)) {
    return null;
  }

  const cards = deck.cards
    .filter((card): card is { cardId: string; quantity: number } =>
      Boolean(card?.cardId) && typeof card.quantity === 'number' && Number.isFinite(card.quantity) && card.quantity > 0,
    )
    .map((card) => ({
      cardId: card.cardId,
      quantity: card.quantity,
    }));

  return {
    deckId: deck.id,
    characterId: deck.characterId,
    cards,
  };
};
