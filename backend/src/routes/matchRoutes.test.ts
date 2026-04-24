import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import express from 'express';
import type { Server } from 'node:http';
import matchRoutes from './matchRoutes';
import { errorHandler, notFoundHandler } from '../middlewares';
import { AuthService } from '../services/authService';
import { MatchService } from '../services/matchService';
import type { AuthUser, MatchSummary } from '../types';

const authUser: AuthUser = {
  id: 'user_alpha',
  email: 'alpha@example.com',
  username: 'Alpha',
  createdAt: '2026-04-22T00:00:00.000Z',
};

const originalGetUserByToken = AuthService.prototype.getUserByToken;
const originalListByUserId = MatchService.prototype.listByUserId;

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/matches', matchRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};

const listen = async (): Promise<Server> => {
  const app = createApp();
  const server = app.listen(0);

  await new Promise<void>((resolve, reject) => {
    server.once('listening', () => resolve());
    server.once('error', reject);
  });

  return server;
};

const closeServer = async (server: Server): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
};

const requestJson = async (
  server: Server,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: unknown }> => {
  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}${path}`, init);
  return {
    status: response.status,
    body: await response.json(),
  };
};

const createMatchSummary = (overrides: Partial<MatchSummary> = {}): MatchSummary => ({
  matchId: 'match_1',
  status: 'finished',
  createdByUserId: 'user_alpha',
  winnerUserId: 'user_alpha',
  seed: 'seed_1',
  gameCoreVersion: '1',
  rulesVersion: '1',
  endReason: 'victory',
  turnCount: 6,
  actionCount: 18,
  startedAt: '2026-04-22T10:00:00.000Z',
  finishedAt: '2026-04-22T10:15:00.000Z',
  createdAt: '2026-04-22T09:58:00.000Z',
  updatedAt: '2026-04-22T10:15:00.000Z',
  players: [
    {
      id: 'match_player_1',
      matchId: 'match_1',
      userId: 'user_alpha',
      username: 'Alpha',
      playerSlot: 1,
      playerIdInMatch: 'player_1',
      deckId: 'deck_1',
      deckNameSnapshot: 'Aggro Fire',
      deckSnapshot: null,
      isWinner: true,
      finishResult: 'win',
      connectedAt: null,
      disconnectedAt: null,
      createdAt: '2026-04-22T09:58:00.000Z',
    },
  ],
  ...overrides,
});

describe('matchRoutes', () => {
  beforeEach(() => {
    AuthService.prototype.getUserByToken = async () => authUser;
  });

  afterEach(() => {
    AuthService.prototype.getUserByToken = originalGetUserByToken;
    MatchService.prototype.listByUserId = originalListByUserId;
  });

  it('returns an empty match list when the player has no history yet', async () => {
    MatchService.prototype.listByUserId = async () => [];

    const server = await listen();

    try {
      const response = await requestJson(server, '/api/matches', {
        headers: {
          Authorization: 'Bearer token_1',
        },
      });

      assert.equal(response.status, 200);
      assert.deepEqual(response.body, {
        success: true,
        data: {
          matches: [],
        },
      });
    } finally {
      await closeServer(server);
    }
  });

  it('returns a 500 payload when match listing throws', async () => {
    MatchService.prototype.listByUserId = async () => {
      throw new Error('database unavailable');
    };

    const server = await listen();

    try {
      const response = await requestJson(server, '/api/matches', {
        headers: {
          Authorization: 'Bearer token_1',
        },
      });

      assert.equal(response.status, 500);
      assert.deepEqual(response.body, {
        success: false,
        message: 'Something went wrong!',
        error: 'Internal server error',
      });
    } finally {
      await closeServer(server);
    }
  });

  it('returns the authorized user match list', async () => {
    let capturedUserId: string | null = null;

    MatchService.prototype.listByUserId = async (userId) => {
      capturedUserId = userId;
      return [createMatchSummary()];
    };

    const server = await listen();

    try {
      const response = await requestJson(server, '/api/matches', {
        headers: {
          Authorization: 'Bearer token_1',
        },
      });

      assert.equal(response.status, 200);
      assert.equal(capturedUserId, 'user_alpha');
      assert.deepEqual(response.body, {
        success: true,
        data: {
          matches: [createMatchSummary()],
        },
      });
    } finally {
      await closeServer(server);
    }
  });
});
