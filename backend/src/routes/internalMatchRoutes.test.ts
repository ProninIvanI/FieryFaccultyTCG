import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import express from 'express';
import type { Server } from 'node:http';
import internalMatchRoutes from './internalMatchRoutes';
import { errorHandler, notFoundHandler } from '../middlewares';
import { FriendService } from '../services/friendService';
import { MatchInviteService } from '../services/matchInviteService';

const INTERNAL_TOKEN = 'dev-internal-token';
const originalAreFriends = FriendService.prototype.areFriends;
const originalListFriends = FriendService.prototype.listFriends;
const originalListIncomingRequests = FriendService.prototype.listIncomingRequests;
const originalListOutgoingRequests = FriendService.prototype.listOutgoingRequests;
const originalSendRequest = FriendService.prototype.sendRequest;
const originalAcceptRequest = FriendService.prototype.acceptRequest;
const originalDeclineRequest = FriendService.prototype.declineRequest;
const originalCancelRequest = FriendService.prototype.cancelRequest;
const originalDeleteFriend = FriendService.prototype.deleteFriend;
const originalUpsertInvite = MatchInviteService.prototype.upsertInvite;
const originalListInvites = MatchInviteService.prototype.listActiveInvitesForUser;

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/internal', internalMatchRoutes);
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

