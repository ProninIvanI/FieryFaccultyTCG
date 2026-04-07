import { describe, expect, it } from 'vitest';
import { CardRegistry } from '../src/cards/CardRegistry';
import { createInitialState } from '../src/engine/createInitialState';
import { GameEngine } from '../src/engine/GameEngine';
import {
  CardDefinition,
  CastSpellAction,
  EndTurnAction,
  PlayCardAction,
} from '../src/types';

const definitions: CardDefinition[] = [
  {
    id: 'focus-spell',
    name: 'Focused Spell',
    type: 'artifact',
    manaCost: 1,
    speed: 0,
    targetType: 'self',
    resolutionRole: 'modifier',
    modifierKind: 'offense',
    effects: [{ type: 'NextSpellDamageBoostEffect', value: 2 }],
  },
  {
    id: 'wide-flow',
    name: 'Wide Flow',
    type: 'artifact',
    manaCost: 1,
    speed: 0,
    targetType: 'self',
    resolutionRole: 'modifier',
    modifierKind: 'utility',
    effects: [{ type: 'NextSpellSpeedBoostEffect', value: 1 }],
  },
  {
    id: 'piercing-surge',
    name: 'Piercing Surge',
    type: 'artifact',
    manaCost: 1,
    speed: 0,
    targetType: 'self',
    resolutionRole: 'modifier',
    modifierKind: 'offense',
    effects: [{ type: 'NextSpellIgnoreShieldEffect', value: 2 }],
  },
  {
    id: 'perfect-accuracy',
    name: 'Perfect Accuracy',
    type: 'artifact',
    manaCost: 1,
    speed: 0,
    targetType: 'self',
    resolutionRole: 'modifier',
    modifierKind: 'offense',
    effects: [{ type: 'NextSpellIgnoreEvadeEffect' }],
  },
  {
    id: 'mana-resonance',
    name: 'Mana Resonance',
    type: 'artifact',
    manaCost: 1,
    speed: 0,
    targetType: 'self',
    resolutionRole: 'modifier',
    modifierKind: 'resource',
    effects: [{ type: 'NextSpellManaDiscountEffect', value: 1 }],
  },
  {
    id: 'lingering-weave',
    name: 'Lingering Weave',
    type: 'artifact',
    manaCost: 1,
    speed: 0,
    targetType: 'self',
    resolutionRole: 'modifier',
    modifierKind: 'utility',
    effects: [{ type: 'NextSpellRepeatEffect' }],
  },
  {
    id: 'precise-strike',
    name: 'Precise Strike',
    type: 'artifact',
    manaCost: 0,
    speed: 0,
    targetType: 'self',
    resolutionRole: 'artifact',
    artKind: 'attack_art',
    effects: [{ type: 'NextAttackDamageBoostEffect', value: 2 }],
  },
  {
    id: 'meditation',
    name: 'Meditation',
    type: 'artifact',
    manaCost: 0,
    speed: 0,
    targetType: 'self',
    resolutionRole: 'artifact',
    artKind: 'resource_art',
    effects: [
      { type: 'RestoreManaEffect', value: 1 },
      { type: 'DrawCardEffect', value: 1 },
    ],
  },
  {
    id: 'battle-step',
    name: 'Battle Step',
    type: 'artifact',
    manaCost: 0,
    speed: 0,
    targetType: 'creature',
    resolutionRole: 'artifact',
    artKind: 'mobility_art',
    effects: [{ type: 'RoundSpeedBuffEffect', value: 2 }],
  },
  {
    id: 'spark',
    name: 'Spark',
    type: 'spell',
    manaCost: 1,
    speed: 5,
    targetType: 'enemyCharacter',
    resolutionRole: 'offensive_spell',
    effects: [{ type: 'DamageEffect', value: 2, attackType: 'spell' }],
  },
];

