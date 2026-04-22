import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FriendService, type FriendModelContract } from './friendService';
import type { CursorPage, FriendRecordDto, FriendRequestRecordDto } from '../types';

const createRequest = (overrides: Partial<FriendRequestRecordDto> = {}): FriendRequestRecordDto => ({
  id: 'friend_request_1',
  senderUserId: 'user_alpha',
  senderUsername: 'Alpha',
  receiverUserId: 'user_bravo',
  receiverUsername: 'Bravo',
  status: 'pending',
  createdAt: '2026-04-22T00:00:00.000Z',
  updatedAt: '2026-04-22T00:00:00.000Z',
  ...overrides,
});

const emptyFriendPage = (): CursorPage<FriendRecordDto> => ({
  items: [],
  nextCursor: null,
});

const emptyRequestPage = (): CursorPage<FriendRequestRecordDto> => ({
  items: [],
  nextCursor: null,
});

const createModelStub = (): FriendModelContract => ({
  findUserByUsername: async (): Promise<{ id: string; username: string } | null> => null,
  findFriendshipByPair: async (): Promise<boolean> => false,
  findPendingRequestBetweenPair: async (): Promise<FriendRequestRecordDto | null> => null,
  createFriendRequest: async (): Promise<FriendRequestRecordDto> => createRequest(),
  findRequestById: async (): Promise<FriendRequestRecordDto | null> => null,
  updateRequestStatus: async (): Promise<FriendRequestRecordDto | null> => null,
  acceptRequest: async () =>
    ({ ok: false as const, reason: 'request_not_found' as const }),
  deleteFriendship: async (...args: [string, string]): Promise<boolean> => {
    void args;
    return false;
  },
  listFriends: async (): Promise<CursorPage<FriendRecordDto>> => emptyFriendPage(),
  listIncomingRequests: async (): Promise<CursorPage<FriendRequestRecordDto>> =>
    emptyRequestPage(),
  listOutgoingRequests: async (): Promise<CursorPage<FriendRequestRecordDto>> =>
    emptyRequestPage(),
});

describe('FriendService', () => {
  it('rejects sending request to self', async () => {
    const model = createModelStub();
    model.findUserByUsername = async () => ({ id: 'user_alpha', username: 'Alpha' });
    const service = new FriendService(model);

    const result = await service.sendRequest('user_alpha', 'Alpha');

    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.equal(result.code, 'self_request_forbidden');
  });

  it('rejects sending duplicate outgoing request', async () => {
    const model = createModelStub();
    model.findUserByUsername = async () => ({ id: 'user_bravo', username: 'Bravo' });
    model.findPendingRequestBetweenPair = async () => createRequest();
    const service = new FriendService(model);

    const result = await service.sendRequest('user_alpha', 'Bravo');

    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.equal(result.code, 'outgoing_request_exists');
  });

  it('rejects sending request when incoming pending request already exists', async () => {
    const model = createModelStub();
    model.findUserByUsername = async () => ({ id: 'user_bravo', username: 'Bravo' });
    model.findPendingRequestBetweenPair = async () =>
      createRequest({
        senderUserId: 'user_bravo',
        senderUsername: 'Bravo',
        receiverUserId: 'user_alpha',
        receiverUsername: 'Alpha',
      });
    const service = new FriendService(model);

    const result = await service.sendRequest('user_alpha', 'Bravo');

    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.equal(result.code, 'incoming_request_exists');
  });

  it('accepts request when receiver owns pending request', async () => {
    const model = createModelStub();
    model.acceptRequest = async () => ({ ok: true as const, request: createRequest({ status: 'accepted' }) });
    const service = new FriendService(model);

    const result = await service.acceptRequest('user_bravo', 'friend_request_1');

    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(result.data.status, 'accepted');
  });

  it('declines request only for receiver', async () => {
    const model = createModelStub();
    model.findRequestById = async () => createRequest();
    const service = new FriendService(model);

    const result = await service.declineRequest('user_other', 'friend_request_1');

    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.equal(result.code, 'forbidden');
  });

  it('cancels request only for sender', async () => {
    const model = createModelStub();
    model.findRequestById = async () => createRequest();
    const service = new FriendService(model);

    const result = await service.cancelRequest('user_other', 'friend_request_1');

    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.equal(result.code, 'forbidden');
  });

  it('deletes friendship by canonical pair', async () => {
    const model = createModelStub();
    let deletedPair: { low: string; high: string } | null = null;
    model.deleteFriendship = async (lowUserId: string, highUserId: string) => {
      deletedPair = { low: lowUserId, high: highUserId };
      return true;
    };
    const service = new FriendService(model);

    const result = await service.deleteFriend('user_zulu', 'user_alpha');

    assert.equal(result.ok, true);
    assert.deepEqual(deletedPair, {
      low: 'user_alpha',
      high: 'user_zulu',
    });
  });
});
