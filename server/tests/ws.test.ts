import { describe, expect, it } from 'vitest';
import { parseClientMessage } from '../src/transport/ws/dto';
import { GameService } from '../src/application/GameService';
import { SessionRegistry } from '../src/domain/game/SessionRegistry';
import { Action, GameState, RoundActionIntent } from '../../game-core/src/types';
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
      round: {
        number: 1,
        status: 'draft',
        initiativePlayerId: 'player_1',
        players: {},
      },
      phase: { current: 'RecoveryPhase' },
      rngSeed: 1,
      rngState: 1,
    }) as GameState,
  processAction: (_action: Action) => ({ ok: true as const }),
  buildPlayerBoardModel: () => null,
  buildPublicBoardView: () => ({ players: {} }),
  submitRoundDraft: (_playerId: string, _roundNumber: number, _intents: RoundActionIntent[]) => ({ ok: true as const }),
  lockRoundDraft: (_playerId: string, _roundNumber: number) => ({ ok: true as const }),
  resolveRoundIfReady: () => null,
  syncPlayerLoadout: () => undefined,
});

describe('ws dto parsing', () => {
  it('rejects invalid json', () => {
    const result = parseClientMessage('{');
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBe('Invalid JSON');
    expect(result.rejection).toEqual({
      type: 'transport.rejected',
      code: 'invalid_json',
      error: 'Invalid JSON',
      requestType: '',
    });
  });

  it('accepts join message with deckId', () => {
    const result = parseClientMessage(
      JSON.stringify({ type: 'join', sessionId: 's1', token: 'token_1', deckId: 'deck_1', seed: 42 }),
    );
    expect(result.ok).toBe(true);
  });

  it('returns structured join rejection for invalid join payload', () => {
    const result = parseClientMessage(
      JSON.stringify({ type: 'join', sessionId: 's1', token: 'token_1' }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBe('Invalid join payload');
    expect(result.rejection).toEqual({
      type: 'join.rejected',
      sessionId: 's1',
      code: 'invalid_payload',
      error: 'Invalid join payload',
    });
  });

  it('accepts roundDraft.replace message', () => {
    const result = parseClientMessage(
      JSON.stringify({ type: 'roundDraft.replace', roundNumber: 1, intents: [] }),
    );
    expect(result.ok).toBe(true);
  });

  it('accepts roundDraft.lock message', () => {
    const result = parseClientMessage(
      JSON.stringify({ type: 'roundDraft.lock', roundNumber: 1 }),
    );
    expect(result.ok).toBe(true);
  });

  it('accepts social friends query message', () => {
    const result = parseClientMessage(
      JSON.stringify({ type: 'social.friends.query' }),
    );
    expect(result.ok).toBe(true);
  });

  it('accepts friend request send message', () => {
    const result = parseClientMessage(
      JSON.stringify({ type: 'friendRequest.send', username: 'Bravo' }),
    );
    expect(result.ok).toBe(true);
  });

  it('rejects invalid friend.delete payload', () => {
    const result = parseClientMessage(
      JSON.stringify({ type: 'friend.delete' }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBe('Invalid friend.delete payload');
    expect(result.rejection).toEqual({
      type: 'transport.rejected',
      code: 'invalid_payload',
      error: 'Invalid friend.delete payload',
      requestType: 'friend.delete',
    });
  });

  it('rejects legacy action message in round-only transport', () => {
    const result = parseClientMessage(
      JSON.stringify({ type: 'action', action: { type: 'EndTurn' } }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBe('Unknown message type');
    expect(result.rejection).toEqual({
      type: 'transport.rejected',
      code: 'unknown_message_type',
      error: 'Unknown message type',
      requestType: 'action',
    });
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

  it('rejects round draft intent with foreign playerId relative to socket', () => {
    const registry = new SessionRegistry(() => buildEngine());
    const service = new GameService(registry);
    expect(service.join('s1', { playerId: 'p1', characterId: 'char_1', deck: [] }, 1).ok).toBe(true);

    const result = service.replaceRoundDraft('s1', 'p1', 1, [
      {
        intentId: 'draft_1',
        roundNumber: 1,
        playerId: 'p2',
        actorId: 'char_1',
        queueIndex: 0,
        kind: 'Evade',
      },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBe('Round intent playerId does not match socket player');
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
    expect(sessionA.session.getState().hands.player_1).toHaveLength(2);
    expect(sessionA.session.getState().hands.player_2).toHaveLength(2);
    expect(sessionA.session.getState().decks.player_1.cards).toHaveLength(0);
    expect(sessionA.session.getState().decks.player_2.cards).toHaveLength(0);
    expect(sessionA.session.getState().players.player_1.mana).toBe(10);
    expect(sessionA.session.getState().players.player_2.mana).toBe(10);
    expect(sessionA.session.getState().players.player_1.actionPoints).toBe(3);
    expect(sessionA.session.getState().players.player_2.actionPoints).toBe(3);

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

  it('lets two players submit drafts, lock round, and resolve into next round', () => {
    const registry = new SessionRegistry((seed, players) => createEngine(seed, players));
    const service = new GameService(registry);

    expect(service.join('round-1', {
      playerId: 'player_1',
      characterId: 'char_1',
      deck: [{ cardId: '1', quantity: 1 }],
    }, 123).ok).toBe(true);
    expect(service.join('round-1', {
      playerId: 'player_2',
      characterId: 'char_2',
      deck: [{ cardId: '1', quantity: 1 }],
    }, 123).ok).toBe(true);

    const replaceA = service.replaceRoundDraft('round-1', 'player_1', 1, []);
    const replaceB = service.replaceRoundDraft('round-1', 'player_2', 1, [
      {
        intentId: 'draft_fireball',
        roundNumber: 1,
        playerId: 'player_2',
        actorId: 'char_2',
        queueIndex: 0,
        kind: 'CastSpell',
        cardInstanceId: 'card_player_2_1',
        target: {
          targetId: 'char_1',
          targetType: 'enemyCharacter',
        },
      },
    ]);

    expect(replaceA.ok).toBe(true);
    expect(replaceB.ok).toBe(true);

    const lockA = service.lockRoundDraft('round-1', 'player_1', 1);
    expect(lockA.ok).toBe(true);
    if (!lockA.ok) {
      return;
    }
    expect(lockA.resolved).toBeNull();

    const lockB = service.lockRoundDraft('round-1', 'player_2', 1);
    expect(lockB.ok).toBe(true);
    if (!lockB.ok) {
      return;
    }
    expect(lockB.resolved).not.toBeNull();
    expect(lockB.state.round.number).toBe(2);
    expect(lockB.state.round.status).toBe('draft');
  });
});