const buildEngine = () => {
  const registry = new CardRegistry(definitions);
  const state = createInitialState(123, [
    { playerId: 'player_1', characterId: 'char_1', deck: [] },
    { playerId: 'player_2', characterId: 'char_2', deck: [] },
  ]);

  state.players.player_1.mana = 10;
  state.players.player_2.mana = 10;
  state.players.player_1.actionPoints = 3;
  state.players.player_2.actionPoints = 3;

  return { engine: new GameEngine(state, registry), state };
};

const giveCard = (
  engineState: ReturnType<typeof buildEngine>['state'],
  ownerId: 'player_1' | 'player_2',
  instanceId: string,
  definitionId: string,
) => {
  engineState.cardInstances[instanceId] = {
    instanceId,
    ownerId,
    definitionId,
    location: 'hand',
  };
  engineState.hands[ownerId].push(instanceId);
};

const playCard = (
  playerId: 'player_1' | 'player_2',
  actorId: 'char_1' | 'char_2',
  cardInstanceId: string,
  targetId: string,
  targetType: PlayCardAction['targetType'],
): PlayCardAction => ({
  type: 'PlayCard',
  playerId,
  actorId,
  cardInstanceId,
  targetId,
  targetType,
});

const castSpell = (
  playerId: 'player_1' | 'player_2',
  actorId: 'char_1' | 'char_2',
  cardInstanceId: string,
  targetId: string,
): CastSpellAction => ({
  type: 'CastSpell',
  playerId,
  actorId,
  cardInstanceId,
  targetId,
  targetType: 'enemyCharacter',
});

const endTurn = (
  playerId: 'player_1' | 'player_2',
  actorId: 'char_1' | 'char_2',
): EndTurnAction => ({
  type: 'EndTurn',
  playerId,
  actorId,
});

