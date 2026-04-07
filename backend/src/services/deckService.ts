import { randomUUID } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { DeckCardRecord, DeckRecord, deckModel } from '../models/deckModel';

type RawCatalogCard = {
  id?: unknown;
};

type RawCatalogCharacter = {
  id?: unknown;
};

type RawCatalog = {
  cards?: unknown;
  characters?: unknown;
};

type DeckPayload = {
  name: string;
  characterId: string;
  cards: DeckCardRecord[];
};

type DeckMutationResult =
  | { ok: true; data: DeckRecord }
  | { ok: false; error: string };

const DECK_NAME_LIMIT = 128;
const MAX_CARD_QUANTITY = 99;
const cardCatalogCandidates = [
  path.resolve(__dirname, '..', '..', '..', 'game-core', 'data', 'cards.json'),
  path.resolve(process.cwd(), '..', 'game-core', 'data', 'cards.json'),
  path.resolve(process.cwd(), 'game-core', 'data', 'cards.json'),
];

let deckCatalogCache: { cardIds: Set<string>; characterIds: Set<string> } | null = null;
let skipCatalogValidation = false;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isRawCatalogCard = (value: unknown): value is RawCatalogCard =>
  isRecord(value) && value.id !== undefined;

const isRawCatalogCharacter = (value: unknown): value is RawCatalogCharacter =>
  isRecord(value) && value.id !== undefined;

const isRawCatalog = (value: unknown): value is RawCatalog =>
  isRecord(value);

const stripUtf8Bom = (value: string): string => value.replace(/^\uFEFF/, '');

const resolveDeckCatalogPath = (): string | null => {
  for (const candidate of cardCatalogCandidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
};

const getDeckCatalog = (): { cardIds: Set<string>; characterIds: Set<string> } | null => {
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
  if (!isRawCatalog(raw)) {
    throw new Error('Invalid card catalog');
  }

  const cards = Array.isArray(raw.cards) ? raw.cards.filter(isRawCatalogCard) : [];
  const characters = Array.isArray(raw.characters)
    ? raw.characters.filter(isRawCatalogCharacter)
    : [];

  deckCatalogCache = {
    cardIds: new Set(cards.map((card) => String(card.id))),
    characterIds: new Set(characters.map((character) => String(character.id))),
  };

  return deckCatalogCache;
};

const normalizeCards = (cards: DeckCardRecord[]): DeckCardRecord[] => {
  const merged = new Map<string, number>();

  cards.forEach((card) => {
    merged.set(card.cardId, (merged.get(card.cardId) ?? 0) + card.quantity);
  });

  return Array.from(merged.entries())
    .map(([cardId, quantity]) => ({ cardId, quantity }))
    .sort((left, right) => left.cardId.localeCompare(right.cardId, 'en'));
};

const validateDeckPayload = (
  payload: DeckPayload,
): { ok: true; payload: DeckPayload } | { ok: false; error: string } => {
  const name = payload.name.trim();
  if (!name) {
    return { ok: false, error: 'Название колоды обязательно' };
  }

  if (name.length > DECK_NAME_LIMIT) {
    return { ok: false, error: 'Название колоды слишком длинное' };
  }

  if (!payload.characterId.trim()) {
    return { ok: false, error: 'Для колоды нужно выбрать персонажа' };
  }

  const normalizedCards = normalizeCards(payload.cards);
  const catalog = getDeckCatalog();

  if (catalog && !catalog.characterIds.has(payload.characterId)) {
    return { ok: false, error: 'Неизвестный персонаж для колоды' };
  }

  for (const card of normalizedCards) {
    if (catalog && !catalog.cardIds.has(card.cardId)) {
      return { ok: false, error: `Неизвестная карта: ${card.cardId}` };
    }

    if (!Number.isInteger(card.quantity) || card.quantity <= 0 || card.quantity > MAX_CARD_QUANTITY) {
      return { ok: false, error: `Некорректное количество для карты ${card.cardId}` };
    }
  }

  return {
    ok: true,
    payload: {
      name,
      characterId: payload.characterId,
      cards: normalizedCards,
    },
  };
};

export class DeckService {
  async listByUserId(userId: string): Promise<DeckRecord[]> {
    return deckModel.listByUserId(userId);
  }

  async getById(userId: string, deckId: string): Promise<DeckRecord | null> {
    return deckModel.findByIdAndUserId(deckId, userId);
  }

  async create(userId: string, payload: DeckPayload): Promise<DeckMutationResult> {
    const validated = validateDeckPayload(payload);
    if (!validated.ok) {
      return validated;
    }

    const created = await deckModel.create({
      id: `deck_${randomUUID()}`,
      userId,
      ...validated.payload,
    });

    return {
      ok: true,
      data: created,
    };
  }

  async update(userId: string, deckId: string, payload: DeckPayload): Promise<DeckMutationResult> {
    const validated = validateDeckPayload(payload);
    if (!validated.ok) {
      return validated;
    }

    const updated = await deckModel.update({
      id: deckId,
      userId,
      ...validated.payload,
    });

    if (!updated) {
      return { ok: false, error: 'Колода не найдена' };
    }

    return {
      ok: true,
      data: updated,
    };
  }

  async delete(userId: string, deckId: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const deleted = await deckModel.deleteByIdAndUserId(deckId, userId);
    if (!deleted) {
      return { ok: false, error: 'Колода не найдена' };
    }

    return { ok: true };
  }
}
