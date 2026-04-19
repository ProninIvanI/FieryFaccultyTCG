import { describe, expect, it } from 'vitest';
import rawCardCatalog from '../data/cards.json';
import { validateDeckLegality } from '../src/decks/validateDeckLegality';

const buildCards = (entries: Array<[string, number]>) =>
  entries.map(([cardId, quantity]) => ({ cardId, quantity }));

describe('validateDeckLegality', () => {
  it('accepts a valid 30-card deck for the selected character faculty', () => {
    const result = validateDeckLegality(rawCardCatalog, {
      characterId: '1',
      cards: buildCards([
        ['1', 2],
        ['2', 2],
        ['3', 2],
        ['4', 2],
        ['5', 2],
        ['6', 2],
        ['7', 2],
        ['8', 2],
        ['9', 2],
        ['10', 2],
        ['41', 2],
        ['42', 2],
        ['61', 2],
        ['62', 2],
        ['81', 2],
      ]),
    });

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.summary.totalCards).toBe(30);
  });

  it('rejects deck with invalid total size', () => {
    const result = validateDeckLegality(rawCardCatalog, {
      characterId: '1',
      cards: buildCards([
        ['1', 2],
        ['2', 2],
        ['3', 2],
        ['4', 2],
        ['5', 2],
        ['6', 2],
        ['7', 2],
        ['8', 2],
        ['9', 2],
        ['10', 2],
        ['41', 2],
        ['42', 2],
        ['61', 2],
        ['81', 1],
      ]),
    });

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'deck_size_invalid')).toBe(true);
  });

  it('rejects more than two copies of the same card', () => {
    const result = validateDeckLegality(rawCardCatalog, {
      characterId: '1',
      cards: buildCards([
        ['1', 3],
        ['2', 2],
        ['3', 2],
        ['4', 2],
        ['5', 2],
        ['6', 2],
        ['7', 2],
        ['8', 2],
        ['9', 2],
        ['10', 2],
        ['41', 2],
        ['42', 2],
        ['61', 2],
        ['62', 1],
      ]),
    });

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'deck_card_copies_exceeded')).toBe(true);
  });

  it('rejects spell cards from another faculty', () => {
    const result = validateDeckLegality(rawCardCatalog, {
      characterId: '1',
      cards: buildCards([
        ['11', 2],
        ['2', 2],
        ['3', 2],
        ['4', 2],
        ['5', 2],
        ['6', 2],
        ['7', 2],
        ['8', 2],
        ['9', 2],
        ['10', 2],
        ['41', 2],
        ['42', 2],
        ['61', 2],
        ['62', 2],
        ['81', 2],
      ]),
    });

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'deck_card_school_mismatch')).toBe(true);
  });

  it('allows neutral art and modifier cards for any faculty', () => {
    const result = validateDeckLegality(rawCardCatalog, {
      characterId: '7',
      cards: buildCards([
        ['11', 2],
        ['12', 2],
        ['13', 2],
        ['14', 2],
        ['15', 2],
        ['16', 2],
        ['17', 2],
        ['18', 2],
        ['19', 2],
        ['20', 2],
        ['41', 2],
        ['42', 2],
        ['61', 2],
        ['62', 2],
        ['86', 2],
      ]),
    });

    expect(result.ok).toBe(true);
  });

  it('rejects art limit overflow', () => {
    const result = validateDeckLegality(rawCardCatalog, {
      characterId: '1',
      cards: buildCards([
        ['61', 2],
        ['62', 2],
        ['63', 2],
        ['64', 2],
        ['65', 2],
        ['1', 2],
        ['2', 2],
        ['3', 2],
        ['4', 2],
        ['5', 2],
        ['6', 2],
        ['7', 2],
        ['8', 2],
        ['9', 2],
        ['81', 2],
      ]),
    });

    expect(result.ok).toBe(false);
    expect(result.summary.artCards).toBe(10);
    expect(result.issues.some((issue) => issue.code === 'deck_art_limit_exceeded')).toBe(true);
  });

  it('rejects modifier limit overflow', () => {
    const result = validateDeckLegality(rawCardCatalog, {
      characterId: '1',
      cards: buildCards([
        ['41', 2],
        ['42', 2],
        ['43', 2],
        ['44', 2],
        ['45', 2],
        ['1', 2],
        ['2', 2],
        ['3', 2],
        ['4', 2],
        ['5', 2],
        ['6', 2],
        ['7', 2],
        ['8', 2],
        ['61', 2],
        ['81', 2],
      ]),
    });

    expect(result.ok).toBe(false);
    expect(result.summary.modifierCards).toBe(10);
    expect(result.issues.some((issue) => issue.code === 'deck_modifier_limit_exceeded')).toBe(true);
  });
});
