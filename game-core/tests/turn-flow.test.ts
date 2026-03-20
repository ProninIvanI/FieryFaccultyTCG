import { describe, expect, it } from 'vitest';
import { CardRegistry } from '../src/cards/CardRegistry';
import { GameEngine } from '../src/engine/GameEngine';
import { createInitialState } from '../src/engine/createInitialState';
import { CardDefinition, EndTurnAction, EvadeAction } from '../src/types';

const buildEngine = () => {
  const cards: CardDefinition[] = [];
  const registry = new CardRegistry(cards);
  const state = createInitialState(123, [
    { playerId: 'player_1', characterId: 'char_1', deck: [] },
    { playerId: 'player_2', characterId: 'char_2', deck: [] },
  ]);

  return new GameEngine(state, registry);
};

describe('game-core turn flow', () => {
  it('starts match in action phase', () => {
    const engine = buildEngine();

    expect(engine.getState().phase.current).toBe('ActionPhase');
    expect(engine.getState().turn.activePlayerId).toBe('player_1');
  });

  it('advances turn to the next player after end turn', () => {
    const engine = buildEngine();
    const state = engine.getState();
    state.players.player_2.actionPoints = 0;
    state.players.player_2.mana = 0;

    const action: EndTurnAction = {
      type: 'EndTurn',
      actorId: 'char_1',
      playerId: 'player_1',
    };

    const result = engine.processAction(action);

    expect(result.ok).toBe(true);
    expect(state.turn.number).toBe(2);
    expect(state.turn.activePlayerId).toBe('player_2');
    expect(state.phase.current).toBe('ActionPhase');
    expect(state.players.player_2.actionPoints).toBe(2);
    expect(state.players.player_2.mana).toBe(1);
  });

  it('rejects end turn from inactive player', () => {
    const engine = buildEngine();

    const action: EndTurnAction = {
      type: 'EndTurn',
      actorId: 'char_2',
      playerId: 'player_2',
    };

    const result = engine.processAction(action);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Only active player can end turn');
    expect(engine.getState().turn.activePlayerId).toBe('player_1');
    expect(engine.getState().turn.number).toBe(1);
  });

  it('rejects non-active player action without changing state', () => {
    const engine = buildEngine();
    const before = JSON.stringify(engine.getState());
    const action: EvadeAction = {
      type: 'Evade',
      actorId: 'char_2',
      playerId: 'player_2',
    };

    const result = engine.processAction(action);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Only active player can act');
    expect(JSON.stringify(engine.getState())).toBe(before);
  });
});
