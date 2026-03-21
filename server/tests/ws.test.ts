import { describe, expect, it } from 'vitest';
import { parseClientMessage } from '../src/transport/ws/dto';
import { GameService } from '../src/application/GameService';
import { SessionRegistry } from '../src/domain/game/SessionRegistry';
import { Action, GameState } from '../../game-core/src/types';
import { createEngine } from '../src/engine/createEngine';

const buildEngine = () => ({
  getState: (): GameState =>
    ({
      players: {},
      characters: {},
      creatures: {},
      hands: {},
      decks: {},
      discardPiles: {},
      cardInstances: {},
      activeEffects: {},
      effectQueue: [],
      actionLog: [],
      log: [],
      turn: { number: 1, activePlayerId: 'player_1' },
      phase: { current: 'RecoveryPhase' },
      rngSeed: 1,
      rngState: 1,
    }) as GameState,
  processAction: (_action: Action) => ({ ok: true as const }),
  syncPlayerLoadout: () => undefined,
});

describe('ws dto parsing', () => {
  it('rejects invalid json', () => {
    const result = parseClientMessage('{');
    expect(result.ok).toBe(false);
  });

  it('accepts join message with deckId', () => {
    const result = parseClientMessage(
      JSON.stringify({ type: 'join', sessionId: 's1', token: 'token_1', deckId: 'deck_1', seed: 42 }),
    );
    expect(result.ok).toBe(true);
  });
});

describe('game service validation', () => {
  it('rejects invalid action payload', () => {
    const registry = new SessionRegistry(() => buildEngine());
    const service = new GameService(registry);
    const join = service.join('s1', { playerId: 'p1', characterId: 'char_1', deck: [] }, 1);
    expect(join.ok).toBe(true);
    const result = service.applyAction('s1', 'p1', { type: 'Attack' });
    expect(result.ok).toBe(false);
  });

  it('rejects action with foreign playerId relative to socket', () => {
    const registry = new SessionRegistry(() => buildEngine());
    const service = new GameService(registry);
    expect(service.join('s1', { playerId: 'p1', characterId: 'char_1', deck: [] }, 1).ok).toBe(true);
    expect(service.join('s1', { playerId: 'p2', characterId: 'char_2', deck: [] }, 1).ok).toBe(true);

    const result = service.applyAction('s1', 'p1', {
      type: 'EndTurn',
      actorId: 'char_2',
      playerId: 'p2',
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBe('Action playerId does not match socket player');
  });

  it('rejects join with different seed for existing session', () => {
    const registry = new SessionRegistry(() => buildEngine());
    const service = new GameService(registry);

    expect(service.join('s1', { playerId: 'p1', characterId: 'char_1', deck: [] }, 123).ok).toBe(true);
    const secondJoin = service.join('s1', { playerId: 'p2', characterId: 'char_2', deck: [] }, 456);

    expect(secondJoin.ok).toBe(false);
    if (secondJoin.ok) {
      return;
    }
    expect(secondJoin.error).toBe('Session already exists with a different seed');
  });

  it('rejects third player in PvP session', () => {
    const registry = new SessionRegistry(() => buildEngine());
    const service = new GameService(registry);

    expect(service.join('s1', { playerId: 'p1', characterId: 'char_1', deck: [] }, 123).ok).toBe(true);
    expect(service.join('s1', { playerId: 'p2', characterId: 'char_2', deck: [] }).ok).toBe(true);
    const thirdJoin = service.join('s1', { playerId: 'p3', characterId: 'char_3', deck: [] });

    expect(thirdJoin.ok).toBe(false);
    if (thirdJoin.ok) {
      return;
    }
    expect(thirdJoin.error).toBe('Session is full');
  });
});

describe('game service end-to-end PvP flow', () => {
  it('lets two players join one session and pass turns in order', () => {
    const registry = new SessionRegistry((seed, players) => createEngine(seed, players));
    const service = new GameService(registry);

    const sessionA = service.join('match-1', {
      playerId: 'player_1',
      characterId: 'char_1',
      deck: [{ cardId: '1', quantity: 2 }],
    }, 123);
    const sessionB = service.join('match-1', {
      playerId: 'player_2',
      characterId: 'char_2',
      deck: [{ cardId: '2', quantity: 2 }],
    }, 123);

    expect(sessionA.ok).toBe(true);
    expect(sessionB.ok).toBe(true);
    if (!sessionA.ok || !sessionB.ok) {
      return;
    }

    expect(sessionA.session).toBe(sessionB.session);
    expect(sessionA.session.getState().turn.activePlayerId).toBe('player_1');
    expect(sessionA.session.getState().turn.number).toBe(1);
    expect(sessionA.session.getState().phase.current).toBe('ActionPhase');

    const endTurnPlayer1 = service.applyAction('match-1', 'player_1', {
      type: 'EndTurn',
      actorId: 'char_1',
      playerId: 'player_1',
    });

    expect(endTurnPlayer1.ok).toBe(true);
    if (!endTurnPlayer1.ok) {
      return;
    }
    expect(endTurnPlayer1.state.turn.activePlayerId).toBe('player_2');
    expect(endTurnPlayer1.state.turn.number).toBe(2);

    const endTurnPlayer2 = service.applyAction('match-1', 'player_2', {
      type: 'EndTurn',
      actorId: 'char_2',
      playerId: 'player_2',
    });

    expect(endTurnPlayer2.ok).toBe(true);
    if (!endTurnPlayer2.ok) {
      return;
    }
    expect(endTurnPlayer2.state.turn.activePlayerId).toBe('player_1');
    expect(endTurnPlayer2.state.turn.number).toBe(3);
    expect(endTurnPlayer2.state.actionLog).toHaveLength(2);
  });
});
