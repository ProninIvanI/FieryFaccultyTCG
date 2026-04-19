import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { validateDeckLegality } from '../../../../game-core/src';

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

export type ResolvePlayerDeckResult =
  | { status: 'ok'; deck: ResolvedDeck }
  | { status: 'unavailable' }
  | { status: 'invalid'; error: string };

const DEFAULT_BACKEND_URL = process.env.BACKEND_API_URL ?? 'http://localhost:3001';
const cardCatalogCandidates = [
  path.resolve(__dirname, '..', '..', '..', '..', 'game-core', 'data', 'cards.json'),
  path.resolve(process.cwd(), '..', 'game-core', 'data', 'cards.json'),
  path.resolve(process.cwd(), 'game-core', 'data', 'cards.json'),
];

let deckCatalogCache: unknown | null = null;
let skipCatalogValidation = false;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const stripUtf8Bom = (value: string): string => value.replace(/^\uFEFF/, '');

const resolveDeckCatalogPath = (): string | null => {
  for (const candidate of cardCatalogCandidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
};

const getDeckCatalog = (): unknown | null => {
  if (deckCatalogCache) {
    return deckCatalogCache;
  }

  if (skipCatalogValidation) {
    return null;
  }

  const catalogPath = resolveDeckCatalogPath();
  if (!catalogPath) {
    skipCatalogValidation = true;
    return null;
  }

  const rawCatalog = stripUtf8Bom(readFileSync(catalogPath, 'utf-8'));
  const raw = JSON.parse(rawCatalog) as unknown;
  if (!isRecord(raw)) {
    throw new Error('Invalid card catalog');
  }

  deckCatalogCache = raw;
  return deckCatalogCache;
};

export const resolvePlayerDeck = async (
  token: string,
  deckId: string,
): Promise<ResolvePlayerDeckResult> => {
  const response = await fetch(`${DEFAULT_BACKEND_URL}/api/decks/${deckId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    return { status: 'unavailable' };
  }

  const payload = (await response.json()) as DeckResponse;
  const deck = payload.data?.deck;
  if (!deck?.id || !deck.characterId || !Array.isArray(deck.cards)) {
    return { status: 'unavailable' };
  }

  const cards = deck.cards
    .filter((card): card is { cardId: string; quantity: number } =>
      Boolean(card?.cardId) && typeof card.quantity === 'number' && Number.isFinite(card.quantity) && card.quantity > 0,
    )
    .map((card) => ({
      cardId: card.cardId,
      quantity: card.quantity,
    }));

  const resolvedDeck: ResolvedDeck = {
    deckId: deck.id,
    characterId: deck.characterId,
    cards,
  };

  const catalog = getDeckCatalog();
  if (catalog) {
    const validation = validateDeckLegality(catalog, {
      characterId: resolvedDeck.characterId,
      cards: resolvedDeck.cards,
    });

    if (!validation.ok) {
      return {
        status: 'invalid',
        error: validation.issues[0]?.message ?? 'Deck is invalid',
      };
    }
  }

  return {
    status: 'ok',
    deck: resolvedDeck,
  };
};
