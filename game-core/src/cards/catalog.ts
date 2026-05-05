import {
  ArtKind,
  CardDefinition,
  CardSchool,
  CardType,
  EffectDefinition,
  ModifierKind,
  ResolutionRole,
  SpellKind,
  TargetType,
} from '../types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export interface CatalogCardMetadata {
  id: string;
  name: string;
  catalogType: string;
  definitionType: CardType;
  school?: CardSchool;
  mana: number;
  speed: number;
  effect?: string;
  hp?: number;
  attack?: number;
  targetType: TargetType;
  resolutionRole: ResolutionRole;
  effects: EffectDefinition[];
  spellKind?: SpellKind;
  modifierKind?: ModifierKind;
  artKind?: ArtKind;
}

export interface CatalogCharacterMetadata {
  id: string;
  name: string;
  faculty: string;
  hp: number;
  mana: number;
  focus: number;
  strength: number;
  agility: number;
  ability: string;
}

const isTargetType = (value: unknown): value is TargetType =>
  value === 'enemyCharacter' ||
  value === 'enemyAny' ||
  value === 'allyCharacter' ||
  value === 'creature' ||
  value === 'self' ||
  value === 'any';

const isResolutionRole = (value: unknown): value is ResolutionRole =>
  value === 'summon' ||
  value === 'offensive_spell' ||
  value === 'defensive_spell' ||
  value === 'control_spell' ||
  value === 'support_spell' ||
  value === 'modifier' ||
  value === 'artifact';

const isSpellKind = (value: unknown): value is SpellKind =>
  value === 'damage' ||
  value === 'shield' ||
  value === 'heal' ||
  value === 'buff' ||
  value === 'debuff' ||
  value === 'interrupt' ||
  value === 'trap' ||
  value === 'displacement' ||
  value === 'dot';

const isModifierKind = (value: unknown): value is ModifierKind =>
  value === 'offense' ||
  value === 'defense' ||
  value === 'utility' ||
  value === 'replication' ||
  value === 'resource';

const isArtKind = (value: unknown): value is ArtKind =>
  value === 'attack_art' ||
  value === 'defense_art' ||
  value === 'mobility_art' ||
  value === 'support_art' ||
  value === 'resource_art';

const toEffectDefinition = (value: unknown): EffectDefinition | null => {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return null;
  }

    switch (value.type) {
      case 'DamageEffect':
      case 'HealEffect':
      case 'ShieldEffect':
      case 'BuffEffect':
      case 'DebuffEffect':
      case 'SummonEffect':
      case 'CannotEvadeEffect':
      case 'SkipActionEffect':
      case 'InterruptSlowSpellEffect':
      case 'TrapOnOffensiveActionEffect':
      case 'NextSpellDamageBoostEffect':
      case 'NextSpellSpeedBoostEffect':
      case 'NextSpellIgnoreShieldEffect':
      case 'NextSpellIgnoreEvadeEffect':
      case 'NextSpellManaDiscountEffect':
      case 'NextSpellRepeatEffect':
      case 'RestoreManaEffect':
      case 'DrawCardEffect':
      case 'NextAttackDamageBoostEffect':
      case 'RoundSpeedBuffEffect':
        return {
          type: value.type,
        ...(typeof value.value === 'number' ? { value: value.value } : {}),
        ...(value.attackType === 'physical' || value.attackType === 'spell' || value.attackType === 'art' || value.attackType === 'creature'
          ? { attackType: value.attackType }
          : {}),
        ...(typeof value.duration === 'number' ? { duration: value.duration } : {}),
        ...(typeof value.creatureDefinitionId === 'string' ? { creatureDefinitionId: value.creatureDefinitionId } : {}),
        ...(value.stat === 'attack' || value.stat === 'speed' || value.stat === 'shield' || value.stat === 'hp' || value.stat === 'agility'
          ? { stat: value.stat }
          : {}),
        ...(typeof value.targetCount === 'number' ? { targetCount: value.targetCount } : {}),
        ...(typeof value.ignoreShield === 'number' ? { ignoreShield: value.ignoreShield } : {}),
        ...(typeof value.ignoreEvade === 'boolean' ? { ignoreEvade: value.ignoreEvade } : {}),
        ...(typeof value.repeatNextTurn === 'boolean' ? { repeatNextTurn: value.repeatNextTurn } : {}),
        ...(typeof value.appliesToAllEnemies === 'boolean' ? { appliesToAllEnemies: value.appliesToAllEnemies } : {}),
        ...(typeof value.appliesToAllCreatures === 'boolean' ? { appliesToAllCreatures: value.appliesToAllCreatures } : {}),
      };
    default:
      return null;
  }
};

