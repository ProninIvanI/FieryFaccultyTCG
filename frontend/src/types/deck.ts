export interface DeckCardItem {
  cardId: string;
  quantity: number;
}

export interface UserDeck {
  id: string;
  userId: string;
  name: string;
  characterId: string | null;
  createdAt: string;
  updatedAt: string;
  cards: DeckCardItem[];
}

export interface DeckListResponse {
  decks: UserDeck[];
}

export interface DeckResponse {
  deck: UserDeck;
}

export interface SaveDeckRequest {
  name: string;
  characterId: string | null;
  cards: DeckCardItem[];
}
