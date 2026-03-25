import { describe, expect, it } from 'vitest';
import { sortRoundActions } from '../src/rounds/sortRoundActions';
import { CompiledRoundAction } from '../src/types';

const createCompiledAction = (
  overrides: Partial<CompiledRoundAction>,
): CompiledRoundAction => ({
  intent: {
    intentId: 'intent_default',
    roundNumber: 1,
    playerId: 'player_1',
    actorId: 'char_1',
    queueIndex: 0,
    kind: 'Evade',
  },
  layer: 'other_modifiers',
  priority: 0,
  roundInitiativePlayerId: 'player_1',
  ...overrides,
});

describe('sortRoundActions', () => {
  it('sorts by layer, then priority, then queueIndex, then initiative, then stable tie-breakers', () => {
    const actions: CompiledRoundAction[] = [
      createCompiledAction({
        intent: {
          intentId: 'intent_attack',
          roundNumber: 1,
          playerId: 'player_2',
          actorId: 'creature_2',
          queueIndex: 0,
          kind: 'Attack',
          sourceCreatureId: 'creature_2',
          target: { targetId: 'char_1', targetType: 'enemyCharacter' },
        },
        layer: 'attacks',
        priority: 3,
        roundInitiativePlayerId: 'player_1',
      }),
      createCompiledAction({
        intent: {
          intentId: 'intent_mod_b',
          roundNumber: 1,
          playerId: 'player_2',
          actorId: 'char_b',
          queueIndex: 0,
          kind: 'Evade',
        },
        layer: 'other_modifiers',
        priority: 2,
        roundInitiativePlayerId: 'player_1',
      }),
      createCompiledAction({
        intent: {
          intentId: 'intent_mod_a',
          roundNumber: 1,
          playerId: 'player_1',
          actorId: 'char_a',
          queueIndex: 0,
          kind: 'Evade',
        },
        layer: 'other_modifiers',
        priority: 2,
        roundInitiativePlayerId: 'player_1',
      }),
      createCompiledAction({
        intent: {
          intentId: 'intent_summon',
          roundNumber: 1,
          playerId: 'player_2',
          actorId: 'char_2',
          queueIndex: 3,
          kind: 'Summon',
          cardInstanceId: 'card_1',
        },
        layer: 'summon',
        priority: 1,
        roundInitiativePlayerId: 'player_1',
      }),
      createCompiledAction({
        intent: {
          intentId: 'intent_mod_c',
          roundNumber: 1,
          playerId: 'player_1',
          actorId: 'char_c',
          queueIndex: 1,
          kind: 'Evade',
        },
        layer: 'other_modifiers',
        priority: 2,
        roundInitiativePlayerId: 'player_1',
      }),
    ];

    const sorted = sortRoundActions(actions);

    expect(sorted.map((item) => item.intent.intentId)).toEqual([
      'intent_summon',
      'intent_mod_a',
      'intent_mod_b',
      'intent_mod_c',
      'intent_attack',
    ]);
  });
});