describe('game-core safe meta-rule effects', () => {
  it('boosts only the next spell damage', () => {
    const { engine, state } = buildEngine();
    giveCard(state, 'player_1', 'focus_1', 'focus-spell');
    giveCard(state, 'player_1', 'spark_1', 'spark');
    giveCard(state, 'player_1', 'spark_2', 'spark');

    expect(engine.processAction(playCard('player_1', 'char_1', 'focus_1', 'char_1', 'self'))).toEqual({ ok: true });
    expect(engine.processAction(castSpell('player_1', 'char_1', 'spark_1', 'char_2'))).toEqual({ ok: true });
    expect(state.characters.char_2.hp).toBe(16);

    expect(engine.processAction(castSpell('player_1', 'char_1', 'spark_2', 'char_2'))).toEqual({ ok: true });
    expect(state.characters.char_2.hp).toBe(14);
  });

  it('lets the next spell use extra speed for evade checks', () => {
    const { engine, state } = buildEngine();
    state.characters.char_2.dexterity = 5;
    giveCard(state, 'player_1', 'flow_1', 'wide-flow');
    giveCard(state, 'player_1', 'spark_1', 'spark');

    expect(engine.processAction(playCard('player_1', 'char_1', 'flow_1', 'char_1', 'self'))).toEqual({ ok: true });
    expect(engine.processAction(castSpell('player_1', 'char_1', 'spark_1', 'char_2'))).toEqual({ ok: true });
    expect(state.characters.char_2.hp).toBe(18);
  });

  it('lets the next spell ignore part of shield', () => {
    const { engine, state } = buildEngine();
    state.characters.char_2.shield = { energy: 3, concentrationCost: 0 };
    giveCard(state, 'player_1', 'surge_1', 'piercing-surge');
    giveCard(state, 'player_1', 'spark_1', 'spark');

    expect(engine.processAction(playCard('player_1', 'char_1', 'surge_1', 'char_1', 'self'))).toEqual({ ok: true });
    expect(engine.processAction(castSpell('player_1', 'char_1', 'spark_1', 'char_2'))).toEqual({ ok: true });

    expect(state.characters.char_2.hp).toBe(19);
    expect(state.characters.char_2.shield).toBeUndefined();
  });

  it('repeats the next spell on the following turn', () => {
    const { engine, state } = buildEngine();
    giveCard(state, 'player_1', 'weave_1', 'lingering-weave');
    giveCard(state, 'player_1', 'spark_1', 'spark');

    expect(engine.processAction(playCard('player_1', 'char_1', 'weave_1', 'char_1', 'self'))).toEqual({ ok: true });
    expect(engine.processAction(castSpell('player_1', 'char_1', 'spark_1', 'char_2'))).toEqual({ ok: true });
    expect(state.characters.char_2.hp).toBe(18);

    expect(engine.processAction(endTurn('player_1', 'char_1'))).toEqual({ ok: true });
    expect(state.characters.char_2.hp).toBe(16);
  });

  it('lets the next spell ignore evade completely', () => {
    const { engine, state } = buildEngine();
    state.characters.char_2.dexterity = 99;
    giveCard(state, 'player_1', 'accuracy_1', 'perfect-accuracy');
    giveCard(state, 'player_1', 'spark_1', 'spark');

    expect(engine.processAction(playCard('player_1', 'char_1', 'accuracy_1', 'char_1', 'self'))).toEqual({ ok: true });
    expect(engine.processAction(castSpell('player_1', 'char_1', 'spark_1', 'char_2'))).toEqual({ ok: true });
    expect(state.characters.char_2.hp).toBe(18);
  });

  it('discounts the next spell mana cost by one', () => {
    const { engine, state } = buildEngine();
    state.players.player_1.mana = 2;
    giveCard(state, 'player_1', 'resonance_1', 'mana-resonance');
    giveCard(state, 'player_1', 'spark_1', 'spark');

    expect(engine.processAction(playCard('player_1', 'char_1', 'resonance_1', 'char_1', 'self'))).toEqual({ ok: true });
    expect(state.players.player_1.mana).toBe(1);
    expect(engine.processAction(castSpell('player_1', 'char_1', 'spark_1', 'char_2'))).toEqual({ ok: true });
    expect(state.players.player_1.mana).toBe(1);
  });

  it('restores mana and draws a card from meditation', () => {
    const { engine, state } = buildEngine();
    state.players.player_1.mana = 4;
    giveCard(state, 'player_1', 'meditation_1', 'meditation');
    state.cardInstances.draw_1 = {
      instanceId: 'draw_1',
      ownerId: 'player_1',
      definitionId: 'spark',
      location: 'deck',
    };
    state.decks.player_1.cards.push('draw_1');

    expect(engine.processAction(playCard('player_1', 'char_1', 'meditation_1', 'char_1', 'self'))).toEqual({ ok: true });
    expect(state.players.player_1.mana).toBe(5);
    expect(state.hands.player_1).toContain('draw_1');
    expect(state.cardInstances.draw_1.location).toBe('hand');
  });

  it('boosts the next creature attack and clears speed buff on the next round', () => {
    const { engine, state } = buildEngine();
    giveCard(state, 'player_1', 'step_1', 'battle-step');
    giveCard(state, 'player_1', 'strike_1', 'precise-strike');
    state.creatures.wolf_1 = {
      creatureId: 'wolf_1',
      ownerId: 'player_1',
      definitionId: 'wolf',
      hp: 5,
      maxHp: 5,
      attack: 3,
      speed: 2,
      summonedAtRound: 0,
    };

    expect(engine.processAction(playCard('player_1', 'char_1', 'step_1', 'wolf_1', 'creature'))).toEqual({ ok: true });
    expect(state.creatures.wolf_1.speed).toBe(4);

    expect(engine.processAction(playCard('player_1', 'char_1', 'strike_1', 'char_1', 'self'))).toEqual({ ok: true });
    expect(
      engine.submitRoundDraft('player_1', 1, [
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
      ]),
    ).toEqual({ ok: true });
    expect(engine.submitRoundDraft('player_2', 1, [])).toEqual({ ok: true });
    expect(engine.lockRoundDraft('player_1', 1)).toEqual({ ok: true });
    expect(engine.lockRoundDraft('player_2', 1)).toEqual({ ok: true });
    expect(engine.resolveRoundIfReady()).not.toBeNull();

    expect(state.characters.char_2.hp).toBe(15);
    expect(state.creatures.wolf_1.speed).toBe(2);
  });
});
