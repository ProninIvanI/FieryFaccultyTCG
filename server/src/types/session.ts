export type SessionDeckCard = {
  cardId: string;
  quantity: number;
};

export type SessionPlayerLoadout = {
  playerId: string;
  characterId: string;
  deck: SessionDeckCard[];
};