export interface NormalizedCatalog {
  cards: CatalogCardMetadata[];
  characters: CatalogCharacterMetadata[];
}

export type CatalogSchool = 'fire' | 'water' | 'earth' | 'air';
export type CatalogCardUiType = 'spell' | 'summon' | 'art' | 'modifier';

export interface CatalogCardSummary {
  id: string;
  name: string;
  type: CatalogCardUiType;
  school?: CatalogSchool;
  mana: number;
  speed?: number;
  effect?: string;
  hp?: number;
  attack?: number;
}

export interface CatalogCharacterSummary {
  id: string;
  name: string;
  faculty: CatalogSchool;
  hp: number;
  mana: number;
  focus: number;
  strength: number;
  agility: number;
  ability: string;
}

const normalizeCatalogText = (value: string): string => value.replace(/\u2212/g, '-');

export const toCardTypeFromCatalog = (value: unknown): CardType => {
  switch (value) {
    case 'spell':
      return 'spell';
    case 'summon':
      return 'creature';
    default:
      return 'artifact';
  }
};

export const toCatalogSchool = (value: unknown): CatalogSchool | undefined => {
  switch (value) {
    case 'fire':
    case 'water':
    case 'earth':
    case 'air':
      return value;
    default:
      return undefined;
  }
};

export const toCatalogCardUiType = (value: unknown): CatalogCardUiType | null => {
  switch (value) {
    case 'spell':
    case 'summon':
    case 'art':
    case 'modifier':
      return value;
    default:
      return null;
  }
};

export const getCatalogSchoolLabel = (school: CatalogSchool): string => {
  switch (school) {
    case 'fire':
      return 'Огонь';
    case 'water':
      return 'Вода';
    case 'earth':
      return 'Земля';
    case 'air':
      return 'Воздух';
  }
};

export const getCatalogCardTypeLabel = (
  type: CatalogCardUiType,
  form: 'single' | 'plural' = 'single'
): string => {
  switch (type) {
    case 'spell':
      return form === 'plural' ? 'Заклинания' : 'Заклинание';
    case 'modifier':
      return form === 'plural' ? 'Модификаторы' : 'Модификатор';
    case 'art':
      return 'Искусство';
    case 'summon':
      return form === 'plural' ? 'Призывы' : 'Призыв';
  }
};

export const inferTargetTypeFromCatalog = (value: unknown): TargetType => {
  switch (value) {
    case 'summon':
      return 'self';
    case 'modifier':
    case 'art':
      return 'self';
    default:
      return 'enemyCharacter';
  }
};

export const inferResolutionRoleFromCatalog = (catalogType: unknown): ResolutionRole => {
  switch (catalogType) {
    case 'summon':
      return 'summon';
    case 'modifier':
      return 'modifier';
    case 'art':
      return 'artifact';
    default:
      return 'offensive_spell';
  }
};

export const toCatalogCardMetadata = (value: unknown): CatalogCardMetadata | null => {
  if (!isRecord(value) || typeof value.id !== 'number' || typeof value.name !== 'string') {
    return null;
  }

  return {
    id: String(value.id),
    name: value.name,
    catalogType: typeof value.type === 'string' ? value.type : '',
    definitionType: toCardTypeFromCatalog(value.type),
    ...(toCatalogSchool(value.school) ? { school: toCatalogSchool(value.school) } : {}),
    mana: typeof value.mana === 'number' ? value.mana : 0,
    speed: typeof value.speed === 'number' ? value.speed : 0,
    ...(typeof value.effect === 'string' ? { effect: value.effect } : {}),
    ...(typeof value.hp === 'number' ? { hp: value.hp } : {}),
    ...(typeof value.attack === 'number' ? { attack: value.attack } : {}),
    targetType: isTargetType(value.targetType) ? value.targetType : inferTargetTypeFromCatalog(value.type),
    resolutionRole: isResolutionRole(value.resolutionRole)
      ? value.resolutionRole
      : inferResolutionRoleFromCatalog(value.type),
    effects: Array.isArray(value.effects)
      ? value.effects.flatMap((effect) => {
          const definition = toEffectDefinition(effect);
          return definition ? [definition] : [];
        })
      : [],
    ...(isSpellKind(value.spellKind) ? { spellKind: value.spellKind } : {}),
    ...(isModifierKind(value.modifierKind) ? { modifierKind: value.modifierKind } : {}),
    ...(isArtKind(value.artKind) ? { artKind: value.artKind } : {}),
  };
};

