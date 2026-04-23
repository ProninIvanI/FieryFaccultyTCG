import { Request, Response } from 'express';
import {
  ApiResponse,
  CompleteMatchInput,
  CreateMatchRecordInput,
  FriendRequestRecordDto,
  MatchInviteListResponse,
  MatchInviteResponse,
  MatchReplayResponse,
  MatchResponse,
  SaveMatchReplayInput,
  SocialGraphSnapshotResponse,
  UpsertMatchInviteInput,
} from '../types';
import { MatchService } from '../services/matchService';
import { FriendService } from '../services/friendService';
import { MatchInviteService } from '../services/matchInviteService';

const matchService = new MatchService();
const friendService = new FriendService();
const matchInviteService = new MatchInviteService();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asNullableString = (value: unknown): string | null =>
  typeof value === 'string' ? value : value === null || value === undefined ? null : null;

const parseCreateMatchInput = (value: unknown): CreateMatchRecordInput | null => {
  if (!isRecord(value) || !Array.isArray(value.players)) {
    return null;
  }

  const players = value.players.map((player) => {
    if (!isRecord(player)) {
      return null;
    }

    if (
      typeof player.id !== 'string' ||
      typeof player.userId !== 'string' ||
      typeof player.playerSlot !== 'number' ||
      typeof player.playerIdInMatch !== 'string'
    ) {
      return null;
    }

    return {
      id: player.id,
      userId: player.userId,
      playerSlot: player.playerSlot,
      playerIdInMatch: player.playerIdInMatch,
      deckId: asNullableString(player.deckId),
      deckNameSnapshot: asNullableString(player.deckNameSnapshot),
      deckSnapshot: player.deckSnapshot ?? null,
      connectedAt: asNullableString(player.connectedAt),
    };
  });

  if (
    typeof value.id !== 'string' ||
    typeof value.matchId !== 'string' ||
    typeof value.status !== 'string' ||
    typeof value.seed !== 'string' ||
    typeof value.gameCoreVersion !== 'string' ||
    typeof value.rulesVersion !== 'string' ||
    players.some((player) => player === null)
  ) {
    return null;
  }

  return {
    id: value.id,
    matchId: value.matchId,
    status: value.status as CreateMatchRecordInput['status'],
    createdByUserId: asNullableString(value.createdByUserId),
    seed: value.seed,
    gameCoreVersion: value.gameCoreVersion,
    rulesVersion: value.rulesVersion,
    startState: value.startState,
    startedAt: asNullableString(value.startedAt),
    lastAppliedActionAt: asNullableString(value.lastAppliedActionAt),
    players: players.filter((player): player is NonNullable<typeof player> => player !== null),
  };
};

const parseCompleteMatchInput = (value: unknown): CompleteMatchInput | null => {
  if (!isRecord(value) || !Array.isArray(value.players)) {
    return null;
  }

  const players = value.players.map((player) => {
    if (
      !isRecord(player) ||
      typeof player.userId !== 'string' ||
      typeof player.isWinner !== 'boolean' ||
      typeof player.finishResult !== 'string'
    ) {
      return null;
    }

    return {
      userId: player.userId,
      isWinner: player.isWinner,
      finishResult: player.finishResult as CompleteMatchInput['players'][number]['finishResult'],
      disconnectedAt: asNullableString(player.disconnectedAt),
    };
  });

  if (
    typeof value.status !== 'string' ||
    typeof value.endReason !== 'string' ||
    typeof value.turnCount !== 'number' ||
    typeof value.actionCount !== 'number' ||
    players.some((player) => player === null)
  ) {
    return null;
  }

  return {
    status: value.status as CompleteMatchInput['status'],
    winnerUserId: asNullableString(value.winnerUserId),
    endReason: value.endReason as CompleteMatchInput['endReason'],
    finalState: value.finalState,
    turnCount: value.turnCount,
    actionCount: value.actionCount,
    finishedAt: asNullableString(value.finishedAt),
    lastAppliedActionAt: asNullableString(value.lastAppliedActionAt),
    players: players.filter((player): player is NonNullable<typeof player> => player !== null),
  };
};

