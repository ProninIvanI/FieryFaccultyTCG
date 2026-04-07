import { describe, expect, it } from 'vitest';
import { CardRegistry } from '../src/cards/CardRegistry';
import { GameEngine } from '../src/engine/GameEngine';
import { createInitialState } from '../src/engine/createInitialState';
import {
  CardDefinition,
  CardInstance,
} from '../src/types';

const cards: CardDefinition[] = [
  {
    id: 'whirlwind',
    name: 'Whirlwind',
    type: 'spell',
    manaCost: 1,
    speed: 3,
    targetType: 'creature',
    resolutionRole: 'control_spell',
    effects: [{ type: 'SkipActionEffect' }],
  },
  {
    id: 'wolf',
    name: 'Wolf',
    type: 'creature',
    manaCost: 1,
    speed: 4,
    targetType: 'self',
    resolutionRole: 'summon',
    effects: [{ type: 'SummonEffect', creatureDefinitionId: 'wolf' }],
    hp: 4,
    attack: 2,
  },
];

const buildDeck = (ownerId: string, definitions: string[]): CardInstance[] =>
  definitions.map((definitionId, index) => ({
    instanceId: `card_${ownerId}_${index + 1}`,
    ownerId,
    definitionId,
    location: 'deck',
  }));

describe('game-core whirlwind effect', () => {
  it('makes a targeted creature skip its next action in the same round', () => {
    const registry = new CardRegistry(cards);
    const state = createInitialState(123, [
      {
        playerId: 'player_1',
        characterId: 'char_1',
        deck: buildDeck('player_1', ['whirlwind']),
      },
      {
        playerId: 'player_2',
        characterId: 'char_2',
        deck: buildDeck('player_2', ['wolf']),
      },
    ]);

    state.players.player_1.mana = 5;
    state.players.player_2.mana = 5;
    state.players.player_1.actionPoints = 3;
    state.players.player_2.actionPoints = 3;

    state.creatures.enemy_wolf = {
      creatureId: 'enemy_wolf',
      ownerId: 'player_2',
      definitionId: 'wolf',
      hp: 4,
      maxHp: 4,
      attack: 2,
      speed: 4,
    };

    const engine = new GameEngine(state, registry);

    expect(
      engine.submitRoundDraft('player_1', 1, [
        {
          intentId: 'whirlwind_1',
          roundNumber: 1,
          playerId: 'player_1',
          actorId: 'char_1',
          queueIndex: 0,
          kind: 'CastSpell',
          cardInstanceId: 'card_player_1_1',
          target: {
            targetId: 'enemy_wolf',
            targetType: 'creature',
          },
        },
      ]),
    ).toEqual({ ok: true });

    expect(
      engine.submitRoundDraft('player_2', 1, [
        {
          intentId: 'attack_1',
          roundNumber: 1,
          playerId: 'player_2',
          actorId: 'enemy_wolf',
          queueIndex: 0,
          kind: 'Attack',
          sourceCreatureId: 'enemy_wolf',
          target: {
            targetId: 'char_1',
            targetType: 'enemyCharacter',
          },
        },
      ]),
    ).toEqual({ ok: true });

    expect(engine.lockRoundDraft('player_1', 1)).toEqual({ ok: true });
    expect(engine.lockRoundDraft('player_2', 1)).toEqual({ ok: true });

    const result = engine.resolveRoundIfReady();

    expect(result).not.toBeNull();
    expect(result?.orderedActions.map((entry) => entry.reasonCode)).toEqual([
      'resolved',
      'action_skipped',
    ]);
    expect(engine.getState().characters.char_1.hp).toBe(20);
    expect(engine.getState().creatures.enemy_wolf.skipNextAction).toBe(false);
  });
});

