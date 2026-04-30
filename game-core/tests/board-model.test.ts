import { describe, expect, it } from 'vitest';
import { CardRegistry } from '../src/cards/CardRegistry';
import {
  buildPlayerBoardModel,
  toCreatureBoardItemId,
  toEffectBoardItemId,
} from '../src/board/buildPlayerBoardModel';
import { GameEngine } from '../src/engine/GameEngine';
import { createInitialState } from '../src/engine/createInitialState';
import {
  CardDefinition,
  CardInstance,
  PlayerRoundDraft,
  ResolvedRoundAction,
  RoundResolutionResult,
  SummonAction,
} from '../src/types';

const definitions: CardDefinition[] = [
  {
    id: 'guardian-wolf',
    name: 'Guardian Wolf',
    type: 'creature',
    manaCost: 2,
    speed: 4,
    targetType: 'self',
    effects: [{ type: 'SummonEffect', creatureDefinitionId: 'guardian-wolf' }],
  },
  {
    id: 'barrier',
    name: 'Barrier',
    type: 'spell',
    manaCost: 1,
    speed: 5,
    targetType: 'self',
    effects: [{ type: 'ShieldEffect', value: 3, duration: 2 }],
  },
];

const createResolvedRoundAction = (
  overrides: Partial<ResolvedRoundAction> &
    Pick<
      ResolvedRoundAction,
      'intentId' | 'playerId' | 'kind' | 'actorId' | 'layer' | 'status' | 'reasonCode' | 'summary'
    >,
): ResolvedRoundAction => ({
  orderIndex: 0,
  queueIndex: 0,
  priority: 0,
  source: { type: 'actor', actorId: overrides.actorId },
  ...overrides,
});

const buildDeck = (ownerId: string, cardIds: string[]): CardInstance[] =>
  cardIds.map((definitionId, index) => ({
    instanceId: `card_${ownerId}_${index + 1}`,
    ownerId,
    definitionId,
    location: 'deck',
  }));

