import { randomUUID } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { validateDeckLegality } from '../../../game-core/src';
import { DeckCardRecord, DeckRecord, deckModel } from '../models/deckModel';

type DeckPayload = {
  name: string;
  characterId: string;
  cards: DeckCardRecord[];
};

type DeckMutationResult =
  | { ok: true; data: DeckRecord }
  | { ok: false; error: string };

const DECK_NAME_LIMIT = 128;
const cardCatalogCandidates = [
  path.resolve(__dirname, '..', '..', '..', 'game-core', 'data', 'cards.json'),
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
  for (const card of normalizedCards) {
    if (!Number.isInteger(card.quantity) || card.quantity <= 0) {
      return { ok: false, error: `Некорректное количество для карты ${card.cardId}` };
    }
  }

  const catalog = getDeckCatalog();
  if (catalog) {
    const validation = validateDeckLegality(catalog, {
      characterId: payload.characterId,
      cards: normalizedCards,
    });

    if (!validation.ok) {
      return { ok: false, error: validation.issues[0]?.message ?? 'Колода не прошла валидацию' };
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
