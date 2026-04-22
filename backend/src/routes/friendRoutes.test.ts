import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import express from 'express';
import type { Server } from 'node:http';
import friendRoutes from './friendRoutes';
import { errorHandler, notFoundHandler } from '../middlewares';
import { AuthService } from '../services/authService';
import { FriendService } from '../services/friendService';
import type { AuthUser, FriendRequestRecordDto } from '../types';

const authUser: AuthUser = {
  id: 'user_alpha',
  email: 'alpha@example.com',
  username: 'Alpha',
  createdAt: '2026-04-22T00:00:00.000Z',
};

const createRequest = (overrides: Partial<FriendRequestRecordDto> = {}): FriendRequestRecordDto => ({
  id: 'friend_request_1',
  senderUserId: 'user_bravo',
  senderUsername: 'Bravo',
  receiverUserId: 'user_alpha',
  receiverUsername: 'Alpha',
  status: 'pending',
  createdAt: '2026-04-22T00:00:00.000Z',
  updatedAt: '2026-04-22T00:00:00.000Z',
  ...overrides,
});

const originalGetUserByToken = AuthService.prototype.getUserByToken;
const originalListFriends = FriendService.prototype.listFriends;
const originalListIncomingRequests = FriendService.prototype.listIncomingRequests;
const originalListOutgoingRequests = FriendService.prototype.listOutgoingRequests;
const originalSendRequest = FriendService.prototype.sendRequest;
const originalAcceptRequest = FriendService.prototype.acceptRequest;
const originalDeclineRequest = FriendService.prototype.declineRequest;
const originalCancelRequest = FriendService.prototype.cancelRequest;
const originalDeleteFriend = FriendService.prototype.deleteFriend;

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/friends', friendRoutes);
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

