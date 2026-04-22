import { randomUUID } from 'crypto';
import { CursorPage, FriendRecordDto, FriendRequestRecordDto } from '../types';
import { friendModel, toCanonicalPair } from '../models/friendModel';

type FriendErrorCode =
  | 'user_not_found'
  | 'self_request_forbidden'
  | 'already_friends'
  | 'outgoing_request_exists'
  | 'incoming_request_exists'
  | 'request_not_found'
  | 'request_not_pending'
  | 'forbidden'
  | 'friendship_not_found'
  | 'validation_error';

type FriendFailure = {
  ok: false;
  code: FriendErrorCode;
  error: string;
};

type FriendRequestSuccess = {
  ok: true;
  data: FriendRequestRecordDto;
};

type FriendMutationSuccess = {
  ok: true;
  message: string;
};

type FriendshipStatusSuccess = {
  ok: true;
  areFriends: boolean;
};

export type FriendModelContract = {
  findUserByUsername: typeof friendModel.findUserByUsername;
  findFriendshipByPair: typeof friendModel.findFriendshipByPair;
  findPendingRequestBetweenPair: typeof friendModel.findPendingRequestBetweenPair;
  createFriendRequest: typeof friendModel.createFriendRequest;
  findRequestById: typeof friendModel.findRequestById;
  updateRequestStatus: typeof friendModel.updateRequestStatus;
  acceptRequest: typeof friendModel.acceptRequest;
  deleteFriendship: typeof friendModel.deleteFriendship;
  listFriends: typeof friendModel.listFriends;
  listIncomingRequests: typeof friendModel.listIncomingRequests;
  listOutgoingRequests: typeof friendModel.listOutgoingRequests;
};

const DEFAULT_PAGE_LIMIT = 50;

const normalizeUsername = (username: string): string => username.trim();

const normalizeLimit = (limit?: number): number => {
  if (!limit || !Number.isFinite(limit)) {
    return DEFAULT_PAGE_LIMIT;
  }

  return Math.max(1, Math.min(Math.trunc(limit), 100));
};

const validationFailure = (error: string): FriendFailure => ({
  ok: false,
  code: 'validation_error',
  error,
});

export class FriendService {
  constructor(private readonly model: FriendModelContract = friendModel) {}

  async sendRequest(authUserId: string, username: string): Promise<FriendRequestSuccess | FriendFailure> {
    const normalizedUsername = normalizeUsername(username);
    if (!normalizedUsername) {
      return validationFailure('Никнейм друга обязателен');
    }

    const targetUser = await this.model.findUserByUsername(normalizedUsername);
    if (!targetUser) {
      return { ok: false, code: 'user_not_found', error: 'Пользователь не найден' };
    }

    if (targetUser.id === authUserId) {
      return { ok: false, code: 'self_request_forbidden', error: 'Нельзя отправить заявку самому себе' };
    }

    const pair = toCanonicalPair(authUserId, targetUser.id);
    const existingFriendship = await this.model.findFriendshipByPair(pair.userLowId, pair.userHighId);
    if (existingFriendship) {
      return { ok: false, code: 'already_friends', error: 'Пользователь уже в друзьях' };
    }

    const pendingRequest = await this.model.findPendingRequestBetweenPair(pair.userLowId, pair.userHighId);
    if (pendingRequest) {
      if (pendingRequest.senderUserId === authUserId) {
        return { ok: false, code: 'outgoing_request_exists', error: 'Заявка уже отправлена' };
      }

      return {
        ok: false,
        code: 'incoming_request_exists',
        error: 'У вас уже есть входящая заявка от этого пользователя',
      };
    }

    const request = await this.model.createFriendRequest({
      id: `friend_request_${randomUUID()}`,
      senderUserId: authUserId,
      receiverUserId: targetUser.id,
      userLowId: pair.userLowId,
      userHighId: pair.userHighId,
    });

    return {
      ok: true,
      data: request,
    };
  }

  async acceptRequest(authUserId: string, requestId: string): Promise<FriendRequestSuccess | FriendFailure> {
    if (!requestId.trim()) {
      return validationFailure('Идентификатор заявки обязателен');
    }

    const result = await this.model.acceptRequest({
      requestId,
      friendshipId: `friendship_${randomUUID()}`,
      actorUserId: authUserId,
    });

    if (result.ok) {
      return {
        ok: true,
        data: result.request,
      };
    }

    switch (result.reason) {
      case 'request_not_found':
        return { ok: false, code: 'request_not_found', error: 'Заявка не найдена' };
      case 'forbidden':
        return { ok: false, code: 'forbidden', error: 'Эта заявка вам не принадлежит' };
      case 'request_not_pending':
        return { ok: false, code: 'request_not_pending', error: 'Заявка уже обработана' };
      case 'already_friends':
        return { ok: false, code: 'already_friends', error: 'Пользователь уже в друзьях' };
    }
  }

