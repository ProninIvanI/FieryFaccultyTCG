import { afterEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { createEngine } from '../src/engine/createEngine';
import { GameService } from '../src/application/GameService';
import { SessionRegistry } from '../src/domain/game/SessionRegistry';
import { WsGateway } from '../src/transport/ws/WsGateway';

const waitForOpen = (socket: WebSocket): Promise<void> =>
  new Promise((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', (error) => reject(error));
  });

type MessageCollector = {
  messages: Array<{ type: string; [key: string]: unknown }>;
  waitFor: <T extends { type: string }>(
    predicate: (message: { type: string; [key: string]: unknown }) => message is T,
    timeoutMs?: number,
  ) => Promise<T>;
};

const createMessageCollector = (socket: WebSocket): MessageCollector => {
  const messages: Array<{ type: string; [key: string]: unknown }> = [];
  socket.on('message', (data) => {
    try {
      messages.push(JSON.parse(data.toString()) as { type: string; [key: string]: unknown });
    } catch {
      // ignore malformed test messages
    }
  });

  return {
    messages,
    waitFor: <T extends { type: string }>(
      predicate: (message: { type: string; [key: string]: unknown }) => message is T,
      timeoutMs = 3000,
    ) =>
      new Promise<T>((resolve, reject) => {
        const startedAt = Date.now();
        const interval = setInterval(() => {
          const match = messages.find(predicate);
          if (match) {
            clearInterval(interval);
            resolve(match);
            return;
          }
          if (Date.now() - startedAt >= timeoutMs) {
            clearInterval(interval);
            reject(new Error(`Timed out waiting for matching message. Seen: ${messages.map((item) => item.type).join(', ')}`));
          }
        }, 20);
      }),
  };
};

describe('ws gateway integration', () => {
  const gateways: WsGateway[] = [];

  afterEach(() => {
    gateways.forEach((gateway) => gateway.stop());
    gateways.length = 0;
    vi.restoreAllMocks();
  });

  it('broadcasts a fresh state to existing players when a second player joins', async () => {
    const port = 45000 + Math.floor(Math.random() * 1000);
    const registry = new SessionRegistry((seed, players) => createEngine(seed, players));
    const service = new GameService(registry);
    const gateway = new WsGateway(service, async (token) => {
      if (token === 'token_1') {
        return { userId: 'player_1', username: 'Alpha' };
      }
      if (token === 'token_2') {
        return { userId: 'player_2', username: 'Bravo' };
      }
      return null;
    });

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const deckId = url.endsWith('/deck_1') ? 'deck_1' : 'deck_2';
      const characterId = deckId === 'deck_1' ? 'char_1' : 'char_2';

      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            deck: {
              id: deckId,
              characterId,
              cards: [{ cardId: '1', quantity: 2 }],
            },
          },
        }),
      } as Response;
    }));

    gateway.start(port);
    gateways.push(gateway);

    const playerOne = new WebSocket(`ws://127.0.0.1:${port}`);
    const playerOneMessages = createMessageCollector(playerOne);
    await waitForOpen(playerOne);

    playerOne.send(JSON.stringify({ type: 'join', sessionId: 'match-sync', token: 'token_1', deckId: 'deck_1', seed: 123 }));
    const firstJoinState = await playerOneMessages.waitFor<{ type: 'state'; state: { boardView?: { players?: Record<string, { ribbonEntries?: unknown[] }> } }; playerLabels?: Record<string, string> }>(
      (message): message is { type: 'state'; state: { boardView?: { players?: Record<string, { ribbonEntries?: unknown[] }> } }; playerLabels?: Record<string, string> } =>
        message.type === 'state' &&
        typeof message.state === 'object' &&
        message.state !== null,
    );
    expect(firstJoinState.type).toBe('state');
    expect(firstJoinState.state.boardView?.players).toBeDefined();
    expect(Array.isArray(firstJoinState.state.boardView?.players?.player_1?.ribbonEntries)).toBe(true);
    expect(firstJoinState.playerLabels?.player_1).toBe('Alpha');

    const playerTwo = new WebSocket(`ws://127.0.0.1:${port}`);
    const playerTwoMessages = createMessageCollector(playerTwo);
    await waitForOpen(playerTwo);

    playerTwo.send(JSON.stringify({ type: 'join', sessionId: 'match-sync', token: 'token_2', deckId: 'deck_2' }));

    const [playerOneUpdated, playerTwoUpdated] = await Promise.all([
      playerOneMessages.waitFor((message): message is { type: 'state' } => message.type === 'state' && playerOneMessages.messages.indexOf(message) > 0),
      playerTwoMessages.waitFor((message): message is { type: 'state' } => message.type === 'state'),
    ]);

    expect(playerOneUpdated.type).toBe('state');
    expect(playerTwoUpdated.type).toBe('state');
    expect((playerOneUpdated as { playerLabels?: Record<string, string> }).playerLabels).toEqual({
      player_1: 'Alpha',
      player_2: 'Bravo',
    });
    expect((playerTwoUpdated as { playerLabels?: Record<string, string> }).playerLabels).toEqual({
      player_1: 'Alpha',
      player_2: 'Bravo',
    });

    playerOne.close();
    playerTwo.close();
  });

  it('supports roundDraft replace/lock flow and broadcasts roundResolved', async () => {
    const port = 46000 + Math.floor(Math.random() * 1000);
    const registry = new SessionRegistry((seed, players) => createEngine(seed, players));
    const service = new GameService(registry);
    const gateway = new WsGateway(service, async (token) => {
      if (token === 'token_1') {
        return { userId: 'player_1' };
      }
      if (token === 'token_2') {
        return { userId: 'player_2' };
      }
      return null;
    });

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const deckId = url.endsWith('/deck_1') ? 'deck_1' : 'deck_2';

      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            deck: {
              id: deckId,
              characterId: deckId === 'deck_1' ? 'char_1' : 'char_2',
              cards: [{ cardId: '1', quantity: 1 }],
            },
          },
        }),
      } as Response;
    }));

    gateway.start(port);
    gateways.push(gateway);

    const playerOne = new WebSocket(`ws://127.0.0.1:${port}`);
    const playerTwo = new WebSocket(`ws://127.0.0.1:${port}`);
    const playerOneMessages = createMessageCollector(playerOne);
    const playerTwoMessages = createMessageCollector(playerTwo);
    await Promise.all([waitForOpen(playerOne), waitForOpen(playerTwo)]);

    playerOne.send(JSON.stringify({ type: 'join', sessionId: 'match-round', token: 'token_1', deckId: 'deck_1', seed: 123 }));
    expect((await playerOneMessages.waitFor((message): message is { type: 'state' } => message.type === 'state')).type).toBe('state');
    expect((await playerOneMessages.waitFor((message): message is { type: 'roundStatus' } => message.type === 'roundStatus')).type).toBe('roundStatus');
    const initialDraftSnapshot = await playerOneMessages.waitFor<{
      type: 'roundDraft.snapshot';
      intents: unknown[];
      boardModel?: { playerId?: string; roundActions?: unknown[]; ribbonEntries?: unknown[] };
    }>(
      (message): message is {
        type: 'roundDraft.snapshot';
        intents: unknown[];
        boardModel?: { playerId?: string; roundActions?: unknown[]; ribbonEntries?: unknown[] };
      } => message.type === 'roundDraft.snapshot' && Array.isArray(message.intents),
    );
    expect(initialDraftSnapshot.type).toBe('roundDraft.snapshot');
    expect(initialDraftSnapshot.boardModel?.playerId).toBe('player_1');
    expect(Array.isArray(initialDraftSnapshot.boardModel?.roundActions)).toBe(true);
    expect(Array.isArray(initialDraftSnapshot.boardModel?.ribbonEntries)).toBe(true);

    playerTwo.send(JSON.stringify({ type: 'join', sessionId: 'match-round', token: 'token_2', deckId: 'deck_2' }));
    expect((await playerOneMessages.waitFor((message): message is { type: 'state' } => message.type === 'state' && playerOneMessages.messages.indexOf(message) > 0)).type).toBe('state');
    expect((await playerOneMessages.waitFor((message): message is { type: 'roundStatus' } => message.type === 'roundStatus' && playerOneMessages.messages.indexOf(message) > 1)).type).toBe('roundStatus');
    expect((await playerTwoMessages.waitFor((message): message is { type: 'state' } => message.type === 'state')).type).toBe('state');
    expect((await playerTwoMessages.waitFor((message): message is { type: 'roundStatus' } => message.type === 'roundStatus')).type).toBe('roundStatus');
    expect((await playerTwoMessages.waitFor((message): message is { type: 'roundDraft.snapshot'; intents: unknown[] } => message.type === 'roundDraft.snapshot' && Array.isArray(message.intents))).type).toBe('roundDraft.snapshot');

    playerOne.send(JSON.stringify({ type: 'roundDraft.replace', roundNumber: 1, intents: [] }));
    expect((await playerOneMessages.waitFor((message): message is { type: 'roundDraft.accepted' } => message.type === 'roundDraft.accepted')).type).toBe('roundDraft.accepted');
    expect((await playerOneMessages.waitFor((message): message is { type: 'roundDraft.snapshot'; roundNumber: number } => message.type === 'roundDraft.snapshot' && typeof message.roundNumber === 'number' && playerOneMessages.messages.indexOf(message) > 2)).type).toBe('roundDraft.snapshot');
    expect((await playerOneMessages.waitFor((message): message is { type: 'roundStatus' } => message.type === 'roundStatus' && playerOneMessages.messages.indexOf(message) > 3)).type).toBe('roundStatus');
    expect((await playerTwoMessages.waitFor((message): message is { type: 'roundStatus' } => message.type === 'roundStatus' && playerTwoMessages.messages.indexOf(message) > 1)).type).toBe('roundStatus');

    playerTwo.send(JSON.stringify({
      type: 'roundDraft.replace',
      roundNumber: 1,
      intents: [{
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
      }],
    }));
    expect((await playerTwoMessages.waitFor((message): message is { type: 'roundDraft.accepted' } => message.type === 'roundDraft.accepted')).type).toBe('roundDraft.accepted');
    const updatedDraftSnapshot = await playerTwoMessages.waitFor<{
      type: 'roundDraft.snapshot';
      intents: unknown[];
      boardModel?: { roundActions?: Array<{ id?: string }>; ribbonEntries?: Array<{ kind?: string }> };
    }>(
      (message): message is {
        type: 'roundDraft.snapshot';
        intents: unknown[];
        boardModel?: { roundActions?: Array<{ id?: string }>; ribbonEntries?: Array<{ kind?: string }> };
      } =>
        message.type === 'roundDraft.snapshot' &&
        Array.isArray(message.intents) &&
        playerTwoMessages.messages.indexOf(message) > 2,
    );
    expect(updatedDraftSnapshot.type).toBe('roundDraft.snapshot');
    expect(updatedDraftSnapshot.boardModel?.roundActions?.[0]?.id).toBe('draft_fireball');
    expect(updatedDraftSnapshot.boardModel?.ribbonEntries?.some((entry) => entry.kind === 'roundAction')).toBe(true);
    expect((await playerOneMessages.waitFor((message): message is { type: 'roundStatus' } => message.type === 'roundStatus' && playerOneMessages.messages.indexOf(message) > 4)).type).toBe('roundStatus');
    expect((await playerTwoMessages.waitFor((message): message is { type: 'roundStatus' } => message.type === 'roundStatus' && playerTwoMessages.messages.indexOf(message) > 2)).type).toBe('roundStatus');

    playerOne.send(JSON.stringify({ type: 'roundDraft.lock', roundNumber: 1 }));
    const playerOneLockStatus = await playerOneMessages.waitFor<{ type: 'roundStatus'; selfLocked: boolean; opponentLocked: boolean }>(
      (message): message is { type: 'roundStatus'; selfLocked: boolean; opponentLocked: boolean } =>
        message.type === 'roundStatus' &&
        typeof message.selfLocked === 'boolean' &&
        message.selfLocked === true,
    );
    const playerTwoLockStatus = await playerTwoMessages.waitFor<{ type: 'roundStatus'; selfLocked: boolean; opponentLocked: boolean }>(
      (message): message is { type: 'roundStatus'; selfLocked: boolean; opponentLocked: boolean } =>
        message.type === 'roundStatus' &&
        typeof message.opponentLocked === 'boolean' &&
        message.opponentLocked === true,
    );
    expect(playerOneLockStatus.selfLocked).toBe(true);
    expect(playerTwoLockStatus.opponentLocked).toBe(true);

    playerTwo.send(JSON.stringify({ type: 'roundDraft.lock', roundNumber: 1 }));
    const resolvedOne = await playerOneMessages.waitFor<{ type: 'roundResolved'; result: { roundNumber: number } }>(
      (message): message is { type: 'roundResolved'; result: { roundNumber: number } } =>
        message.type === 'roundResolved' &&
        typeof message.result === 'object' &&
        message.result !== null &&
        typeof (message.result as { roundNumber?: unknown }).roundNumber === 'number',
    );
    const resolvedTwo = await playerTwoMessages.waitFor<{ type: 'roundResolved'; result: { roundNumber: number } }>(
      (message): message is { type: 'roundResolved'; result: { roundNumber: number } } =>
        message.type === 'roundResolved' &&
        typeof message.result === 'object' &&
        message.result !== null &&
        typeof (message.result as { roundNumber?: unknown }).roundNumber === 'number',
    );
    const nextStateOne = await playerOneMessages.waitFor<{ type: 'state'; state: { round: { number: number } } }>(
      (message): message is { type: 'state'; state: { round: { number: number } } } =>
        message.type === 'state' &&
        typeof message.state === 'object' &&
        message.state !== null &&
        typeof ((message.state as { round?: { number?: unknown } }).round?.number) === 'number' &&
        (message.state as { round: { number: number } }).round.number === 2,
    );
    const nextStateTwo = await playerTwoMessages.waitFor<{ type: 'state'; state: { round: { number: number } } }>(
      (message): message is { type: 'state'; state: { round: { number: number } } } =>
        message.type === 'state' &&
        typeof message.state === 'object' &&
        message.state !== null &&
        typeof ((message.state as { round?: { number?: unknown } }).round?.number) === 'number' &&
        (message.state as { round: { number: number } }).round.number === 2,
    );

    expect(resolvedOne.result.roundNumber).toBe(1);
    expect(resolvedTwo.result.roundNumber).toBe(1);
    expect(nextStateOne.state.round.number).toBe(2);
    expect(nextStateTwo.state.round.number).toBe(2);

    const clearedDraftOne = await playerOneMessages.waitFor<{
      type: 'roundDraft.snapshot';
      roundNumber: number;
      locked: boolean;
      intents: unknown[];
    }>(
      (message): message is {
        type: 'roundDraft.snapshot';
        roundNumber: number;
        locked: boolean;
        intents: unknown[];
      } =>
        message.type === 'roundDraft.snapshot' &&
        typeof message.roundNumber === 'number' &&
        message.roundNumber === 2 &&
        message.locked === false &&
        Array.isArray(message.intents) &&
        message.intents.length === 0,
    );
    const clearedDraftTwo = await playerTwoMessages.waitFor<{
      type: 'roundDraft.snapshot';
      roundNumber: number;
      locked: boolean;
      intents: unknown[];
    }>(
      (message): message is {
        type: 'roundDraft.snapshot';
        roundNumber: number;
        locked: boolean;
        intents: unknown[];
      } =>
        message.type === 'roundDraft.snapshot' &&
        typeof message.roundNumber === 'number' &&
        message.roundNumber === 2 &&
        message.locked === false &&
        Array.isArray(message.intents) &&
        message.intents.length === 0,
    );

    expect(clearedDraftOne.roundNumber).toBe(2);
    expect(clearedDraftTwo.roundNumber).toBe(2);
    expect(clearedDraftOne.intents).toEqual([]);
    expect(clearedDraftTwo.intents).toEqual([]);

    playerOne.close();
    playerTwo.close();
  });

  it('sends structured roundDraft.rejected when draft validation fails', async () => {
    const port = 46500 + Math.floor(Math.random() * 1000);
    const registry = new SessionRegistry((seed, players) => createEngine(seed, players));
    const service = new GameService(registry);
    const gateway = new WsGateway(service, async (token) => {
      if (token === 'token_1') {
        return { userId: 'player_1' };
      }
      if (token === 'token_2') {
        return { userId: 'player_2' };
      }
      return null;
    });

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const deckId = url.endsWith('/deck_1') ? 'deck_1' : 'deck_2';
      const characterId = deckId === 'deck_1' ? 'char_1' : 'char_2';

      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            deck: {
              id: deckId,
              characterId,
              cards: [{ cardId: '1', quantity: 2 }],
            },
          },
        }),
      } as Response;
    }));

    gateway.start(port);
    gateways.push(gateway);

    const playerOne = new WebSocket(`ws://127.0.0.1:${port}`);
    const playerOneMessages = createMessageCollector(playerOne);
    await waitForOpen(playerOne);

    const playerTwo = new WebSocket(`ws://127.0.0.1:${port}`);
    await waitForOpen(playerTwo);

    playerOne.send(JSON.stringify({ type: 'join', sessionId: 'match-reject', token: 'token_1', deckId: 'deck_1', seed: 123 }));
    await playerOneMessages.waitFor((message): message is { type: 'state' } => message.type === 'state');

    playerTwo.send(JSON.stringify({ type: 'join', sessionId: 'match-reject', token: 'token_2', deckId: 'deck_2' }));
    await playerOneMessages.waitFor((message): message is { type: 'roundStatus' } => message.type === 'roundStatus');

    playerOne.send(JSON.stringify({
      type: 'roundDraft.replace',
      roundNumber: 1,
      intents: [
        {
          intentId: 'invalid_attack',
          roundNumber: 1,
          playerId: 'player_1',
          actorId: 'char_1',
          queueIndex: 0,
          kind: 'Attack',
          sourceCreatureId: 'missing_creature',
          target: {
            targetType: 'enemyCharacter',
            targetId: 'char_2',
          },
        },
      ],
    }));

    const rejected = await playerOneMessages.waitFor<{
      type: 'roundDraft.rejected';
      operation: 'replace';
      roundNumber: number;
      code: string;
      errors: Array<{ code: string; intentId?: string }>;
    }>(
      (message): message is {
        type: 'roundDraft.rejected';
        operation: 'replace';
        roundNumber: number;
        code: string;
        errors: Array<{ code: string; intentId?: string }>;
      } =>
        message.type === 'roundDraft.rejected' &&
        message.operation === 'replace' &&
        typeof message.roundNumber === 'number' &&
        typeof message.code === 'string' &&
        Array.isArray(message.errors),
    );

    expect(rejected.roundNumber).toBe(1);
    expect(rejected.code).toBe('validation_failed');
    expect(rejected.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'attack_source',
          intentId: 'invalid_attack',
        }),
      ]),
    );

    playerOne.close();
    playerTwo.close();
  });

  it('sends structured roundDraft.rejected when roundDraft.lock is sent before join', async () => {
    const port = 47500 + Math.floor(Math.random() * 1000);
    const registry = new SessionRegistry((seed, players) => createEngine(seed, players));
    const service = new GameService(registry);
    const gateway = new WsGateway(service, async () => null);

    gateway.start(port);
    gateways.push(gateway);

    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    const messages = createMessageCollector(socket);
    await waitForOpen(socket);

    socket.send(JSON.stringify({ type: 'roundDraft.lock', roundNumber: 3 }));

    const rejected = await messages.waitFor<{
      type: 'roundDraft.rejected';
      operation: 'lock';
      roundNumber: number;
      code: string;
      error: string;
      errors: unknown[];
    }>(
      (message): message is {
        type: 'roundDraft.rejected';
        operation: 'lock';
        roundNumber: number;
        code: string;
        error: string;
        errors: unknown[];
      } =>
        message.type === 'roundDraft.rejected' &&
        message.operation === 'lock' &&
        typeof message.roundNumber === 'number' &&
        typeof message.code === 'string' &&
        typeof message.error === 'string' &&
        Array.isArray(message.errors),
    );

    expect(rejected).toEqual({
      type: 'roundDraft.rejected',
      operation: 'lock',
      roundNumber: 3,
      code: 'join_required',
      error: 'Join session first',
      errors: [],
    });

    socket.close();
  });

  it('sends structured join.rejected when auth fails', async () => {
    const port = 47400 + Math.floor(Math.random() * 1000);
    const registry = new SessionRegistry((seed, players) => createEngine(seed, players));
    const service = new GameService(registry);
    const gateway = new WsGateway(service, async () => null);

    gateway.start(port);
    gateways.push(gateway);

    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    const messages = createMessageCollector(socket);
    await waitForOpen(socket);

    socket.send(JSON.stringify({ type: 'join', sessionId: 'match-auth', token: 'bad_token', deckId: 'deck_1' }));

    const rejected = await messages.waitFor<{
      type: 'join.rejected';
      sessionId: string;
      code: string;
      error: string;
    }>(
      (message): message is {
        type: 'join.rejected';
        sessionId: string;
        code: string;
        error: string;
      } =>
        message.type === 'join.rejected' &&
        typeof message.sessionId === 'string' &&
        typeof message.code === 'string' &&
        typeof message.error === 'string',
    );

    expect(rejected).toEqual({
      type: 'join.rejected',
      sessionId: 'match-auth',
      code: 'unauthorized',
      error: 'Unauthorized',
    });

    socket.close();
  });

  it('sends structured transport.rejected when client sends unknown message type', async () => {
    const port = 47450 + Math.floor(Math.random() * 1000);
    const registry = new SessionRegistry((seed, players) => createEngine(seed, players));
    const service = new GameService(registry);
    const gateway = new WsGateway(service, async () => null);

    gateway.start(port);
    gateways.push(gateway);

    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    const messages = createMessageCollector(socket);
    await waitForOpen(socket);

    socket.send(JSON.stringify({ type: 'action', action: { type: 'EndTurn' } }));

    const rejected = await messages.waitFor<{
      type: 'transport.rejected';
      code: string;
      error: string;
      requestType: string;
    }>(
      (message): message is {
        type: 'transport.rejected';
        code: string;
        error: string;
        requestType: string;
      } =>
        message.type === 'transport.rejected' &&
        typeof message.code === 'string' &&
        typeof message.error === 'string' &&
        typeof message.requestType === 'string',
    );

    expect(rejected).toEqual({
      type: 'transport.rejected',
      code: 'unknown_message_type',
      error: 'Unknown message type',
      requestType: 'action',
    });

    socket.close();
  });

  it('sends structured roundDraft.rejected when roundDraft.replace payload is malformed', async () => {
    const port = 47600 + Math.floor(Math.random() * 1000);
    const registry = new SessionRegistry((seed, players) => createEngine(seed, players));
    const service = new GameService(registry);
    const gateway = new WsGateway(service, async () => null);

    gateway.start(port);
    gateways.push(gateway);

    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    const messages = createMessageCollector(socket);
    await waitForOpen(socket);

    socket.send(JSON.stringify({ type: 'roundDraft.replace', roundNumber: 'oops', intents: 'bad' }));

    const rejected = await messages.waitFor<{
      type: 'roundDraft.rejected';
      operation: 'replace';
      roundNumber: number;
      code: string;
      error: string;
      errors: unknown[];
    }>(
      (message): message is {
        type: 'roundDraft.rejected';
        operation: 'replace';
        roundNumber: number;
        code: string;
        error: string;
        errors: unknown[];
      } =>
        message.type === 'roundDraft.rejected' &&
        message.operation === 'replace' &&
        typeof message.roundNumber === 'number' &&
        typeof message.code === 'string' &&
        typeof message.error === 'string' &&
        Array.isArray(message.errors),
    );

    expect(rejected).toEqual({
      type: 'roundDraft.rejected',
      operation: 'replace',
      roundNumber: 0,
      code: 'invalid_payload',
      error: 'Invalid roundDraft.replace payload',
      errors: [],
    });

    socket.close();
  });

  it('restores the player round draft snapshot after reconnect join', async () => {
    const port = 47000 + Math.floor(Math.random() * 1000);
    const registry = new SessionRegistry((seed, players) => createEngine(seed, players));
    const service = new GameService(registry);
    const gateway = new WsGateway(service, async (token) => {
      if (token === 'token_1') {
        return { userId: 'player_1' };
      }
      if (token === 'token_2') {
        return { userId: 'player_2' };
      }
      return null;
    });

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const deckId = url.endsWith('/deck_1') ? 'deck_1' : 'deck_2';

      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            deck: {
              id: deckId,
              characterId: deckId === 'deck_1' ? 'char_1' : 'char_2',
              cards: [{ cardId: '1', quantity: 1 }],
            },
          },
        }),
      } as Response;
    }));

    gateway.start(port);
    gateways.push(gateway);

    const playerOne = new WebSocket(`ws://127.0.0.1:${port}`);
    const playerTwo = new WebSocket(`ws://127.0.0.1:${port}`);
    const playerOneMessages = createMessageCollector(playerOne);
    await Promise.all([waitForOpen(playerOne), waitForOpen(playerTwo)]);

    playerOne.send(JSON.stringify({ type: 'join', sessionId: 'match-rejoin', token: 'token_1', deckId: 'deck_1', seed: 123 }));
    playerTwo.send(JSON.stringify({ type: 'join', sessionId: 'match-rejoin', token: 'token_2', deckId: 'deck_2' }));

    await playerOneMessages.waitFor((message): message is { type: 'roundDraft.snapshot' } => message.type === 'roundDraft.snapshot');

    playerOne.send(JSON.stringify({
      type: 'roundDraft.replace',
      roundNumber: 1,
      intents: [{
        intentId: 'draft_fireball',
        roundNumber: 1,
        playerId: 'player_1',
        actorId: 'char_1',
        queueIndex: 0,
        kind: 'CastSpell',
        cardInstanceId: 'card_player_1_1',
        target: {
          targetId: 'char_2',
          targetType: 'enemyCharacter',
        },
      }],
    }));

    const snapshotAfterReplace = await playerOneMessages.waitFor<{ type: 'roundDraft.snapshot'; intents: Array<{ intentId: string }> }>(
      (message): message is { type: 'roundDraft.snapshot'; intents: Array<{ intentId: string }> } =>
        message.type === 'roundDraft.snapshot' &&
        Array.isArray(message.intents) &&
        (message.intents as Array<{ intentId?: string }>)[0]?.intentId === 'draft_fireball',
    );
    expect(snapshotAfterReplace.intents).toHaveLength(1);

    playerOne.close();

    const playerOneReconnect = new WebSocket(`ws://127.0.0.1:${port}`);
    const playerOneReconnectMessages = createMessageCollector(playerOneReconnect);
    await waitForOpen(playerOneReconnect);

    playerOneReconnect.send(JSON.stringify({ type: 'join', sessionId: 'match-rejoin', token: 'token_1', deckId: 'deck_1' }));

    const rejoinedSnapshot = await playerOneReconnectMessages.waitFor<{ type: 'roundDraft.snapshot'; intents: Array<{ intentId: string }> }>(
      (message): message is { type: 'roundDraft.snapshot'; intents: Array<{ intentId: string }> } =>
        message.type === 'roundDraft.snapshot' &&
        Array.isArray(message.intents) &&
        (message.intents as Array<{ intentId?: string }>)[0]?.intentId === 'draft_fireball',
    );

    expect(rejoinedSnapshot.intents).toHaveLength(1);
    expect(rejoinedSnapshot.intents[0]?.intentId).toBe('draft_fireball');

    playerTwo.close();
    playerOneReconnect.close();
  });
});