describe('friendRoutes', () => {
  beforeEach(() => {
    AuthService.prototype.getUserByToken = async () => authUser;
  });

  afterEach(() => {
    AuthService.prototype.getUserByToken = originalGetUserByToken;
    FriendService.prototype.listFriends = originalListFriends;
    FriendService.prototype.listIncomingRequests = originalListIncomingRequests;
    FriendService.prototype.listOutgoingRequests = originalListOutgoingRequests;
    FriendService.prototype.sendRequest = originalSendRequest;
    FriendService.prototype.acceptRequest = originalAcceptRequest;
    FriendService.prototype.declineRequest = originalDeclineRequest;
    FriendService.prototype.cancelRequest = originalCancelRequest;
    FriendService.prototype.deleteFriend = originalDeleteFriend;
  });

  it('returns 401 when authorization header is missing', async () => {
    const server = await listen();

    try {
      const response = await requestJson(server, '/api/friends');
      assert.equal(response.status, 401);
      assert.deepEqual(response.body, {
        success: false,
        error: 'Не авторизован',
      });
    } finally {
      await closeServer(server);
    }
  });

  it('returns paginated friends list for authorized user', async () => {
    let capturedParams:
      | { authUserId: string; limit?: number; cursor?: string }
      | null = null;

    FriendService.prototype.listFriends = async (params) => {
      capturedParams = params;
      return {
        items: [
          {
            userId: 'user_bravo',
            username: 'Bravo',
            createdAt: '2026-04-22T10:00:00.000Z',
          },
        ],
        nextCursor: 'cursor_next',
      };
    };

    const server = await listen();

    try {
      const response = await requestJson(server, '/api/friends?limit=25&cursor=cursor_1', {
        headers: {
          Authorization: 'Bearer token_1',
        },
      });

      assert.equal(response.status, 200);
      assert.deepEqual(capturedParams, {
        authUserId: 'user_alpha',
        limit: 25,
        cursor: 'cursor_1',
      });
      assert.deepEqual(response.body, {
        success: true,
        data: {
          friends: {
            items: [
              {
                userId: 'user_bravo',
                username: 'Bravo',
                createdAt: '2026-04-22T10:00:00.000Z',
              },
            ],
            nextCursor: 'cursor_next',
          },
        },
      });
    } finally {
      await closeServer(server);
    }
  });

  it('maps service conflict codes for create request', async () => {
    FriendService.prototype.sendRequest = async () => ({
      ok: false,
      code: 'user_not_found',
      error: 'Пользователь не найден',
    });

    const server = await listen();

    try {
      const response = await requestJson(server, '/api/friends/requests', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token_1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: 'Ghost',
        }),
      });

      assert.equal(response.status, 404);
      assert.deepEqual(response.body, {
        success: false,
        error: 'Пользователь не найден',
        message: 'user_not_found',
      });
    } finally {
      await closeServer(server);
    }
  });

  it('returns incoming requests page for authorized user', async () => {
    let capturedParams:
      | { authUserId: string; limit?: number; cursor?: string }
      | null = null;

    FriendService.prototype.listIncomingRequests = async (params) => {
      capturedParams = params;
      return {
        items: [createRequest()],
        nextCursor: 'incoming_cursor_2',
      };
    };

    const server = await listen();

    try {
      const response = await requestJson(
        server,
        '/api/friends/requests/incoming?limit=10&cursor=incoming_cursor_1',
        {
          headers: {
            Authorization: 'Bearer token_1',
          },
        },
      );

      assert.equal(response.status, 200);
      assert.deepEqual(capturedParams, {
        authUserId: 'user_alpha',
        limit: 10,
        cursor: 'incoming_cursor_1',
      });
      assert.deepEqual(response.body, {
        success: true,
        data: {
          requests: {
            items: [createRequest()],
            nextCursor: 'incoming_cursor_2',
          },
        },
      });
    } finally {
      await closeServer(server);
    }
  });

  it('returns outgoing requests page for authorized user', async () => {
    const outgoingRequest = createRequest({
      senderUserId: 'user_alpha',
      senderUsername: 'Alpha',
      receiverUserId: 'user_bravo',
      receiverUsername: 'Bravo',
    });

    FriendService.prototype.listOutgoingRequests = async () => ({
      items: [outgoingRequest],
      nextCursor: null,
    });

    const server = await listen();

    try {
      const response = await requestJson(server, '/api/friends/requests/outgoing', {
        headers: {
          Authorization: 'Bearer token_1',
        },
      });

      assert.equal(response.status, 200);
      assert.deepEqual(response.body, {
        success: true,
        data: {
          requests: {
            items: [outgoingRequest],
            nextCursor: null,
          },
        },
      });
    } finally {
      await closeServer(server);
    }
  });

  it('returns accepted request payload on accept endpoint', async () => {
    FriendService.prototype.acceptRequest = async () => ({
      ok: true,
      data: createRequest({ status: 'accepted' }),
    });

    const server = await listen();

    try {
      const response = await requestJson(
        server,
        '/api/friends/requests/friend_request_1/accept',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer token_1',
          },
        },
      );

      assert.equal(response.status, 200);
      assert.deepEqual(response.body, {
        success: true,
        data: {
          request: createRequest({ status: 'accepted' }),
        },
      });
    } finally {
      await closeServer(server);
    }
  });

  it('returns declined request payload on decline endpoint', async () => {
    FriendService.prototype.declineRequest = async () => ({
      ok: true,
      data: createRequest({ status: 'declined' }),
    });

    const server = await listen();

    try {
      const response = await requestJson(
        server,
        '/api/friends/requests/friend_request_1/decline',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer token_1',
          },
        },
      );

      assert.equal(response.status, 200);
      assert.deepEqual(response.body, {
        success: true,
        data: {
          request: createRequest({ status: 'declined' }),
        },
      });
    } finally {
      await closeServer(server);
    }
  });

  it('maps forbidden error on cancel endpoint', async () => {
    FriendService.prototype.cancelRequest = async () => ({
      ok: false,
      code: 'forbidden',
      error: 'Эта заявка вам не принадлежит',
    });

    const server = await listen();

    try {
      const response = await requestJson(
        server,
        '/api/friends/requests/friend_request_1/cancel',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer token_1',
          },
        },
      );

      assert.equal(response.status, 403);
      assert.deepEqual(response.body, {
        success: false,
        error: 'Эта заявка вам не принадлежит',
        message: 'forbidden',
      });
    } finally {
      await closeServer(server);
    }
  });

  it('returns success payload on delete friend endpoint', async () => {
    let capturedArgs: { authUserId: string; friendUserId: string } | null = null;

    FriendService.prototype.deleteFriend = async (authUserId, friendUserId) => {
      capturedArgs = { authUserId, friendUserId };
      return {
        ok: true,
        message: 'Друг удалён',
      };
    };

    const server = await listen();

    try {
      const response = await requestJson(server, '/api/friends/user_bravo', {
        method: 'DELETE',
        headers: {
          Authorization: 'Bearer token_1',
        },
      });

      assert.equal(response.status, 200);
      assert.deepEqual(capturedArgs, {
        authUserId: 'user_alpha',
        friendUserId: 'user_bravo',
      });
      assert.deepEqual(response.body, {
        success: true,
        data: {
          message: 'Друг удалён',
        },
      });
    } finally {
      await closeServer(server);
    }
  });
});