const parseSaveReplayInput = (value: unknown): SaveMatchReplayInput | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.matchId !== 'string' ||
    typeof value.formatVersion !== 'string'
  ) {
    return null;
  }

  return {
    id: value.id,
    matchId: value.matchId,
    formatVersion: value.formatVersion,
    initialContext: value.initialContext,
    commandLog: value.commandLog,
    checkpoints: value.checkpoints ?? null,
    finalHash: asNullableString(value.finalHash),
  };
};

const parseUpsertMatchInviteInput = (value: unknown): UpsertMatchInviteInput | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.inviterUserId !== 'string' ||
    typeof value.targetUserId !== 'string' ||
    typeof value.status !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    typeof value.expiresAt !== 'string'
  ) {
    return null;
  }

  return {
    id: value.id,
    inviterUserId: value.inviterUserId,
    inviterUsername:
      typeof value.inviterUsername === 'string' ? value.inviterUsername : undefined,
    targetUserId: value.targetUserId,
    status: value.status as UpsertMatchInviteInput['status'],
    sessionId: typeof value.sessionId === 'string' ? value.sessionId : undefined,
    seed: typeof value.seed === 'number' ? value.seed : undefined,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    expiresAt: value.expiresAt,
  };
};

export const createInternalMatch = async (
  req: Request,
  res: Response<ApiResponse<MatchResponse>>,
): Promise<void> => {
  const input = parseCreateMatchInput(req.body);
  if (!input) {
    res.status(400).json({ success: false, error: 'Некорректный payload матча' });
    return;
  }

  const match = await matchService.createMatch(input);
  res.status(201).json({ success: true, data: { match } });
};

export const completeInternalMatch = async (
  req: Request,
  res: Response<ApiResponse<MatchResponse>>,
): Promise<void> => {
  const input = parseCompleteMatchInput(req.body);
  if (!input) {
    res.status(400).json({ success: false, error: 'Некорректный payload завершения матча' });
    return;
  }

  const match = await matchService.completeMatch(req.params.matchId, input);
  if (!match) {
    res.status(404).json({ success: false, error: 'Матч не найден' });
    return;
  }

  res.status(200).json({ success: true, data: { match } });
};

export const saveInternalReplay = async (
  req: Request,
  res: Response<ApiResponse<MatchReplayResponse>>,
): Promise<void> => {
  const input = parseSaveReplayInput(req.body);
  if (!input) {
    res.status(400).json({ success: false, error: 'Некорректный payload replay' });
    return;
  }

  const replay = await matchService.saveReplay(input);
  res.status(200).json({ success: true, data: { replay } });
};

export const getInternalFriendshipStatus = async (
  req: Request,
  res: Response<ApiResponse<{ areFriends: boolean }>>,
): Promise<void> => {
  const userId = typeof req.query.userId === 'string' ? req.query.userId : '';
  const friendUserId =
    typeof req.query.friendUserId === 'string' ? req.query.friendUserId : '';

  const result = await friendService.areFriends(userId, friendUserId);
  if (!result.ok) {
    res.status(400).json({ success: false, error: result.error, message: result.code });
    return;
  }

  res.status(200).json({
    success: true,
    data: {
      areFriends: result.areFriends,
    },
  });
};

export const upsertInternalMatchInvite = async (
  req: Request,
  res: Response<ApiResponse<MatchInviteResponse>>,
): Promise<void> => {
  const input = parseUpsertMatchInviteInput(req.body);
  if (!input) {
    res.status(400).json({ success: false, error: 'Некорректный payload invite' });
    return;
  }

  const result = await matchInviteService.upsertInvite(input);
  if (!result.ok) {
    res.status(400).json({ success: false, error: result.error });
    return;
  }

  res.status(200).json({
    success: true,
    data: {
      invite: result.data,
    },
  });
};