  async declineRequest(authUserId: string, requestId: string): Promise<FriendRequestSuccess | FriendFailure> {
    if (!requestId.trim()) {
      return validationFailure('Идентификатор заявки обязателен');
    }

    const request = await this.model.findRequestById(requestId);
    if (!request) {
      return { ok: false, code: 'request_not_found', error: 'Заявка не найдена' };
    }

    if (request.receiverUserId !== authUserId) {
      return { ok: false, code: 'forbidden', error: 'Эта заявка вам не принадлежит' };
    }

    if (request.status !== 'pending') {
      return { ok: false, code: 'request_not_pending', error: 'Заявка уже обработана' };
    }

    const updated = await this.model.updateRequestStatus({
      requestId,
      status: 'declined',
    });

    if (!updated) {
      return { ok: false, code: 'request_not_found', error: 'Заявка не найдена' };
    }

    return {
      ok: true,
      data: updated,
    };
  }

  async cancelRequest(authUserId: string, requestId: string): Promise<FriendRequestSuccess | FriendFailure> {
    if (!requestId.trim()) {
      return validationFailure('Идентификатор заявки обязателен');
    }

    const request = await this.model.findRequestById(requestId);
    if (!request) {
      return { ok: false, code: 'request_not_found', error: 'Заявка не найдена' };
    }

    if (request.senderUserId !== authUserId) {
      return { ok: false, code: 'forbidden', error: 'Эта заявка вам не принадлежит' };
    }

    if (request.status !== 'pending') {
      return { ok: false, code: 'request_not_pending', error: 'Заявка уже обработана' };
    }

    const updated = await this.model.updateRequestStatus({
      requestId,
      status: 'cancelled',
    });

    if (!updated) {
      return { ok: false, code: 'request_not_found', error: 'Заявка не найдена' };
    }

    return {
      ok: true,
      data: updated,
    };
  }

  async deleteFriend(authUserId: string, friendUserId: string): Promise<FriendMutationSuccess | FriendFailure> {
    if (!friendUserId.trim()) {
      return validationFailure('Идентификатор друга обязателен');
    }

    const pair = toCanonicalPair(authUserId, friendUserId);
    const deleted = await this.model.deleteFriendship(pair.userLowId, pair.userHighId);
    if (!deleted) {
      return { ok: false, code: 'friendship_not_found', error: 'Друг не найден' };
    }

    return {
      ok: true,
      message: 'Друг удалён',
    };
  }

  async areFriends(userId: string, friendUserId: string): Promise<FriendshipStatusSuccess | FriendFailure> {
    if (!userId.trim() || !friendUserId.trim()) {
      return validationFailure('Идентификаторы пользователей обязательны');
    }

    if (userId === friendUserId) {
      return {
        ok: true,
        areFriends: false,
      };
    }

    const pair = toCanonicalPair(userId, friendUserId);
    const areFriends = await this.model.findFriendshipByPair(pair.userLowId, pair.userHighId);

    return {
      ok: true,
      areFriends,
    };
  }

  async listFriends(params: {
    authUserId: string;
    limit?: number;
    cursor?: string;
  }): Promise<CursorPage<FriendRecordDto>> {
    return this.model.listFriends({
      userId: params.authUserId,
      limit: normalizeLimit(params.limit),
      cursor: params.cursor,
    });
  }

  async listIncomingRequests(params: {
    authUserId: string;
    limit?: number;
    cursor?: string;
  }): Promise<CursorPage<FriendRequestRecordDto>> {
    return this.model.listIncomingRequests({
      userId: params.authUserId,
      limit: normalizeLimit(params.limit),
      cursor: params.cursor,
    });
  }

  async listOutgoingRequests(params: {
    authUserId: string;
    limit?: number;
    cursor?: string;
  }): Promise<CursorPage<FriendRequestRecordDto>> {
    return this.model.listOutgoingRequests({
      userId: params.authUserId,
      limit: normalizeLimit(params.limit),
      cursor: params.cursor,
    });
  }
}