describe('board model foundation', () => {
  it('builds board items and round actions from current state and draft', () => {
    const registry = new CardRegistry(definitions);
    const state = createInitialState(7, [
      {
        playerId: 'player_1',
        characterId: 'char_1',
        deck: buildDeck('player_1', ['guardian-wolf', 'barrier', 'barrier']),
      },
      {
        playerId: 'player_2',
        characterId: 'char_2',
        deck: buildDeck('player_2', ['barrier', 'barrier', 'barrier']),
      },
    ]);

    state.creatures.wolf_1 = {
      creatureId: 'wolf_1',
      ownerId: 'player_1',
      sourceCardInstanceId: 'card_player_1_1',
      definitionId: 'guardian-wolf',
      hp: 4,
      maxHp: 4,
      attack: 2,
      speed: 4,
      summonedAtRound: 1,
    };
    state.activeEffects.buff_1 = {
      effectId: 'buff_1',
      type: 'BuffEffect',
      ownerId: 'player_1',
      sourceId: 'char_1',
      sourceCardInstanceId: 'card_player_1_2',
      definitionId: 'barrier',
      targetId: 'wolf_1',
      createdAtTurn: 1,
      duration: 2,
      data: { value: 2 },
    };

    const draft: PlayerRoundDraft = {
      playerId: 'player_1',
      roundNumber: 1,
      locked: false,
      intents: [
        {
          intentId: 'draft_barrier',
          roundNumber: 1,
          playerId: 'player_1',
          actorId: 'char_1',
          queueIndex: 1,
          kind: 'CastSpell',
          cardInstanceId: 'card_player_1_2',
          target: {
            targetId: 'char_1',
            targetType: 'self',
          },
        },
        {
          intentId: 'draft_attack',
          roundNumber: 1,
          playerId: 'player_1',
          actorId: 'wolf_1',
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

    const resolution: RoundResolutionResult = {
      roundNumber: 1,
      playbackFrames: [],
      orderedActions: [
        createResolvedRoundAction({
          intentId: 'draft_barrier',
          playerId: 'player_1',
          kind: 'CastSpell',
          actorId: 'char_1',
          layer: 'defensive_spells',
          target: {
            targetId: 'char_1',
            targetType: 'self',
          },
          cardInstanceId: 'barrier_1',
          definitionId: 'barrier',
          source: { type: 'card', cardInstanceId: 'barrier_1', definitionId: 'barrier' },
          status: 'resolved',
          reasonCode: 'resolved',
          summary: 'Barrier resolved',
        }),
        createResolvedRoundAction({
          orderIndex: 1,
          intentId: 'draft_attack',
          playerId: 'player_1',
          kind: 'Attack',
          actorId: 'wolf_1',
          layer: 'attacks',
          target: {
            targetId: 'char_2',
            targetType: 'enemyCharacter',
          },
          source: { type: 'boardItem', boardItemId: toCreatureBoardItemId('wolf_1') },
          status: 'fizzled',
          reasonCode: 'target_invalidated',
          summary: 'Attack fizzled',
        }),
      ],
    };

    const model = buildPlayerBoardModel(state, registry, draft, resolution);

    expect(model.playerId).toBe('player_1');
    expect(model.boardItems).toHaveLength(2);

    expect(model.boardItems).toContainEqual(
      expect.objectContaining({
        id: toCreatureBoardItemId('wolf_1'),
        runtimeId: 'wolf_1',
        subtype: 'creature',
        lifetimeType: 'persistent',
        sourceCardInstanceId: 'card_player_1_1',
        definitionId: 'guardian-wolf',
        placement: {
          layer: 'summon',
          orderIndex: 0,
          queueIndex: 0,
        },
      }),
    );
    expect(model.boardItems).toContainEqual(
      expect.objectContaining({
        id: toEffectBoardItemId('buff_1'),
        runtimeId: 'buff_1',
        subtype: 'effect',
        lifetimeType: 'persistent',
        sourceCardInstanceId: 'card_player_1_2',
        definitionId: 'barrier',
        placement: {
          layer: 'defensive_spells',
          orderIndex: 1,
          queueIndex: 0,
        },
      }),
    );

    expect(model.roundActions.map((action) => action.id)).toEqual([
      'draft_barrier',
      'draft_attack',
    ]);
    expect(model.roundActions[0]).toMatchObject({
      source: {
        type: 'card',
        cardInstanceId: 'card_player_1_2',
        definitionId: 'barrier',
      },
      placement: {
        layer: 'defensive_spells',
        orderIndex: 0,
        queueIndex: 1,
      },
      status: 'resolved',
      reasonCode: 'resolved',
    });
    expect(model.roundActions[1]).toMatchObject({
      source: {
        type: 'boardItem',
        boardItemId: toCreatureBoardItemId('wolf_1'),
      },
      placement: {
        layer: 'attacks',
        orderIndex: 1,
        queueIndex: 0,
      },
      status: 'fizzled',
      reasonCode: 'target_invalidated',
    });

    expect(model.ribbonEntries).toEqual([
      {
        id: `boardItem:${toCreatureBoardItemId('wolf_1')}`,
        kind: 'boardItem',
        orderIndex: 0,
        layer: 'summon',
        boardItemId: toCreatureBoardItemId('wolf_1'),
        attachedRoundActionIds: ['draft_attack'],
      },
      {
        id: 'roundAction:draft_barrier',
        kind: 'roundAction',
        orderIndex: 1,
        layer: 'defensive_spells',
        roundActionId: 'draft_barrier',
      },
      {
        id: `boardItem:${toEffectBoardItemId('buff_1')}`,
        kind: 'boardItem',
        orderIndex: 2,
        layer: 'defensive_spells',
        boardItemId: toEffectBoardItemId('buff_1'),
        attachedRoundActionIds: [],
      },
    ]);
  });

  it('preserves summon source metadata on created creature state', () => {
    const registry = new CardRegistry(definitions);
    const state = createInitialState(11, [
      {
        playerId: 'player_1',
        characterId: 'char_1',
        deck: buildDeck('player_1', ['guardian-wolf', 'barrier', 'barrier']),
      },
    ]);
    state.players.player_1.mana = 10;
    state.players.player_1.actionPoints = 3;

    const engine = new GameEngine(state, registry);
    const action: SummonAction = {
      type: 'Summon',
      actorId: 'char_1',
      playerId: 'player_1',
      cardInstanceId: 'card_player_1_1',
    };

    expect(engine.processAction(action)).toEqual({ ok: true });

    const creature = Object.values(engine.getState().creatures)[0];
    expect(creature).toBeDefined();
    expect(creature).toMatchObject({
      ownerId: 'player_1',
      sourceCardInstanceId: 'card_player_1_1',
      definitionId: 'guardian-wolf',
    });
  });
});
