import { afterEach, describe, expect, it } from 'vitest';
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

const waitForMessage = <T>(socket: WebSocket): Promise<T> =>
  new Promise((resolve, reject) => {
    socket.once('message', (data) => {
      try {
        resolve(JSON.parse(data.toString()) as T);
      } catch (error) {
        reject(error);
      }
    });
    socket.once('error', (error) => reject(error));
  });

describe('ws gateway integration', () => {
  const gateways: WsGateway[] = [];

  afterEach(() => {
    gateways.forEach((gateway) => gateway.stop());
    gateways.length = 0;
  });

  it('broadcasts a fresh state to existing players when a second player joins', async () => {
    const port = 45000 + Math.floor(Math.random() * 1000);
    const registry = new SessionRegistry((seed) => createEngine(seed));
    const service = new GameService(registry);
    const gateway = new WsGateway(service);
    gateway.start(port);
    gateways.push(gateway);

    const playerOne = new WebSocket(`ws://127.0.0.1:${port}`);
    await waitForOpen(playerOne);

    playerOne.send(JSON.stringify({ type: 'join', sessionId: 'match-sync', playerId: 'player_1', seed: 123 }));
    const firstJoinState = await waitForMessage<{ type: 'state' }>(playerOne);
    expect(firstJoinState.type).toBe('state');

    const playerTwo = new WebSocket(`ws://127.0.0.1:${port}`);
    await waitForOpen(playerTwo);

    const broadcastToPlayerOne = waitForMessage<{ type: 'state' }>(playerOne);
    const secondJoinState = waitForMessage<{ type: 'state' }>(playerTwo);

    playerTwo.send(JSON.stringify({ type: 'join', sessionId: 'match-sync', playerId: 'player_2' }));

    const [playerOneUpdated, playerTwoUpdated] = await Promise.all([broadcastToPlayerOne, secondJoinState]);

    expect(playerOneUpdated.type).toBe('state');
    expect(playerTwoUpdated.type).toBe('state');

    playerOne.close();
    playerTwo.close();
  });
});
