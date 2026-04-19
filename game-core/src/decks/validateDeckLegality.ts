import {
  CatalogCardMetadata,
  CatalogCharacterMetadata,
  normalizeCatalog,
  toCatalogCardUiType,
} from '../cards/catalog';
import { DECK_RULES_V1 } from './rules';
import {
  DeckCardInput,
  DeckLegalitySummary,
  DeckValidationInput,
  DeckValidationIssue,
  DeckValidationResult,
} from './types';

const normalizeDeckCards = (cards: DeckCardInput[]): DeckCardInput[] => {
  const merged = new Map<string, number>();

  cards.forEach((card) => {
    merged.set(card.cardId, (merged.get(card.cardId) ?? 0) + card.quantity);
  });

  return Array.from(merged.entries())
    .map(([cardId, quantity]) => ({ cardId, quantity }))
    .sort((left, right) => left.cardId.localeCompare(right.cardId, 'en'));
};

const buildSummary = (
  cards: DeckCardInput[],
  cardById: ReadonlyMap<string, CatalogCardMetadata>,
): DeckLegalitySummary => {
  let totalCards = 0;
  let artCards = 0;
  let modifierCards = 0;

  cards.forEach((card) => {
    totalCards += card.quantity;

    const metadata = cardById.get(card.cardId);
    const cardType = toCatalogCardUiType(metadata?.catalogType);
    if (cardType === 'art') {
      artCards += card.quantity;
    }

    if (cardType === 'modifier') {
      modifierCards += card.quantity;
    }
  });

  return {
    totalCards,
    artCards,
    modifierCards,
    uniqueCards: cards.length,
  };
};

const getCharacterRequiredIssue = (): DeckValidationIssue => ({
  code: 'deck_character_required',
  message: 'Для колоды нужно выбрать персонажа.',
});

const getCharacterUnknownIssue = (characterId: string): DeckValidationIssue => ({
  code: 'deck_character_unknown',
  message: 'Выбран неизвестный персонаж.',
  characterId,
});

const getDeckSizeIssue = (actual: number): DeckValidationIssue => ({
  code: 'deck_size_invalid',
  message: `Колода должна содержать ровно ${DECK_RULES_V1.deckSize} карт.`,
  meta: {
    expected: DECK_RULES_V1.deckSize,
    actual,
  },
});

const getUnknownCardIssue = (cardId: string): DeckValidationIssue => ({
  code: 'deck_card_unknown',
  message: `В колоде есть неизвестная карта: ${cardId}.`,
  cardId,
});

const getCopiesExceededIssue = (
  cardId: string,
  quantity: number,
  cardName?: string,
): DeckValidationIssue => ({
  code: 'deck_card_copies_exceeded',
  message: `Нельзя добавлять больше ${DECK_RULES_V1.maxCopiesPerCard} копий карты ${cardName ?? cardId}.`,
  cardId,
  meta: {
    expected: DECK_RULES_V1.maxCopiesPerCard,
    actual: quantity,
    cardName,
  },
});

const getSchoolMismatchIssue = (
  card: CatalogCardMetadata,
  character: CatalogCharacterMetadata,
): DeckValidationIssue => ({
  code: 'deck_card_school_mismatch',
  message: `Карта ${card.name} не подходит факультету выбранного персонажа.`,
  cardId: card.id,
  characterId: character.id,
  meta: {
    cardName: card.name,
    faculty: character.faculty,
    cardSchool: card.school,
  },
});

const getArtLimitIssue = (actual: number): DeckValidationIssue => ({
  code: 'deck_art_limit_exceeded',
  message: `В колоде может быть не больше ${DECK_RULES_V1.maxArtCards} art-карт.`,
  meta: {
    expected: DECK_RULES_V1.maxArtCards,
    actual,
  },
});

const getModifierLimitIssue = (actual: number): DeckValidationIssue => ({
  code: 'deck_modifier_limit_exceeded',
  message: `В колоде может быть не больше ${DECK_RULES_V1.maxModifierCards} modifier-карт.`,
  meta: {
    expected: DECK_RULES_V1.maxModifierCards,
    actual,
  },
});

export const validateDeckLegality = (
  catalog: unknown,
  input: DeckValidationInput,
): DeckValidationResult => {
  const normalizedCards = normalizeDeckCards(input.cards);
  const { cards, characters } = normalizeCatalog(catalog);
  const cardById = new Map(cards.map((card) => [card.id, card] as const));
  const characterById = new Map(characters.map((character) => [character.id, character] as const));
  const summary = buildSummary(normalizedCards, cardById);
  const issues: DeckValidationIssue[] = [];

  if (!input.characterId.trim()) {
    issues.push(getCharacterRequiredIssue());
  }

  const character = characterById.get(input.characterId);
  if (input.characterId.trim() && !character) {
    issues.push(getCharacterUnknownIssue(input.characterId));
  }

  if (summary.totalCards !== DECK_RULES_V1.deckSize) {
    issues.push(getDeckSizeIssue(summary.totalCards));
  }

  normalizedCards.forEach((cardEntry) => {
    const card = cardById.get(cardEntry.cardId);
    if (!card) {
      issues.push(getUnknownCardIssue(cardEntry.cardId));
      return;
    }

    if (cardEntry.quantity > DECK_RULES_V1.maxCopiesPerCard) {
      issues.push(getCopiesExceededIssue(cardEntry.cardId, cardEntry.quantity, card.name));
    }

    if (!character) {
      return;
    }

    const cardType = toCatalogCardUiType(card.catalogType);
    if ((cardType === 'spell' || cardType === 'summon') && card.school !== character.faculty) {
      issues.push(getSchoolMismatchIssue(card, character));
    }
  });

  if (summary.artCards > DECK_RULES_V1.maxArtCards) {
    issues.push(getArtLimitIssue(summary.artCards));
  }

  if (summary.modifierCards > DECK_RULES_V1.maxModifierCards) {
    issues.push(getModifierLimitIssue(summary.modifierCards));
  }

  return {
    ok: issues.length === 0,
    issues,
    summary,
  };
};
