export type DeckValidationCode =
  | 'deck_size_invalid'
  | 'deck_character_required'
  | 'deck_character_unknown'
  | 'deck_card_unknown'
  | 'deck_card_copies_exceeded'
  | 'deck_card_school_mismatch'
  | 'deck_art_limit_exceeded'
  | 'deck_modifier_limit_exceeded';

export interface DeckValidationIssue {
  code: DeckValidationCode;
  message: string;
  cardId?: string;
  characterId?: string;
  meta?: {
    expected?: number | string;
    actual?: number | string;
    cardName?: string;
    faculty?: string;
    cardSchool?: string;
  };
}

export interface DeckCardInput {
  cardId: string;
  quantity: number;
}

export interface DeckValidationInput {
  characterId: string;
  cards: DeckCardInput[];
}

export interface DeckLegalitySummary {
  totalCards: number;
  artCards: number;
  modifierCards: number;
  uniqueCards: number;
}

export interface DeckValidationResult {
  ok: boolean;
  issues: DeckValidationIssue[];
  summary: DeckLegalitySummary;
}