describe('internalMatchRoutes', () => {
  beforeEach(() => {
    FriendService.prototype.areFriends = async () => ({
      ok: true,
      areFriends: true,
    });
    FriendService.prototype.listFriends = async () => ({
      items: [],
      nextCursor: null,
    });
    FriendService.prototype.listIncomingRequests = async () => ({
      items: [],
      nextCursor: null,
    });
    FriendService.prototype.listOutgoingRequests = async () => ({
      items: [],
      nextCursor: null,
    });
    FriendService.prototype.sendRequest = async () => ({
      ok: true,
      data: {
        id: 'request_1',
        senderUserId: 'user_1',
        senderUsername: 'Alpha',
        receiverUserId: 'user_2',
        receiverUsername: 'Bravo',
        status: 'pending',
        createdAt: '2026-04-22T10:00:00.000Z',
        updatedAt: '2026-04-22T10:00:00.000Z',
      },
    });
    FriendService.prototype.acceptRequest = async () => ({
      ok: true,
      data: {
        id: 'request_1',
        senderUserId: 'user_1',
        senderUsername: 'Alpha',
        receiverUserId: 'user_2',
        receiverUsername: 'Bravo',
        status: 'accepted',
        createdAt: '2026-04-22T10:00:00.000Z',
        updatedAt: '2026-04-22T10:05:00.000Z',
      },
    });
    FriendService.prototype.declineRequest = FriendService.prototype.acceptRequest;
    FriendService.prototype.cancelRequest = FriendService.prototype.acceptRequest;
    FriendService.prototype.deleteFriend = async () => ({
      ok: true,
      message: 'Друг удалён',
    });
    MatchInviteService.prototype.upsertInvite = async (input) => ({
      ok: true,
      data: {
        ...input,
      },
    });
    MatchInviteService.prototype.listActiveInvitesForUser = async () => ({
      ok: true,
      data: [],
    });
  });

  afterEach(() => {
    FriendService.prototype.areFriends = originalAreFriends;
    FriendService.prototype.listFriends = originalListFriends;
    FriendService.prototype.listIncomingRequests = originalListIncomingRequests;
    FriendService.prototype.listOutgoingRequests = originalListOutgoingRequests;
    FriendService.prototype.sendRequest = originalSendRequest;
    FriendService.prototype.acceptRequest = originalAcceptRequest;
    FriendService.prototype.declineRequest = originalDeclineRequest;
    FriendService.prototype.cancelRequest = originalCancelRequest;
    FriendService.prototype.deleteFriend = originalDeleteFriend;
    MatchInviteService.prototype.upsertInvite = originalUpsertInvite;
    MatchInviteService.prototype.listActiveInvitesForUser = originalListInvites;
  });

  it('returns 403 without internal token', async () => {
    const server = await listen();

    try {
      const response = await requestJson(
        server,
        '/api/internal/friends/status?userId=user_1&friendUserId=user_2',
      );

      assert.equal(response.status, 403);
      assert.deepEqual(response.body, {
        success: false,
        error: 'Forbidden',
      });
    } finally {
      await closeServer(server);
    }
  });

  it('returns friendship status for internal clients', async () => {
    let capturedArgs: { userId: string; friendUserId: string } | null = null;

    FriendService.prototype.areFriends = async (userId, friendUserId) => {
      capturedArgs = { userId, friendUserId };
      return {
        ok: true,
        areFriends: false,
      };
    };

    const server = await listen();

    try {
      const response = await requestJson(
        server,
        '/api/internal/friends/status?userId=user_1&friendUserId=user_2',
        {
          headers: {
            'x-internal-token': INTERNAL_TOKEN,
          },
        },
      );

      assert.equal(response.status, 200);
      assert.deepEqual(capturedArgs, {
        userId: 'user_1',
        friendUserId: 'user_2',
      });
      assert.deepEqual(response.body, {
        success: true,
        data: {
          areFriends: false,
        },
      });
    } finally {
      await closeServer(server);
    }
  });

  it('lists active match invites for internal clients', async () => {
    let capturedArgs: { userId: string; now: string } | null = null;

    MatchInviteService.prototype.listActiveInvitesForUser = async (userId, now) => {
      capturedArgs = { userId, now };
      return {
        ok: true,
        data: [
          {
            id: 'invite_1',
            inviterUserId: 'user_1',
            inviterUsername: 'Alpha',
            targetUserId: 'user_2',
            status: 'accepted',
            sessionId: 'invite_match_invite_1',
            seed: 123,
            createdAt: '2026-04-22T10:00:00.000Z',
            updatedAt: '2026-04-22T10:01:00.000Z',
            expiresAt: '2026-04-22T10:02:00.000Z',
          },
        ],
      };
    };

    const server = await listen();

    try {
      const response = await requestJson(
        server,
        '/api/internal/social/invites?userId=user_2&now=2026-04-22T10:01:00.000Z',
        {
          headers: {
            'x-internal-token': INTERNAL_TOKEN,
          },
        },
      );

      assert.equal(response.status, 200);
      assert.deepEqual(capturedArgs, {
        userId: 'user_2',
        now: '2026-04-22T10:01:00.000Z',
      });
      assert.deepEqual(response.body, {
        success: true,
        data: {
          invites: [
            {
              id: 'invite_1',
              inviterUserId: 'user_1',
              inviterUsername: 'Alpha',
              targetUserId: 'user_2',
              status: 'accepted',
              sessionId: 'invite_match_invite_1',
              seed: 123,
              createdAt: '2026-04-22T10:00:00.000Z',
              updatedAt: '2026-04-22T10:01:00.000Z',
              expiresAt: '2026-04-22T10:02:00.000Z',
            },
          ],
        },
      });
    } finally {
      await closeServer(server);
    }
  });

  it('returns social graph snapshot for internal clients', async () => {
    let capturedUserId: string | null = null;

    FriendService.prototype.listFriends = async ({ authUserId }) => {
      capturedUserId = authUserId;
      return {
        items: [
          {
            userId: 'user_2',
            username: 'Bravo',
            createdAt: '2026-04-22T10:00:00.000Z',
          },
        ],
        nextCursor: null,
      };
    };

    const server = await listen();

    try {
      const response = await requestJson(
        server,
        '/api/internal/social/friends?userId=user_1&limit=50',
        {
          headers: {
            'x-internal-token': INTERNAL_TOKEN,
          },
        },
      );

      assert.equal(response.status, 200);
      assert.equal(capturedUserId, 'user_1');
      assert.deepEqual(response.body, {
        success: true,
        data: {
          friends: {
            items: [
              {
                userId: 'user_2',
                username: 'Bravo',
                createdAt: '2026-04-22T10:00:00.000Z',
              },
            ],
            nextCursor: null,
          },
          incomingRequests: {
            items: [],
            nextCursor: null,
          },
          outgoingRequests: {
            items: [],
            nextCursor: null,
          },
        },
      });
    } finally {
      await closeServer(server);
    }
  });

  it('creates friend request for internal clients', async () => {
    let capturedArgs: { actorUserId: string; username: string } | null = null;

    FriendService.prototype.sendRequest = async (actorUserId, username) => {
      capturedArgs = { actorUserId, username };
      return {
        ok: true,
        data: {
          id: 'request_1',
          senderUserId: actorUserId,
          senderUsername: 'Alpha',
          receiverUserId: 'user_2',
          receiverUsername: username,
          status: 'pending',
          createdAt: '2026-04-22T10:00:00.000Z',
          updatedAt: '2026-04-22T10:00:00.000Z',
        },
      };
    };

    const server = await listen();

    try {
      const response = await requestJson(server, '/api/internal/social/friend-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-token': INTERNAL_TOKEN,
        },
        body: JSON.stringify({
          actorUserId: 'user_1',
          username: 'Bravo',
        }),
      });

      assert.equal(response.status, 200);
      assert.deepEqual(capturedArgs, {
        actorUserId: 'user_1',
        username: 'Bravo',
      });
      assert.deepEqual(response.body, {
        success: true,
        data: {
          request: {
            id: 'request_1',
            senderUserId: 'user_1',
            senderUsername: 'Alpha',
            receiverUserId: 'user_2',
            receiverUsername: 'Bravo',
            status: 'pending',
            createdAt: '2026-04-22T10:00:00.000Z',
            updatedAt: '2026-04-22T10:00:00.000Z',
          },
        },
      });
    } finally {
      await closeServer(server);
    }
  });

  it('upserts match invite for internal clients', async () => {
    let capturedInviteId: string | null = null;

    MatchInviteService.prototype.upsertInvite = async (input) => {
      capturedInviteId = input.id;
      return {
        ok: true,
        data: {
          ...input,
        },
      };
    };

    const server = await listen();

    try {
      const response = await requestJson(server, '/api/internal/social/invites/invite_1', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-token': INTERNAL_TOKEN,
        },
        body: JSON.stringify({
          id: 'invite_1',
          inviterUserId: 'user_1',
          inviterUsername: 'Alpha',
          targetUserId: 'user_2',
          status: 'pending',
          createdAt: '2026-04-22T10:00:00.000Z',
          updatedAt: '2026-04-22T10:00:00.000Z',
          expiresAt: '2026-04-22T10:02:00.000Z',
        }),
      });

      assert.equal(response.status, 200);
      assert.equal(capturedInviteId, 'invite_1');
      assert.deepEqual(response.body, {
        success: true,
        data: {
          invite: {
            id: 'invite_1',
            inviterUserId: 'user_1',
            inviterUsername: 'Alpha',
            targetUserId: 'user_2',
            status: 'pending',
            createdAt: '2026-04-22T10:00:00.000Z',
            updatedAt: '2026-04-22T10:00:00.000Z',
            expiresAt: '2026-04-22T10:02:00.000Z',
          },
        },
      });
    } finally {
      await closeServer(server);
    }
  });
});