export const listInternalActiveMatchInvites = async (
  req: Request,
  res: Response<ApiResponse<MatchInviteListResponse>>,
): Promise<void> => {
  const userId = typeof req.query.userId === 'string' ? req.query.userId : '';
  const now =
    typeof req.query.now === 'string' ? req.query.now : new Date().toISOString();

  const result = await matchInviteService.listActiveInvitesForUser(userId, now);
  if (!result.ok) {
    res.status(400).json({ success: false, error: result.error });
    return;
  }

  res.status(200).json({
    success: true,
    data: {
      invites: result.data,
    },
  });
};

export const getInternalSocialGraphSnapshot = async (
  req: Request,
  res: Response<ApiResponse<SocialGraphSnapshotResponse>>,
): Promise<void> => {
  const userId = typeof req.query.userId === 'string' ? req.query.userId : '';
  const limitRaw = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : undefined;
  const limit = Number.isFinite(limitRaw) ? limitRaw : undefined;

  const [friends, incomingRequests, outgoingRequests] = await Promise.all([
    friendService.listFriends({ authUserId: userId, limit }),
    friendService.listIncomingRequests({ authUserId: userId, limit }),
    friendService.listOutgoingRequests({ authUserId: userId, limit }),
  ]);

  res.status(200).json({
    success: true,
    data: {
      friends,
      incomingRequests,
      outgoingRequests,
    },
  });
};

export const createInternalFriendRequest = async (
  req: Request,
  res: Response<ApiResponse<{ request: FriendRequestRecordDto }>>,
): Promise<void> => {
  const actorUserId = typeof req.body?.actorUserId === 'string' ? req.body.actorUserId : '';
  const username = typeof req.body?.username === 'string' ? req.body.username : '';
  const result = await friendService.sendRequest(actorUserId, username);

  if (!result.ok) {
    res.status(400).json({ success: false, error: result.error, message: result.code });
    return;
  }

  res.status(200).json({
    success: true,
    data: {
      request: result.data,
    },
  });
};

export const acceptInternalFriendRequest = async (
  req: Request,
  res: Response<ApiResponse<{ request: FriendRequestRecordDto }>>,
): Promise<void> => {
  const actorUserId = typeof req.body?.actorUserId === 'string' ? req.body.actorUserId : '';
  const result = await friendService.acceptRequest(actorUserId, req.params.requestId);

  if (!result.ok) {
    res.status(400).json({ success: false, error: result.error, message: result.code });
    return;
  }

  res.status(200).json({
    success: true,
    data: {
      request: result.data,
    },
  });
};

export const declineInternalFriendRequest = async (
  req: Request,
  res: Response<ApiResponse<{ request: FriendRequestRecordDto }>>,
): Promise<void> => {
  const actorUserId = typeof req.body?.actorUserId === 'string' ? req.body.actorUserId : '';
  const result = await friendService.declineRequest(actorUserId, req.params.requestId);

  if (!result.ok) {
    res.status(400).json({ success: false, error: result.error, message: result.code });
    return;
  }

  res.status(200).json({
    success: true,
    data: {
      request: result.data,
    },
  });
};

export const cancelInternalFriendRequest = async (
  req: Request,
  res: Response<ApiResponse<{ request: FriendRequestRecordDto }>>,
): Promise<void> => {
  const actorUserId = typeof req.body?.actorUserId === 'string' ? req.body.actorUserId : '';
  const result = await friendService.cancelRequest(actorUserId, req.params.requestId);

  if (!result.ok) {
    res.status(400).json({ success: false, error: result.error, message: result.code });
    return;
  }

  res.status(200).json({
    success: true,
    data: {
      request: result.data,
    },
  });
};

export const deleteInternalFriend = async (
  req: Request,
  res: Response<ApiResponse<{ message: string }>>,
): Promise<void> => {
  const actorUserId = typeof req.query.actorUserId === 'string' ? req.query.actorUserId : '';
  const result = await friendService.deleteFriend(actorUserId, req.params.friendUserId);

  if (!result.ok) {
    res.status(400).json({ success: false, error: result.error, message: result.code });
    return;
  }

  res.status(200).json({
    success: true,
    data: {
      message: result.message,
    },
  });
};
