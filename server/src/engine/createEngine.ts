import {
  CardDefinition,
  CardInstance,
  GameEngine,
  CardRegistry,
  createInitialState,
} from '../../../game-core/src';

export const createEngine = (seed: number): GameEngine => {
  const cards: CardDefinition[] = [
    {
      id: 'fireball',
      name: 'Fireball',
      type: 'spell',
      manaCost: 3,
      speed: 2,
      targetType: 'enemyCharacter',
      effects: [{ type: 'DamageEffect', value: 5, attackType: 'spell' }],
    },
    {
      id: 'shield',
      name: 'Guardian Shield',
      type: 'spell',
      manaCost: 2,
      speed: 1,
      targetType: 'self',
      effects: [{ type: 'ShieldEffect', value: 4 }],
    },
  ];

  const registry = new CardRegistry(cards);

  const deckA: CardInstance[] = [
    { instanceId: 'card_1', ownerId: 'player_1', definitionId: 'fireball', location: 'deck' },
    { instanceId: 'card_2', ownerId: 'player_1', definitionId: 'shield', location: 'deck' },
  ];
  const deckB: CardInstance[] = [
    { instanceId: 'card_3', ownerId: 'player_2', definitionId: 'fireball', location: 'deck' },
    { instanceId: 'card_4', ownerId: 'player_2', definitionId: 'shield', location: 'deck' },
  ];

  const state = createInitialState(seed, [
    { playerId: 'player_1', characterId: 'char_1', deck: deckA },
    { playerId: 'player_2', characterId: 'char_2', deck: deckB },
  ]);

  return new GameEngine(state, registry);
};
