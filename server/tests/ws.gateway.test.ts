import { afterEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { createEngine } from '../src/engine/createEngine';
import { GameService } from '../src/application/GameService';
import { SessionRegistry } from '../src/domain/game/SessionRegistry';
import { WsGateway } from '../src/transport/ws/WsGateway';

const CHARACTER_ONE = '1';
const CHARACTER_TWO = '7';

const LEGAL_DECK_ONE = [
  { cardId: '1', quantity: 2 },
  { cardId: '2', quantity: 2 },
  { cardId: '3', quantity: 2 },
  { cardId: '4', quantity: 2 },
  { cardId: '5', quantity: 2 },
  { cardId: '6', quantity: 2 },
  { cardId: '7', quantity: 2 },
  { cardId: '8', quantity: 2 },
  { cardId: '9', quantity: 2 },
  { cardId: '10', quantity: 2 },
  { cardId: '41', quantity: 2 },
  { cardId: '42', quantity: 2 },
  { cardId: '61', quantity: 2 },
  { cardId: '62', quantity: 2 },
  { cardId: '81', quantity: 2 },
];

const LEGAL_DECK_TWO = [
  { cardId: '11', quantity: 2 },
  { cardId: '12', quantity: 2 },
  { cardId: '13', quantity: 2 },
  { cardId: '14', quantity: 2 },
  { cardId: '15', quantity: 2 },
  { cardId: '16', quantity: 2 },
  { cardId: '17', quantity: 2 },
  { cardId: '18', quantity: 2 },
  { cardId: '19', quantity: 2 },
  { cardId: '20', quantity: 2 },
  { cardId: '41', quantity: 2 },
  { cardId: '42', quantity: 2 },
  { cardId: '61', quantity: 2 },
  { cardId: '62', quantity: 2 },
  { cardId: '86', quantity: 2 },
];

const buildResolvedDeckPayload = (
  deckId: string,
  characterId: string,
  cards: Array<{ cardId: string; quantity: number }>,
) => ({
  success: true,
  data: {
    deck: {
      id: deckId,
      characterId,
      cards,
    },
  },
});

const waitForOpen = (socket: WebSocket): Promise<void> =>
  new Promise((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', (error) => reject(error));
  });

const waitForMs = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
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

      return {
        ok: true,
        json: async () =>
          buildResolvedDeckPayload(
            deckId,
            deckId === 'deck_1' ? CHARACTER_ONE : CHARACTER_TWO,
            deckId === 'deck_1' ? LEGAL_DECK_ONE : LEGAL_DECK_TWO,
          ),
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
        json: async () =>
          buildResolvedDeckPayload(
            deckId,
            deckId === 'deck_1' ? CHARACTER_ONE : CHARACTER_TWO,
            deckId === 'deck_1' ? LEGAL_DECK_ONE : LEGAL_DECK_TWO,
          ),
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
        actorId: CHARACTER_TWO,
        queueIndex: 0,
        kind: 'CastSpell',
        cardInstanceId: 'card_player_2_11',
        target: {
          targetId: CHARACTER_ONE,
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
    await waitForMs(100);
    expect(
      playerOneMessages.messages.some(
        (message) =>
          message.type === 'roundDraft.snapshot' &&
          Array.isArray((message as { intents?: Array<{ intentId?: string }> }).intents) &&
          (message as { intents: Array<{ intentId?: string }> }).intents.some((intent) => intent.intentId === 'draft_fireball'),
      ),
    ).toBe(false);

    playerOne.send(JSON.stringify({ type: 'roundDraft.lock', roundNumber: 1 }));
    const playerOneLockStatus = await playerOneMessages.waitFor<{
      type: 'roundStatus';
      selfLocked: boolean;
      opponentLocked: boolean;
      selfDraftCount: number;
      opponentDraftCount: number;
    }>(
      (message): message is {
        type: 'roundStatus';
        selfLocked: boolean;
        opponentLocked: boolean;
        selfDraftCount: number;
        opponentDraftCount: number;
      } =>
        message.type === 'roundStatus' &&
        typeof message.selfLocked === 'boolean' &&
        message.selfLocked === true,
    );
    const playerTwoLockStatus = await playerTwoMessages.waitFor<{
      type: 'roundStatus';
      selfLocked: boolean;
      opponentLocked: boolean;
      selfDraftCount: number;
      opponentDraftCount: number;
    }>(
      (message): message is {
        type: 'roundStatus';
        selfLocked: boolean;
        opponentLocked: boolean;
        selfDraftCount: number;
        opponentDraftCount: number;
      } =>
        message.type === 'roundStatus' &&
        typeof message.opponentLocked === 'boolean' &&
        message.opponentLocked === true,
    );
    expect(playerOneLockStatus.selfLocked).toBe(true);
    expect(playerTwoLockStatus.opponentLocked).toBe(true);
    expect(playerOneLockStatus.selfDraftCount).toBe(0);
    expect(playerOneLockStatus.opponentDraftCount).toBe(1);
    expect(playerTwoLockStatus.selfDraftCount).toBe(1);
    expect(playerTwoLockStatus.opponentDraftCount).toBe(0);

    playerTwo.send(JSON.stringify({ type: 'roundDraft.lock', roundNumber: 1 }));
    const resolvedOne = await playerOneMessages.waitFor<{
      type: 'roundResolved';
      result: { roundNumber: number; orderedActions: Array<{ intentId: string; orderIndex: number; kind: string; source: { type: string } }> };
    }>(
      (message): message is {
        type: 'roundResolved';
        result: { roundNumber: number; orderedActions: Array<{ intentId: string; orderIndex: number; kind: string; source: { type: string } }> };
      } =>
        message.type === 'roundResolved' &&
        typeof message.result === 'object' &&
        message.result !== null &&
        typeof (message.result as { roundNumber?: unknown }).roundNumber === 'number' &&
        Array.isArray((message.result as { orderedActions?: unknown[] }).orderedActions),
    );
    const resolvedTwo = await playerTwoMessages.waitFor<{
      type: 'roundResolved';
      result: { roundNumber: number; orderedActions: Array<{ intentId: string; orderIndex: number; kind: string; source: { type: string } }> };
    }>(
      (message): message is {
        type: 'roundResolved';
        result: { roundNumber: number; orderedActions: Array<{ intentId: string; orderIndex: number; kind: string; source: { type: string } }> };
      } =>
        message.type === 'roundResolved' &&
        typeof message.result === 'object' &&
        message.result !== null &&
        typeof (message.result as { roundNumber?: unknown }).roundNumber === 'number' &&
        Array.isArray((message.result as { orderedActions?: unknown[] }).orderedActions),
    );
    const nextStateOne = await playerOneMessages.waitFor<{
      type: 'state';
      state: { round: { number: number } };
      resolvedRoundHistory?: Array<{ roundNumber: number }>;
    }>(
      (message): message is {
        type: 'state';
        state: { round: { number: number } };
        resolvedRoundHistory?: Array<{ roundNumber: number }>;
      } =>
        message.type === 'state' &&
        typeof message.state === 'object' &&
        message.state !== null &&
        typeof ((message.state as { round?: { number?: unknown } }).round?.number) === 'number' &&
        (message.state as { round: { number: number } }).round.number === 2,
    );
    const nextStateTwo = await playerTwoMessages.waitFor<{
      type: 'state';
      state: { round: { number: number } };
      resolvedRoundHistory?: Array<{ roundNumber: number }>;
    }>(
      (message): message is {
        type: 'state';
        state: { round: { number: number } };
        resolvedRoundHistory?: Array<{ roundNumber: number }>;
      } =>
        message.type === 'state' &&
        typeof message.state === 'object' &&
        message.state !== null &&
        typeof ((message.state as { round?: { number?: unknown } }).round?.number) === 'number' &&
        (message.state as { round: { number: number } }).round.number === 2,
    );

    expect(resolvedOne.result.roundNumber).toBe(1);
    expect(resolvedTwo.result.roundNumber).toBe(1);
    expect(resolvedOne.result.orderedActions).toEqual(resolvedTwo.result.orderedActions);
    expect(resolvedOne.result.orderedActions).toEqual([
      expect.objectContaining({
        intentId: 'draft_fireball',
        orderIndex: 0,
        kind: 'CastSpell',
        actorId: CHARACTER_TWO,
        queueIndex: 0,
        source: expect.objectContaining({
          type: 'card',
          cardInstanceId: 'card_player_2_11',
        }),
        target: expect.objectContaining({
          targetId: CHARACTER_ONE,
          targetType: 'enemyCharacter',
        }),
      }),
    ]);
    expect(nextStateOne.state.round.number).toBe(2);
    expect(nextStateTwo.state.round.number).toBe(2);
    expect(nextStateOne.resolvedRoundHistory).toEqual([expect.objectContaining({ roundNumber: 1 })]);
    expect(nextStateTwo.resolvedRoundHistory).toEqual([expect.objectContaining({ roundNumber: 1 })]);

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

  it('broadcasts updated character hp in state after a damaging round resolves', async () => {
    const port = 46100 + Math.floor(Math.random() * 1000);
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
        json: async () =>
          buildResolvedDeckPayload(
            deckId,
            deckId === 'deck_1' ? CHARACTER_ONE : CHARACTER_TWO,
            deckId === 'deck_1' ? LEGAL_DECK_ONE : LEGAL_DECK_TWO,
          ),
      } as Response;
    }));

    gateway.start(port);
    gateways.push(gateway);

    const playerOne = new WebSocket(`ws://127.0.0.1:${port}`);
    const playerTwo = new WebSocket(`ws://127.0.0.1:${port}`);
    const playerOneMessages = createMessageCollector(playerOne);
    const playerTwoMessages = createMessageCollector(playerTwo);
    await Promise.all([waitForOpen(playerOne), waitForOpen(playerTwo)]);

    playerOne.send(JSON.stringify({ type: 'join', sessionId: 'match-damage-state', token: 'token_1', deckId: 'deck_1', seed: 123 }));
    await playerOneMessages.waitFor((message): message is { type: 'state' } => message.type === 'state');
    await playerOneMessages.waitFor((message): message is { type: 'roundStatus' } => message.type === 'roundStatus');
    await playerOneMessages.waitFor((message): message is { type: 'roundDraft.snapshot' } => message.type === 'roundDraft.snapshot');

    playerTwo.send(JSON.stringify({ type: 'join', sessionId: 'match-damage-state', token: 'token_2', deckId: 'deck_2' }));
    await playerOneMessages.waitFor((message): message is { type: 'state' } => message.type === 'state' && playerOneMessages.messages.indexOf(message) > 0);
    await playerTwoMessages.waitFor((message): message is { type: 'state' } => message.type === 'state');
    await playerTwoMessages.waitFor((message): message is { type: 'roundStatus' } => message.type === 'roundStatus');
    await playerTwoMessages.waitFor((message): message is { type: 'roundDraft.snapshot' } => message.type === 'roundDraft.snapshot');

    playerOne.send(JSON.stringify({
      type: 'roundDraft.replace',
      roundNumber: 1,
      intents: [{
        intentId: 'draft_ray',
        roundNumber: 1,
        playerId: 'player_1',
        actorId: CHARACTER_ONE,
        queueIndex: 0,
        kind: 'CastSpell',
        cardInstanceId: 'card_player_1_4',
        target: {
          targetId: CHARACTER_TWO,
          targetType: 'enemyCharacter',
        },
      }],
    }));
    await playerOneMessages.waitFor((message): message is { type: 'roundDraft.accepted' } => message.type === 'roundDraft.accepted');

    playerTwo.send(JSON.stringify({ type: 'roundDraft.replace', roundNumber: 1, intents: [] }));
    await playerTwoMessages.waitFor((message): message is { type: 'roundDraft.accepted' } => message.type === 'roundDraft.accepted');

    playerOne.send(JSON.stringify({ type: 'roundDraft.lock', roundNumber: 1 }));
    await playerOneMessages.waitFor(
      (message): message is { type: 'roundStatus'; selfLocked: boolean } =>
        message.type === 'roundStatus' && message.selfLocked === true,
    );

    playerTwo.send(JSON.stringify({ type: 'roundDraft.lock', roundNumber: 1 }));
    await playerTwoMessages.waitFor(
      (message): message is { type: 'roundResolved' } => message.type === 'roundResolved',
    );

    const postRoundState = await playerOneMessages.waitFor<{
      type: 'state';
      state: { round: { number: number }; characters: Record<string, { hp: number }> };
    }>(
      (message): message is {
        type: 'state';
        state: { round: { number: number }; characters: Record<string, { hp: number }> };
      } =>
        message.type === 'state' &&
        typeof message.state === 'object' &&
        message.state !== null &&
        (message.state as { round?: { number?: unknown } }).round?.number === 2 &&
        typeof (message.state as { characters?: Record<string, { hp?: unknown }> }).characters?.[CHARACTER_TWO]?.hp === 'number',
    );

    expect(postRoundState.state.characters[CHARACTER_TWO].hp).toBe(18);

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

      return {
        ok: true,
        json: async () =>
          buildResolvedDeckPayload(
            deckId,
            deckId === 'deck_1' ? CHARACTER_ONE : CHARACTER_TWO,
            deckId === 'deck_1' ? LEGAL_DECK_ONE : LEGAL_DECK_TWO,
          ),
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
          actorId: CHARACTER_ONE,
          queueIndex: 0,
          kind: 'Attack',
          sourceCreatureId: 'missing_creature',
          target: {
            targetType: 'enemyCharacter',
            targetId: CHARACTER_TWO,
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

  it('sends structured join.rejected when resolved deck is illegal', async () => {
    const port = 47410 + Math.floor(Math.random() * 1000);
    const registry = new SessionRegistry((seed, players) => createEngine(seed, players));
    const service = new GameService(registry);
    const gateway = new WsGateway(service, async (token) => {
      if (token === 'token_1') {
        return { userId: 'player_1' };
      }
      return null;
    });

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          deck: {
            id: 'deck_invalid',
            characterId: '1',
            cards: [{ cardId: '11', quantity: 30 }],
          },
        },
      }),
    } as Response)));

    gateway.start(port);
    gateways.push(gateway);

    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    const messages = createMessageCollector(socket);
    await waitForOpen(socket);

    socket.send(JSON.stringify({ type: 'join', sessionId: 'match-invalid-deck', token: 'token_1', deckId: 'deck_invalid' }));

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

    expect(rejected.sessionId).toBe('match-invalid-deck');
    expect(rejected.code).toBe('deck_invalid');
    expect(rejected.error).toBe('Нельзя добавлять больше 2 копий карты Водяная стрела.');

    socket.close();
  });

  it('rejects second player with the same character in one session', async () => {
    const port = 47420 + Math.floor(Math.random() * 1000);
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

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => buildResolvedDeckPayload('deck_same_char', CHARACTER_ONE, LEGAL_DECK_ONE),
    } as Response)));

    gateway.start(port);
    gateways.push(gateway);

    const playerOne = new WebSocket(`ws://127.0.0.1:${port}`);
    await waitForOpen(playerOne);
    playerOne.send(JSON.stringify({ type: 'join', sessionId: 'match-duplicate-character', token: 'token_1', deckId: 'deck_same_char', seed: 123 }));

    const playerTwo = new WebSocket(`ws://127.0.0.1:${port}`);
    const playerTwoMessages = createMessageCollector(playerTwo);
    await waitForOpen(playerTwo);
    playerTwo.send(JSON.stringify({ type: 'join', sessionId: 'match-duplicate-character', token: 'token_2', deckId: 'deck_same_char' }));

    const rejected = await playerTwoMessages.waitFor<{
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
      sessionId: 'match-duplicate-character',
      code: 'duplicate_character',
      error: 'Character is already taken in this session',
    });

    playerOne.close();
    playerTwo.close();
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

  it('assigns a PvP session and seed when a live invite is accepted', async () => {
    const port = 47460 + Math.floor(Math.random() * 1000);
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
      }, undefined, {
        areFriends: async () => true,
      });

    gateway.start(port);
    gateways.push(gateway);

    const inviter = new WebSocket(`ws://127.0.0.1:${port}`);
    const receiver = new WebSocket(`ws://127.0.0.1:${port}`);
    const inviterMessages = createMessageCollector(inviter);
    const receiverMessages = createMessageCollector(receiver);
    await Promise.all([waitForOpen(inviter), waitForOpen(receiver)]);

    inviter.send(JSON.stringify({ type: 'social.subscribe', token: 'token_1' }));
    receiver.send(JSON.stringify({ type: 'social.subscribe', token: 'token_2' }));

    await inviterMessages.waitFor((message): message is { type: 'social.subscribed' } => message.type === 'social.subscribed');
    await receiverMessages.waitFor((message): message is { type: 'social.subscribed' } => message.type === 'social.subscribed');

    inviter.send(JSON.stringify({ type: 'matchInvite.send', targetUserId: 'player_2' }));
    const receivedInvite = await receiverMessages.waitFor<{
      type: 'matchInvite.received';
      invite: { id: string; status: string };
    }>(
      (message): message is {
        type: 'matchInvite.received';
        invite: { id: string; status: string };
      } =>
        message.type === 'matchInvite.received' &&
        typeof message.invite === 'object' &&
        message.invite !== null &&
        typeof (message.invite as { id?: unknown }).id === 'string',
    );

    receiver.send(JSON.stringify({
      type: 'matchInvite.respond',
      inviteId: receivedInvite.invite.id,
      action: 'accept',
    }));

    const [inviterUpdated, receiverUpdated] = await Promise.all([
      inviterMessages.waitFor<{
        type: 'matchInvite.updated';
        invite: { status: string; sessionId?: string; seed?: number };
      }>(
        (message): message is {
          type: 'matchInvite.updated';
          invite: { status: string; sessionId?: string; seed?: number };
        } =>
          message.type === 'matchInvite.updated' &&
          typeof message.invite === 'object' &&
          message.invite !== null &&
          (message.invite as { status?: unknown }).status === 'accepted' &&
          typeof (message.invite as { sessionId?: unknown }).sessionId === 'string' &&
          typeof (message.invite as { seed?: unknown }).seed === 'number',
      ),
      receiverMessages.waitFor<{
        type: 'matchInvite.updated';
        invite: { status: string; sessionId?: string; seed?: number };
      }>(
        (message): message is {
          type: 'matchInvite.updated';
          invite: { status: string; sessionId?: string; seed?: number };
        } =>
          message.type === 'matchInvite.updated' &&
          typeof message.invite === 'object' &&
          message.invite !== null &&
          (message.invite as { status?: unknown }).status === 'accepted' &&
          typeof (message.invite as { sessionId?: unknown }).sessionId === 'string' &&
          typeof (message.invite as { seed?: unknown }).seed === 'number',
      ),
    ]);

    expect(inviterUpdated.invite.sessionId).toBe(`invite_match_${receivedInvite.invite.id}`);
    expect(receiverUpdated.invite.sessionId).toBe(inviterUpdated.invite.sessionId);
    expect(receiverUpdated.invite.seed).toBe(inviterUpdated.invite.seed);
    expect(inviterUpdated.invite.seed).toBeGreaterThan(0);

    inviter.close();
    receiver.close();
  });

  it('rejects live invite when users are not friends', async () => {
    const port = 47470 + Math.floor(Math.random() * 1000);
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
    }, undefined, {
      areFriends: async () => false,
    });

    gateway.start(port);
    gateways.push(gateway);

    const inviter = new WebSocket(`ws://127.0.0.1:${port}`);
    const inviterMessages = createMessageCollector(inviter);
    const receiver = new WebSocket(`ws://127.0.0.1:${port}`);
    await Promise.all([waitForOpen(inviter), waitForOpen(receiver)]);

    inviter.send(JSON.stringify({ type: 'social.subscribe', token: 'token_1' }));
    receiver.send(JSON.stringify({ type: 'social.subscribe', token: 'token_2' }));

    await inviterMessages.waitFor((message): message is { type: 'social.subscribed' } => message.type === 'social.subscribed');

    inviter.send(JSON.stringify({ type: 'matchInvite.send', targetUserId: 'player_2' }));

    const rejected = await inviterMessages.waitFor<{
      type: 'matchInvite.rejected';
      code: string;
      error: string;
    }>(
      (message): message is {
        type: 'matchInvite.rejected';
        code: string;
        error: string;
      } =>
        message.type === 'matchInvite.rejected' &&
        typeof message.code === 'string' &&
        typeof message.error === 'string',
    );

    expect(rejected).toEqual({
      type: 'matchInvite.rejected',
      code: 'not_friends',
      error: 'Invite is available only for friends',
    });

    inviter.close();
    receiver.close();
  });

  it('broadcasts friends snapshots after realtime friend request actions', async () => {
    const port = 47475 + Math.floor(Math.random() * 1000);
    const registry = new SessionRegistry((seed, players) => createEngine(seed, players));
    const service = new GameService(registry);
    const snapshots = new Map<string, { friends: Array<{ userId: string; username: string; createdAt: string }>; incomingRequests: Array<{ id: string; senderUserId: string; senderUsername: string; receiverUserId: string; receiverUsername: string; status: string; createdAt: string; updatedAt: string }>; outgoingRequests: Array<{ id: string; senderUserId: string; senderUsername: string; receiverUserId: string; receiverUsername: string; status: string; createdAt: string; updatedAt: string }> }>([
      ['player_1', { friends: [], incomingRequests: [], outgoingRequests: [] }],
      ['player_2', { friends: [], incomingRequests: [], outgoingRequests: [] }],
    ]);

    const gateway = new WsGateway(
      service,
      async (token) => {
        if (token === 'token_1') {
          return { userId: 'player_1', username: 'Alpha' };
        }
        if (token === 'token_2') {
          return { userId: 'player_2', username: 'Bravo' };
        }
        return null;
      },
      undefined,
      undefined,
      undefined,
      {
        getSnapshot: async (userId) => snapshots.get(userId) ?? { friends: [], incomingRequests: [], outgoingRequests: [] },
        sendFriendRequest: async (actorUserId, username) => {
          const request = {
            id: 'request_1',
            senderUserId: actorUserId,
            senderUsername: 'Alpha',
            receiverUserId: 'player_2',
            receiverUsername: username,
            status: 'pending' as const,
            createdAt: '2026-04-22T10:00:00.000Z',
            updatedAt: '2026-04-22T10:00:00.000Z',
          };
          snapshots.set('player_1', { friends: [], incomingRequests: [], outgoingRequests: [request] });
          snapshots.set('player_2', { friends: [], incomingRequests: [request], outgoingRequests: [] });
          return request;
        },
        acceptFriendRequest: async () => {
          const request = {
            id: 'request_1',
            senderUserId: 'player_1',
            senderUsername: 'Alpha',
            receiverUserId: 'player_2',
            receiverUsername: 'Bravo',
            status: 'accepted' as const,
            createdAt: '2026-04-22T10:00:00.000Z',
            updatedAt: '2026-04-22T10:05:00.000Z',
          };
          const friendshipCreatedAt = '2026-04-22T10:05:00.000Z';
          snapshots.set('player_1', {
            friends: [{ userId: 'player_2', username: 'Bravo', createdAt: friendshipCreatedAt }],
            incomingRequests: [],
            outgoingRequests: [],
          });
          snapshots.set('player_2', {
            friends: [{ userId: 'player_1', username: 'Alpha', createdAt: friendshipCreatedAt }],
            incomingRequests: [],
            outgoingRequests: [],
          });
          return request;
        },
        declineFriendRequest: async () => {
          throw new Error('not implemented');
        },
        cancelFriendRequest: async () => {
          throw new Error('not implemented');
        },
        deleteFriend: async () => ({ message: 'Друг удалён' }),
      },
    );

    gateway.start(port);
    gateways.push(gateway);

    const playerOne = new WebSocket(`ws://127.0.0.1:${port}`);
    const playerTwo = new WebSocket(`ws://127.0.0.1:${port}`);
    const playerOneMessages = createMessageCollector(playerOne);
    const playerTwoMessages = createMessageCollector(playerTwo);
    await Promise.all([waitForOpen(playerOne), waitForOpen(playerTwo)]);

    playerOne.send(JSON.stringify({ type: 'social.subscribe', token: 'token_1' }));
    playerTwo.send(JSON.stringify({ type: 'social.subscribe', token: 'token_2' }));

    await Promise.all([
      playerOneMessages.waitFor((message): message is { type: 'social.friends.snapshot'; friends: unknown[] } => message.type === 'social.friends.snapshot' && Array.isArray(message.friends)),
      playerTwoMessages.waitFor((message): message is { type: 'social.friends.snapshot'; friends: unknown[] } => message.type === 'social.friends.snapshot' && Array.isArray(message.friends)),
    ]);

    playerOne.send(JSON.stringify({ type: 'friendRequest.send', username: 'Bravo' }));

    const [senderSnapshot, receiverSnapshot] = await Promise.all([
      playerOneMessages.waitFor<{
        type: 'social.friends.snapshot';
        outgoingRequests: Array<{ id: string }>;
      }>(
        (message): message is {
          type: 'social.friends.snapshot';
          outgoingRequests: Array<{ id: string }>;
        } =>
          message.type === 'social.friends.snapshot' &&
          Array.isArray(message.outgoingRequests) &&
          message.outgoingRequests.some((request) => request.id === 'request_1'),
      ),
      playerTwoMessages.waitFor<{
        type: 'social.friends.snapshot';
        incomingRequests: Array<{ id: string }>;
      }>(
        (message): message is {
          type: 'social.friends.snapshot';
          incomingRequests: Array<{ id: string }>;
        } =>
          message.type === 'social.friends.snapshot' &&
          Array.isArray(message.incomingRequests) &&
          message.incomingRequests.some((request) => request.id === 'request_1'),
      ),
    ]);

    expect(senderSnapshot.outgoingRequests).toHaveLength(1);
    expect(receiverSnapshot.incomingRequests).toHaveLength(1);

    playerTwo.send(JSON.stringify({ type: 'friendRequest.accept', requestId: 'request_1' }));

    const [acceptedBySender, acceptedByReceiver] = await Promise.all([
      playerOneMessages.waitFor<{
        type: 'social.friends.snapshot';
        friends: Array<{ userId: string }>;
      }>(
        (message): message is {
          type: 'social.friends.snapshot';
          friends: Array<{ userId: string }>;
        } =>
          message.type === 'social.friends.snapshot' &&
          Array.isArray(message.friends) &&
          message.friends.some((friend) => friend.userId === 'player_2'),
      ),
      playerTwoMessages.waitFor<{
        type: 'social.friends.snapshot';
        friends: Array<{ userId: string }>;
      }>(
        (message): message is {
          type: 'social.friends.snapshot';
          friends: Array<{ userId: string }>;
        } =>
          message.type === 'social.friends.snapshot' &&
          Array.isArray(message.friends) &&
          message.friends.some((friend) => friend.userId === 'player_1'),
      ),
    ]);

    expect(acceptedBySender.friends).toEqual([
      expect.objectContaining({ userId: 'player_2' }),
    ]);
    expect(acceptedByReceiver.friends).toEqual([
      expect.objectContaining({ userId: 'player_1' }),
    ]);

    playerOne.close();
    playerTwo.close();
  });

  it('restores active invites from persistence on social subscribe', async () => {
    const port = 47480 + Math.floor(Math.random() * 1000);
    const now = Date.now();
    const registry = new SessionRegistry((seed, players) => createEngine(seed, players));
    const service = new GameService(registry);
    const gateway = new WsGateway(
      service,
      async (token) => {
        if (token === 'token_2') {
          return { userId: 'player_2', username: 'Bravo' };
        }
        return null;
      },
      undefined,
      undefined,
      {
        listActiveInvitesForUser: async (userId) =>
          userId === 'player_2'
            ? [
                {
                  id: 'invite_1',
                  inviterUserId: 'player_1',
                  inviterUsername: 'Alpha',
                  targetUserId: 'player_2',
                  status: 'accepted',
                  sessionId: 'invite_match_invite_1',
                  seed: 123,
                  createdAt: new Date(now - 60_000).toISOString(),
                  updatedAt: new Date(now - 30_000).toISOString(),
                  expiresAt: new Date(now + 5 * 60_000).toISOString(),
                },
              ]
            : [],
        saveInvite: async () => undefined,
      },
    );

    gateway.start(port);
    gateways.push(gateway);

    const receiver = new WebSocket(`ws://127.0.0.1:${port}`);
    const receiverMessages = createMessageCollector(receiver);
    await waitForOpen(receiver);

    receiver.send(JSON.stringify({ type: 'social.subscribe', token: 'token_2' }));

    const snapshot = await receiverMessages.waitFor<{
      type: 'social.invites.snapshot';
      invites: Array<{ id: string; status: string }>;
    }>(
      (message): message is {
        type: 'social.invites.snapshot';
        invites: Array<{ id: string; status: string }>;
      } =>
        message.type === 'social.invites.snapshot' &&
        Array.isArray(message.invites),
    );
    expect(snapshot.invites).toEqual([
      expect.objectContaining({
        id: 'invite_1',
        status: 'accepted',
      }),
    ]);

    const restoredInvite = await receiverMessages.waitFor<{
      type: 'matchInvite.updated';
      invite: { id: string; status: string; sessionId?: string; seed?: number };
    }>(
      (message): message is {
        type: 'matchInvite.updated';
        invite: { id: string; status: string; sessionId?: string; seed?: number };
      } =>
        message.type === 'matchInvite.updated' &&
        typeof message.invite === 'object' &&
        message.invite !== null &&
        (message.invite as { id?: unknown }).id === 'invite_1',
    );

    expect(restoredInvite.invite).toEqual(
      expect.objectContaining({
        id: 'invite_1',
        inviterUserId: 'player_1',
        inviterUsername: 'Alpha',
        targetUserId: 'player_2',
        status: 'accepted',
        sessionId: 'invite_match_invite_1',
        seed: 123,
      }),
    );

    receiver.close();
  });

  it('marks prepared invite as consumed after both players join the invite match', async () => {
    const port = 47490 + Math.floor(Math.random() * 1000);
    const registry = new SessionRegistry((seed, players) => createEngine(seed, players));
    const service = new GameService(registry);
    const savedInvites: Array<{ status: string; sessionId?: string }> = [];
    const gateway = new WsGateway(
      service,
      async (token) => {
        if (token === 'token_1') {
          return { userId: 'player_1', username: 'Alpha' };
        }
        if (token === 'token_2') {
          return { userId: 'player_2', username: 'Bravo' };
        }
        return null;
      },
      undefined,
      {
        areFriends: async () => true,
      },
      {
        listActiveInvitesForUser: async () => [],
        saveInvite: async (invite) => {
          savedInvites.push({ status: invite.status, sessionId: invite.sessionId });
        },
      },
    );

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const deckId = url.endsWith('/deck_1') ? 'deck_1' : 'deck_2';

      return {
        ok: true,
        json: async () =>
          buildResolvedDeckPayload(
            deckId,
            deckId === 'deck_1' ? CHARACTER_ONE : CHARACTER_TWO,
            deckId === 'deck_1' ? LEGAL_DECK_ONE : LEGAL_DECK_TWO,
          ),
      } as Response;
    }));

    gateway.start(port);
    gateways.push(gateway);

    const inviter = new WebSocket(`ws://127.0.0.1:${port}`);
    const receiver = new WebSocket(`ws://127.0.0.1:${port}`);
    const inviterMessages = createMessageCollector(inviter);
    const receiverMessages = createMessageCollector(receiver);
    await Promise.all([waitForOpen(inviter), waitForOpen(receiver)]);

    inviter.send(JSON.stringify({ type: 'social.subscribe', token: 'token_1' }));
    receiver.send(JSON.stringify({ type: 'social.subscribe', token: 'token_2' }));

    await inviterMessages.waitFor((message): message is { type: 'social.subscribed' } => message.type === 'social.subscribed');
    await receiverMessages.waitFor((message): message is { type: 'social.subscribed' } => message.type === 'social.subscribed');

    inviter.send(JSON.stringify({ type: 'matchInvite.send', targetUserId: 'player_2' }));
    const receivedInvite = await receiverMessages.waitFor<{
      type: 'matchInvite.received';
      invite: { id: string };
    }>(
      (message): message is {
        type: 'matchInvite.received';
        invite: { id: string };
      } =>
        message.type === 'matchInvite.received' &&
        typeof message.invite === 'object' &&
        message.invite !== null &&
        typeof (message.invite as { id?: unknown }).id === 'string',
    );

    receiver.send(
      JSON.stringify({
        type: 'matchInvite.respond',
        inviteId: receivedInvite.invite.id,
        action: 'accept',
      }),
    );

    const accepted = await inviterMessages.waitFor<{
      type: 'matchInvite.updated';
      invite: { status: string; sessionId?: string; seed?: number };
    }>(
      (message): message is {
        type: 'matchInvite.updated';
        invite: { status: string; sessionId?: string; seed?: number };
      } =>
        message.type === 'matchInvite.updated' &&
        typeof message.invite === 'object' &&
        message.invite !== null &&
        (message.invite as { status?: unknown }).status === 'accepted' &&
        typeof (message.invite as { sessionId?: unknown }).sessionId === 'string' &&
        typeof (message.invite as { seed?: unknown }).seed === 'number',
    );

    inviter.send(
      JSON.stringify({
        type: 'join',
        sessionId: accepted.invite.sessionId,
        token: 'token_1',
        deckId: 'deck_1',
        seed: accepted.invite.seed,
      }),
    );
    await inviterMessages.waitFor(
      (message): message is { type: 'state' } => message.type === 'state',
    );

    receiver.send(
      JSON.stringify({
        type: 'join',
        sessionId: accepted.invite.sessionId,
        token: 'token_2',
        deckId: 'deck_2',
      }),
    );

    const consumedUpdate = await inviterMessages.waitFor<{
      type: 'matchInvite.updated';
      invite: { status: string; sessionId?: string };
    }>(
      (message): message is {
        type: 'matchInvite.updated';
        invite: { status: string; sessionId?: string };
      } =>
        message.type === 'matchInvite.updated' &&
        typeof message.invite === 'object' &&
        message.invite !== null &&
        (message.invite as { status?: unknown }).status === 'consumed' &&
        (message.invite as { sessionId?: unknown }).sessionId === accepted.invite.sessionId,
    );

    expect(consumedUpdate.invite.status).toBe('consumed');
    expect(savedInvites.some((invite) => invite.status === 'consumed')).toBe(true);

    inviter.close();
    receiver.close();
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
        json: async () =>
          buildResolvedDeckPayload(
            deckId,
            deckId === 'deck_1' ? CHARACTER_ONE : CHARACTER_TWO,
            deckId === 'deck_1' ? LEGAL_DECK_ONE : LEGAL_DECK_TWO,
          ),
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
        actorId: CHARACTER_ONE,
        queueIndex: 0,
        kind: 'CastSpell',
        cardInstanceId: 'card_player_1_4',
        target: {
          targetId: CHARACTER_TWO,
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
