import { describe, expect, it } from 'vitest';
import { CardRegistry } from '../src/cards/CardRegistry';
import { createInitialState } from '../src/engine/createInitialState';
import { GameEngine } from '../src/engine/GameEngine';
import {
  CardDefinition,
  CastSpellAction,
  PlayerRoundDraft,
} from '../src/types';

const definitions: CardDefinition[] = [
  {
    id: 'flame-of-rage',
    name: 'Flame of Rage',
    type: 'spell',
    manaCost: 1,
    speed: 4,
    targetType: 'allyCharacter',
    resolutionRole: 'support_spell',
    effects: [{ type: 'NextAttackDamageBoostEffect', value: 2 }],
  },
  {
    id: 'water-flow',
    name: 'Water Flow',
    type: 'spell',
    manaCost: 1,
    speed: 4,
    targetType: 'enemyCharacter',
    resolutionRole: 'offensive_spell',
    effects: [
      { type: 'DamageEffect', value: 2, attackType: 'spell' },
      { type: 'DebuffEffect', value: 1, stat: 'speed' },
    ],
  },
];

describe('game-core spell follow-up effects', () => {
  it('lets a support spell buff the next creature attack', () => {
    const registry = new CardRegistry(definitions);
    const state = createInitialState(123, [
      { playerId: 'player_1', characterId: 'char_1', deck: [] },
      { playerId: 'player_2', characterId: 'char_2', deck: [] },
    ]);

    state.players.player_1.mana = 10;
    state.players.player_1.actionPoints = 3;
    state.cardInstances.flame_1 = {
      instanceId: 'flame_1',
      ownerId: 'player_1',
      definitionId: 'flame-of-rage',
      location: 'hand',
    };
    state.hands.player_1 = ['flame_1'];
    state.creatures.wolf_1 = {
      creatureId: 'wolf_1',
      ownerId: 'player_1',
      hp: 5,
      maxHp: 5,
      attack: 3,
      speed: 4,
      summonedAtRound: 0,
    };

    const engine = new GameEngine(state, registry);
    const castAction: CastSpellAction = {
      type: 'CastSpell',
      actorId: 'char_1',
      playerId: 'player_1',
      cardInstanceId: 'flame_1',
      targetId: 'char_1',
      targetType: 'allyCharacter',
    };

    expect(engine.processAction(castAction)).toEqual({ ok: true });

    const draft: PlayerRoundDraft = {
      playerId: 'player_1',
      roundNumber: 1,
      locked: false,
      intents: [
        {
          intentId: 'attack_1',
          roundNumber: 1,
          playerId: 'player_1',
          actorId: 'char_1',
          queueIndex: 0,
          kind: 'Attack',
          sourceCreatureId: 'wolf_1',
          target: {
            targetId: 'char_2',
            targetType: 'enemyCharacter',
          },
        },
      ],
    };

    expect(engine.submitRoundDraft('player_1', 1, draft.intents)).toEqual({ ok: true });
    expect(engine.submitRoundDraft('player_2', 1, [])).toEqual({ ok: true });
    expect(engine.lockRoundDraft('player_1', 1)).toEqual({ ok: true });
    expect(engine.lockRoundDraft('player_2', 1)).toEqual({ ok: true });
    expect(engine.resolveRoundIfReady()).not.toBeNull();
    expect(state.characters.char_2.hp).toBe(15);
  });

  it('applies damage and speed debuff from water flow', () => {
    const registry = new CardRegistry(definitions);
    const state = createInitialState(123, [
      { playerId: 'player_1', characterId: 'char_1', deck: [] },
      { playerId: 'player_2', characterId: 'char_2', deck: [] },
    ]);

    state.players.player_1.mana = 10;
    state.players.player_1.actionPoints = 3;
    state.cardInstances.water_1 = {
      instanceId: 'water_1',
      ownerId: 'player_1',
      definitionId: 'water-flow',
      location: 'hand',
    };
    state.hands.player_1 = ['water_1'];

    const engine = new GameEngine(state, registry);
    const castAction: CastSpellAction = {
      type: 'CastSpell',
      actorId: 'char_1',
      playerId: 'player_1',
      cardInstanceId: 'water_1',
      targetId: 'char_2',
      targetType: 'enemyCharacter',
    };

    expect(engine.processAction(castAction)).toEqual({ ok: true });
    expect(state.characters.char_2.hp).toBe(18);
    expect(state.characters.char_2.dexterity).toBe(2);
  });
});
