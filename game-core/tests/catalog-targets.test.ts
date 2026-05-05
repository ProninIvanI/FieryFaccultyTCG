import { describe, expect, it } from 'vitest';
import rawCardCatalog from '../data/cards.json';
import { CardRegistry } from '../src/cards/CardRegistry';
import { normalizeCatalog, toCardDefinitionFromCatalog } from '../src/cards/catalog';
import { createInitialState } from '../src/engine/createInitialState';
import { validateRoundDraft } from '../src/rounds/validateRoundDraft';
import type { CardInstance, PlayerRoundDraft } from '../src/types';

const catalogCards = (rawCardCatalog as { cards: unknown[] }).cards;

const hasDamageEffect = (effects: ReturnType<typeof normalizeCatalog>['cards'][number]['effects']): boolean =>
  effects.some((effect) => effect.type === 'DamageEffect');

const hasMassDamageEffect = (effects: ReturnType<typeof normalizeCatalog>['cards'][number]['effects']): boolean =>
  effects.some((effect) => effect.type === 'DamageEffect' && (effect.appliesToAllEnemies || effect.appliesToAllCreatures));

const buildRegistryFromCatalog = (): CardRegistry =>
  new CardRegistry(
    catalogCards.flatMap((card) => {
      const definition = toCardDefinitionFromCatalog(card);
      return definition ? [definition] : [];
    }),
  );

const buildDeck = (cardsInDeck: Array<{ instanceId: string; definitionId: string; ownerId: string }>): CardInstance[] =>
  cardsInDeck.map((card) => ({
    instanceId: card.instanceId,
    ownerId: card.ownerId,
    definitionId: card.definitionId,
    location: 'deck',
  }));

describe('catalog target types', () => {
  it('marks direct single-target damage spells as enemyAny', () => {
    const directDamageSpells = normalizeCatalog(rawCardCatalog).cards.filter(
      (card) =>
        card.catalogType === 'spell' &&
        card.spellKind === 'damage' &&
        hasDamageEffect(card.effects) &&
        !hasMassDamageEffect(card.effects),
    );

    expect(directDamageSpells.map((card) => card.name)).toEqual([
      'Огненный шар',
      'Пылающий луч',
      'Вспышка пламени',
      'Лавовый поток',
      'Водяная стрела',
      'Ледяной шип',
      'Каменный удар',
      'Удар валуна',
      'Гнев земли',
      'Воздушный клинок',
      'Ураганный удар',
      'Молния',
      'Громовой разряд',
    ]);
    expect(directDamageSpells.every((card) => card.targetType === 'enemyAny')).toBe(true);
  });

  it('accepts a real direct damage spell draft against an enemy creature', () => {
    const registry = buildRegistryFromCatalog();
    const state = createInitialState(123, [
      {
        playerId: 'player_1',
        characterId: 'char_1',
        deck: buildDeck([{ instanceId: 'fireball_1', definitionId: '1', ownerId: 'player_1' }]),
      },
      {
        playerId: 'player_2',
        characterId: 'char_2',
        deck: buildDeck([]),
      },
    ]);

    state.creatures.enemy_creature_1 = {
      creatureId: 'enemy_creature_1',
      ownerId: 'player_2',
      hp: 3,
      maxHp: 3,
      attack: 2,
      speed: 5,
      summonedAtRound: 0,
    };

    const draft: PlayerRoundDraft = {
      playerId: 'player_1',
      roundNumber: 1,
      locked: false,
      intents: [
        {
          intentId: 'fireball_1',
          roundNumber: 1,
          playerId: 'player_1',
          actorId: 'char_1',
          queueIndex: 0,
          kind: 'CastSpell',
          cardInstanceId: 'fireball_1',
          target: {
            targetType: 'enemyAny',
            targetId: 'enemy_creature_1',
          },
        },
      ],
    };

    expect(validateRoundDraft(state, registry, draft)).toEqual({ ok: true });
  });
});