export const toCatalogCharacterMetadata = (value: unknown): CatalogCharacterMetadata | null => {
  if (
    !isRecord(value) ||
    typeof value.id !== 'number' ||
    typeof value.name !== 'string' ||
    typeof value.faculty !== 'string' ||
    typeof value.hp !== 'number' ||
    typeof value.mana !== 'number' ||
    typeof value.focus !== 'number' ||
    typeof value.strength !== 'number' ||
    typeof value.agility !== 'number' ||
    typeof value.ability !== 'string'
  ) {
    return null;
  }

  return {
    id: String(value.id),
    name: value.name,
    faculty: value.faculty,
    hp: value.hp,
    mana: value.mana,
    focus: value.focus,
    strength: value.strength,
    agility: value.agility,
    ability: value.ability,
  };
};

export const toCardDefinitionFromCatalog = (value: unknown): CardDefinition | null => {
  const metadata = toCatalogCardMetadata(value);
  if (!metadata) {
    return null;
  }

  return {
    id: metadata.id,
    name: metadata.name,
    type: metadata.definitionType,
    manaCost: metadata.mana,
    speed: metadata.speed,
    targetType: metadata.targetType,
    resolutionRole: metadata.resolutionRole,
    effects: metadata.effects,
    ...(metadata.school ? { school: metadata.school } : {}),
    ...(metadata.effect ? { effectText: metadata.effect } : {}),
    ...(typeof metadata.hp === 'number' ? { hp: metadata.hp } : {}),
    ...(typeof metadata.attack === 'number' ? { attack: metadata.attack } : {}),
    ...(metadata.spellKind ? { spellKind: metadata.spellKind } : {}),
    ...(metadata.modifierKind ? { modifierKind: metadata.modifierKind } : {}),
    ...(metadata.artKind ? { artKind: metadata.artKind } : {}),
  };
};

export const normalizeCatalog = (value: unknown): NormalizedCatalog => {
  if (!isRecord(value)) {
    return { cards: [], characters: [] };
  }

  const cards = Array.isArray(value.cards)
    ? value.cards.flatMap((card) => {
        const metadata = toCatalogCardMetadata(card);
        return metadata ? [metadata] : [];
      })
    : [];

  const characters = Array.isArray(value.characters)
    ? value.characters.flatMap((character) => {
        const metadata = toCatalogCharacterMetadata(character);
        return metadata ? [metadata] : [];
      })
    : [];

  return { cards, characters };
};

export const buildCatalogCardSummaries = (value: unknown): CatalogCardSummary[] =>
  normalizeCatalog(value).cards.flatMap((metadata) => {
    const type = toCatalogCardUiType(metadata.catalogType);
    if (!type) {
      return [];
    }

    const school = toCatalogSchool(metadata.school);
    return [
      {
        id: metadata.id,
        name: normalizeCatalogText(metadata.name),
        type,
        mana: metadata.mana,
        speed: metadata.speed || undefined,
        effect: metadata.effect ? normalizeCatalogText(metadata.effect) : undefined,
        hp: metadata.hp,
        attack: metadata.attack,
        ...(school ? { school } : {}),
      },
    ];
  });

export const buildCatalogCharacterSummaries = (value: unknown): CatalogCharacterSummary[] =>
  normalizeCatalog(value).characters.flatMap((metadata) => {
    const faculty = toCatalogSchool(metadata.faculty);
    if (!faculty) {
      return [];
    }

    return [
      {
        id: metadata.id,
        name: normalizeCatalogText(metadata.name),
        faculty,
        hp: metadata.hp,
        mana: metadata.mana,
        focus: metadata.focus,
        strength: metadata.strength,
        agility: metadata.agility,
        ability: normalizeCatalogText(metadata.ability),
      },
    ];
  });
