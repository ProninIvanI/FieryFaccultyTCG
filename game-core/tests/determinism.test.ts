import { describe, expect, it } from 'vitest';
import { CardRegistry } from '../src/cards/CardRegistry';
import { GameEngine } from '../src/engine/GameEngine';
import { createInitialState } from '../src/engine/createInitialState';
import { CardDefinition, CardInstance, CastSpellAction } from '../src/types';

const buildEngine = (seed: number) => {
  const cards: CardDefinition[] = [
    {
      id: 'fireball',
      name: 'Fireball',
      type: 'spell',
      manaCost: 1,
      speed: 1,
      targetType: 'enemyCharacter',
      effects: [{ type: 'DamageEffect', value: 2, attackType: 'spell' }],
    },
  ];
  const registry = new CardRegistry(cards);
  const deckA: CardInstance[] = [
    { instanceId: 'card_1', ownerId: 'player_1', definitionId: 'fireball', location: 'hand' },
  ];
  const deckB: CardInstance[] = [
    { instanceId: 'card_2', ownerId: 'player_2', definitionId: 'fireball', location: 'hand' },
  ];
  const state = createInitialState(seed, [
    { playerId: 'player_1', characterId: 'char_1', deck: deckA },
    { playerId: 'player_2', characterId: 'char_2', deck: deckB },
  ]);
  state.players.player_1.mana = 5;
  return new GameEngine(state, registry);
};

describe('game-core determinism', () => {
  it('produces identical state for same seed and actions', () => {
    const engineA = buildEngine(123);
    const engineB = buildEngine(123);
    const action: CastSpellAction = {
      type: 'CastSpell',
      actorId: 'char_1',
      playerId: 'player_1',
      cardInstanceId: 'card_1',
      targetId: 'char_2',
      targetType: 'enemyCharacter',
    };

    engineA.processAction(action);
    engineB.processAction(action);

    expect(JSON.stringify(engineA.getState())).toEqual(JSON.stringify(engineB.getState()));
  });
});
